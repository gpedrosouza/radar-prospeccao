import { type MapaFilterState, DEFAULT_FILTERS, DEFAULT_RAIO_KM } from "./types";

/** "6201,4711" → ["6201","4711"]; "" ou ausente → []. */
function parseCsv(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export function paramsToFilters(params: Record<string, string>): MapaFilterState {
  const lat = params.lat ? parseFloat(params.lat) : null;
  const lng = params.lng ? parseFloat(params.lng) : null;
  const raioRaw = params.raio ? parseInt(params.raio, 10) : DEFAULT_RAIO_KM;
  const raioKm = Number.isFinite(raioRaw) && raioRaw >= 10 && raioRaw <= 200 ? raioRaw : DEFAULT_RAIO_KM;
  const tipo = params.tipo ?? "";

  return {
    lat: lat !== null && Number.isFinite(lat) ? lat : null,
    lng: lng !== null && Number.isFinite(lng) ? lng : null,
    label: params.label ?? "",
    raioKm,
    situacao: params.sit ?? "",
    cnaePrefixos: parseCsv(params.cnae),
    portes: parseCsv(params.porte),
    naturezasJuridicas: parseCsv(params.nat),
    cnaeSecoes: parseCsv(params.setor).map((v) => v.toUpperCase()),
    matrizFilial: (["MATRIZ", "FILIAL"].includes(tipo) ? tipo : "") as MapaFilterState["matrizFilial"],
    fazParteDeGrupo: params.grupo === "true",
    opcaoSimples: params.simples === "true",
    opcaoMei: params.mei === "true",
    dataAberturaDE: params.de ?? "",
    dataAberturaATE: params.ate ?? "",
  };
}

export function filtersToUrlParams(filters: MapaFilterState): URLSearchParams {
  const p = new URLSearchParams();
  if (filters.lat !== null) p.set("lat", String(filters.lat));
  if (filters.lng !== null) p.set("lng", String(filters.lng));
  if (filters.label) p.set("label", filters.label);
  if (filters.raioKm !== DEFAULT_RAIO_KM) p.set("raio", String(filters.raioKm));
  if (filters.situacao) p.set("sit", filters.situacao);
  if (filters.cnaePrefixos.length > 0) p.set("cnae", filters.cnaePrefixos.join(","));
  if (filters.portes.length > 0) p.set("porte", filters.portes.join(","));
  if (filters.naturezasJuridicas.length > 0) p.set("nat", filters.naturezasJuridicas.join(","));
  if (filters.cnaeSecoes.length > 0) p.set("setor", filters.cnaeSecoes.join(","));
  if (filters.matrizFilial) p.set("tipo", filters.matrizFilial);
  if (filters.fazParteDeGrupo) p.set("grupo", "true");
  if (filters.opcaoSimples) p.set("simples", "true");
  if (filters.opcaoMei) p.set("mei", "true");
  if (filters.dataAberturaDE) p.set("de", filters.dataAberturaDE);
  if (filters.dataAberturaATE) p.set("ate", filters.dataAberturaATE);
  return p;
}

export function filtersToApiParams(filters: MapaFilterState): URLSearchParams {
  const p = new URLSearchParams();
  if (filters.lat !== null && filters.lng !== null) {
    p.set("lat", String(filters.lat));
    p.set("lng", String(filters.lng));
    p.set("raio_km", String(filters.raioKm));
    // Mapa sempre pede uma página única (sem "carregar mais") — pode pedir
    // ordenação por distância real até a origem em vez de id ASC. Ver
    // findByFiltersNearOrigin em packages/db.
    p.set("sort", "distance");
  }
  if (filters.situacao) p.set("situacao", filters.situacao);
  if (filters.cnaePrefixos.length > 0) {
    const clean = filters.cnaePrefixos.map((c) => c.replace(/\D/g, "")).filter(Boolean);
    if (clean.length > 0) p.set("cnae_prefixos", clean.join(","));
  }
  if (filters.portes.length > 0) p.set("portes", filters.portes.join(","));
  if (filters.naturezasJuridicas.length > 0) {
    p.set("naturezas_juridicas", filters.naturezasJuridicas.join(","));
  }
  if (filters.cnaeSecoes.length > 0) p.set("cnae_secoes", filters.cnaeSecoes.join(","));
  if (filters.matrizFilial) p.set("matriz_filial", filters.matrizFilial);
  if (filters.fazParteDeGrupo) p.set("faz_parte_de_grupo", "true");
  if (filters.opcaoSimples) p.set("opcao_simples", "true");
  if (filters.opcaoMei) p.set("opcao_mei", "true");
  if (filters.dataAberturaDE) p.set("data_abertura_de", filters.dataAberturaDE);
  if (filters.dataAberturaATE) p.set("data_abertura_ate", filters.dataAberturaATE);
  // MAX_LIMIT da rota — o Mapa clusteriza (@googlemaps/markerclusterer),
  // então aguenta o teto máximo sem travar o navegador.
  p.set("limit", "8000");
  return p;
}

/**
 * Builds a typed (não-stringificado) filter body compatível com
 * CnpjSearchFiltersSchema — usado por POST /api/cnpj/export-jobs e
 * POST /api/cnpj/count-jobs. Diferente de filtersToApiParams (que gera
 * URLSearchParams para GET, tudo string): aqui lat/lng/raio_km continuam
 * number e as flags continuam boolean, porque o schema compartilhado usa
 * z.number()/z.boolean() sem coerce (é a mesma validação usada
 * programaticamente pelos workers, não só por query string).
 */
export function filtersToApiBody(filters: MapaFilterState): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (filters.lat !== null && filters.lng !== null) {
    body.lat = filters.lat;
    body.lng = filters.lng;
    body.raio_km = filters.raioKm;
  }
  if (filters.situacao) body.situacao = filters.situacao;
  if (filters.cnaePrefixos.length > 0) {
    const clean = filters.cnaePrefixos.map((c) => c.replace(/\D/g, "")).filter(Boolean);
    if (clean.length > 0) body.cnae_prefixos = clean;
  }
  if (filters.portes.length > 0) body.portes = filters.portes;
  if (filters.naturezasJuridicas.length > 0) {
    body.naturezas_juridicas = filters.naturezasJuridicas;
  }
  if (filters.cnaeSecoes.length > 0) body.cnae_secoes = filters.cnaeSecoes;
  if (filters.matrizFilial) body.matriz_filial = filters.matrizFilial;
  if (filters.fazParteDeGrupo) body.faz_parte_de_grupo = true;
  if (filters.opcaoSimples) body.opcao_simples = true;
  if (filters.opcaoMei) body.opcao_mei = true;
  if (filters.dataAberturaDE) body.data_abertura_de = filters.dataAberturaDE;
  if (filters.dataAberturaATE) body.data_abertura_ate = filters.dataAberturaATE;
  return body;
}

