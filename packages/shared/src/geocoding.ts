/**
 * Cascata de geocodificação sob demanda, do mais barato pro mais caro
 * (CLAUDE.md § "Estratégia de geocodificação / enriquecimento externo").
 *
 * Compartilhado entre apps/web (fila de enriquecimento) e apps/workers
 * (consumer + script manual geocode-cnpj.ts). Faz chamadas fetch() —
 * server-only, importar via "@radar/shared/server", nunca em código
 * client-side.
 */

// ── CEP ──────────────────────────────────────────────────────────────────────

/**
 * Extrai o CEP (8 dígitos) do final da string de endereço.
 *
 * company_cnpj não tem coluna cep separada — o campo endereco é uma única
 * string concatenada via CONCAT_WS(' ', tipo_logradouro, logradouro, numero,
 * complemento, bairro, cep) na importação da Receita Federal (ver
 * apps/workers/src/scripts/import-receita/loaders/estabelecimentos.ts, linha
 * ~186), com o CEP sempre como último token. Por isso a extração é ancorada
 * no fim da string — um CEP "perdido" no meio (erro de dado) não conta,
 * porque não dá pra distinguir com confiança de outro número qualquer.
 */
export function extractCepFromEndereco(endereco: string): string | null {
  const match = endereco.trim().match(/(\d{8})\s*$/);
  if (!match) return null;
  const cep = match[1];
  if (cep === "00000000") return null;
  return cep;
}

// ── Google Geocoding (fallback pago final) ─────────────────────────────────────

export class GeocodeRateLimitError extends Error {}

export interface GoogleGeocodeResult {
  lat: number;
  lng: number;
  formatted_address: string;
}

interface GoogleGeocodeResponse {
  status: string;
  error_message?: string;
  results: Array<{
    formatted_address: string;
    geometry: { location: { lat: number; lng: number } };
  }>;
}

/** Monta a string de endereço em texto livre para a Google Geocoding API. */
export function buildGeocodeAddress(input: {
  endereco: string | null;
  municipioNome: string;
  uf: string;
}): string {
  const partes = [input.endereco, `${input.municipioNome} - ${input.uf}`, "Brasil"].filter(
    (p): p is string => Boolean(p)
  );
  return partes.join(", ");
}

/**
 * Chama a Google Geocoding API. Lança GeocodeRateLimitError em
 * OVER_QUERY_LIMIT — sinal para o chamador parar de gastar, não é erro de um
 * endereço específico (mesmo comportamento de geocode-cnpj.ts).
 */
export async function fetchFromGoogleGeocoding(
  address: string,
  apiKey: string
): Promise<GoogleGeocodeResult | null> {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", address);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("region", "br");
  url.searchParams.set("language", "pt-BR");

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as GoogleGeocodeResponse;

  if (data.status === "ZERO_RESULTS") return null;

  if (data.status === "OVER_QUERY_LIMIT") {
    throw new GeocodeRateLimitError("OVER_QUERY_LIMIT: cota da API excedida");
  }

  if (data.status !== "OK") {
    throw new Error(
      `API retornou status "${data.status}"` +
        (data.error_message ? `: ${data.error_message}` : "")
    );
  }

  const first = data.results[0];
  return {
    lat: first.geometry.location.lat,
    lng: first.geometry.location.lng,
    formatted_address: first.formatted_address,
  };
}

// ── BrasilAPI CEP (gratuita, sem chave) ────────────────────────────────────────

export interface BrasilApiCepResult {
  lat: number;
  lng: number;
}

interface BrasilApiCepResponse {
  location?: {
    coordinates?: {
      latitude?: string;
      longitude?: string;
    };
  };
}

/**
 * Consulta a BrasilAPI CEP v2 (https://brasilapi.com.br/api/cep/v2/{cep}).
 * Sem chave, gratuita.
 *
 * NOTA EMPÍRICA (verificada durante a implementação): testado contra ~25 CEPs
 * reais e válidos (capitais e cidades médias, vários estados) — nenhum
 * retornou coordenada (location.coordinates sempre {}). O provedor por trás
 * ("open-cep") parece não popular coordenadas na prática hoje. Mantido na
 * cascata mesmo assim: é gratuito, não bloqueia nada, e passa a contribuir
 * automaticamente se a BrasilAPI (ou o provedor por trás) começar a
 * preencher esse campo — sem precisar mudar código aqui.
 */
export async function fetchFromBrasilApiCep(cep: string): Promise<BrasilApiCepResult | null> {
  const res = await fetch(`https://brasilapi.com.br/api/cep/v2/${cep}`);
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`BrasilAPI CEP: HTTP ${res.status}`);
  }

  const data = (await res.json()) as BrasilApiCepResponse;
  const latRaw = data.location?.coordinates?.latitude;
  const lngRaw = data.location?.coordinates?.longitude;
  if (!latRaw || !lngRaw) return null; // ausência de coordenada = "não resolvido"

  const lat = parseFloat(latRaw);
  const lng = parseFloat(lngRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return { lat, lng };
}

// ── Cascata ───────────────────────────────────────────────────────────────────

export type GeocodeSource = "cnefe_cep" | "cnefe_municipio" | "brasilapi_cep" | "google_geocoding";

export interface GeocodeResult {
  lat: number;
  lng: number;
  source: GeocodeSource;
}

export interface GeocodeCompanyInput {
  endereco: string | null;
  municipioNome: string;
  uf: string;
}

export interface GeocodeCompanyDeps {
  /**
   * Busca o centroide CNEFE do CEP extraído do endereço (ou null se o CEP
   * não bater em cnefe_ceps). Só é chamado quando extractCepFromEndereco
   * conseguiu extrair um CEP plausível do endereço — mais preciso que
   * lookupCnefeCentroid, primeira tentativa da cascata.
   */
  lookupCnefeCep: (cep: string) => Promise<{ lat: number; lng: number } | null>;
  /**
   * Busca o centroide CNEFE do município da empresa (ou null se não houver
   * correspondência). Cada app injeta seu próprio acesso a banco — encapsula
   * a resolução company_cnpj.municipio_codigo (Receita Federal) →
   * cities.codigo_ibge → cnefe_municipio_centroides, já que os dois primeiros
   * usam sistemas de código diferentes (ver cnpj-search.service.ts).
   *
   * Fallback de lookupCnefeCep: usado quando não há CEP extraível do
   * endereço, ou quando o CEP existe mas não tem correspondência em
   * cnefe_ceps (UF ainda não importada em import-cnefe-ceps.ts, por
   * exemplo). LIMITAÇÃO: como endereco é uma string livre (não campos
   * estruturados), esse nível só dá precisão de município, não de CEP — ver
   * comentário na migration 20260721000003_cnefe_municipio_centroides.
   */
  lookupCnefeCentroid: () => Promise<{ lat: number; lng: number } | null>;
  /** undefined desativa a etapa Google (ex: cap de custo do job já atingido). */
  googleApiKey: string | undefined;
}

export interface GeocodeCompanyOutcome {
  result: GeocodeResult | null;
  /**
   * true quando a etapa Google foi de fato chamada (custou uma requisição
   * paga), independente de ter resolvido ou não (ZERO_RESULTS também conta).
   * O chamador usa isso para controlar um teto de chamadas pagas por job —
   * "resolveu" não é a mesma coisa que "não custou".
   */
  googleAttempted: boolean;
}

/**
 * Cascata de geocodificação, do mais barato/preciso pro mais caro. Retorna
 * assim que uma fonte resolver.
 *
 * Ordem: CNEFE por CEP (grátis, instantâneo, precisão de CEP — precisa de
 * CEP extraível do endereço) → CNEFE por município (grátis, instantâneo,
 * precisão de cidade — fallback quando não há CEP ou ele não bate) →
 * BrasilAPI CEP (grátis, também precisa de CEP) → Google Geocoding (pago,
 * fallback final, texto livre endereco+município+UF).
 */
export async function geocodeCompany(
  input: GeocodeCompanyInput,
  deps: GeocodeCompanyDeps
): Promise<GeocodeCompanyOutcome> {
  const cep = input.endereco ? extractCepFromEndereco(input.endereco) : null;

  if (cep) {
    const cnefeCep = await deps.lookupCnefeCep(cep);
    if (cnefeCep) {
      return { result: { ...cnefeCep, source: "cnefe_cep" }, googleAttempted: false };
    }
  }

  const cnefeMunicipio = await deps.lookupCnefeCentroid();
  if (cnefeMunicipio) {
    return { result: { ...cnefeMunicipio, source: "cnefe_municipio" }, googleAttempted: false };
  }

  if (cep) {
    const brasilApi = await fetchFromBrasilApiCep(cep);
    if (brasilApi) {
      return { result: { ...brasilApi, source: "brasilapi_cep" }, googleAttempted: false };
    }
  }

  if (deps.googleApiKey) {
    const address = buildGeocodeAddress(input);
    const google = await fetchFromGoogleGeocoding(address, deps.googleApiKey);
    if (google) {
      return {
        result: { lat: google.lat, lng: google.lng, source: "google_geocoding" },
        googleAttempted: true,
      };
    }
    return { result: null, googleAttempted: true };
  }

  return { result: null, googleAttempted: false };
}