export function formatCnpj(cnpj: string): string {
  return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

export function getSituacaoColor(situacao: string): string {
  const s = situacao.toLowerCase();
  if (s === "ativa") return "#10b981";
  if (s === "inapta" || s === "suspensa") return "#f59e0b";
  if (s === "baixada" || s === "nula") return "#ef4444";
  return "#94a3b8";
}

export function getSituacaoLabel(situacao: string): string {
  return situacao || "—";
}

export function hasActiveFilters(f: MapaFilterState): boolean {
  return (
    f.lat !== null ||
    f.situacao !== "" ||
    f.cnaePrefixos.length > 0 ||
    f.portes.length > 0 ||
    f.naturezasJuridicas.length > 0 ||
    f.cnaeSecoes.length > 0 ||
    f.matrizFilial !== "" ||
    f.opcaoSimples ||
    f.opcaoMei ||
    f.dataAberturaDE !== "" ||
    f.dataAberturaATE !== ""
  );
}

export function countActiveFilters(f: MapaFilterState): number {
  let count = 0;
  if (f.situacao) count++;
  if (f.cnaePrefixos.length > 0) count++;
  if (f.portes.length > 0) count++;
  if (f.naturezasJuridicas.length > 0) count++;
  if (f.cnaeSecoes.length > 0) count++;
  if (f.matrizFilial) count++;
  if (f.opcaoSimples) count++;
  if (f.opcaoMei) count++;
  if (f.dataAberturaDE || f.dataAberturaATE) count++;
  return count;
}

export function isDefaultFilters(f: MapaFilterState): boolean {
  return JSON.stringify(f) === JSON.stringify(DEFAULT_FILTERS);
}
