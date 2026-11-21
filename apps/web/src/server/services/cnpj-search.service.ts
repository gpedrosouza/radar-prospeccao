import {
  CnpjSearchFiltersSchema,
  temAtividadeMista,
  type CnpjSearchFilters,
} from "@radar/shared";
import * as cnaeRepository from "@/server/repositories/cnae.repository";
import { classeFromCnae } from "@/server/repositories/cnae.repository";
import * as cnpjRepository from "@/server/repositories/cnpj.repository";
import * as socioRepository from "@/server/repositories/socio.repository";
import * as radiusSearchService from "@/server/services/radius-search.service";
import * as cityRepository from "@/server/repositories/city.repository";
import { geocodeEnrichmentQueue } from "@/server/queue/geocode-enrichment-queue";
import type { PageResult, FindByFiltersInput } from "@/server/repositories/cnpj.repository";

export type { PageResult };

// ── Enriquecimento de CNAE ────────────────────────────────────────────────────

/** Item da listagem com CNAE traduzido e setor resolvido. */
export type CnpjListItemEnriquecido = PageResult["items"][number] & {
  /** Denominação da subclasse (lookup_cnae). null quando o código não existe no dicionário. */
  cnae_descricao: string | null;
  /** Seção da CNAE 2.0 — o "setor" do ponto de vista do banker. */
  cnae_secao: string | null;
  cnae_divisao: string | null;
  /**
   * QSA (company_socio_agg). null = CNPJ sem quadro societário registrado —
   * o caso normal do empresário individual, não um erro.
   *
   * LGPD: nome e qualificação do decisor apenas. Nenhum CPF trafega até aqui;
   * cpf_cnpj_socio não sai de staging_socio (ver socio-lookup.ts).
   */
  socio_administrador: string | null;
  qualificacao_admin: string | null;
  qtd_socios: number | null;
  tem_socio_estrangeiro: boolean | null;
  /** nº de CNPJs do grupo econômico; null quando o CNPJ não pertence a nenhum. */
  grupo_tamanho: number | null;
  /**
   * Atividades secundárias declaradas (subclasses de 7 dígitos), fora a
   * principal. Lista vazia é o caso majoritário, não ausência de dado.
   */
  cnaes_secundarios: string[];
  /**
   * Principal e algum secundário em lados opostos do balcão (atacado × varejo,
   * indústria × loja). A regra vem de @radar/shared — a mesma função que o
   * export usa, nunca reimplementada aqui.
   */
  atividade_mista: boolean;
};

export interface EnrichedPageResult {
  items: CnpjListItemEnriquecido[];
  nextCursor: bigint | null;
}

/**
 * Anexa descrição e setor aos itens já retornados pela query.
 *
 * Pós-consulta e em memória de propósito: os dicionários são pequenos e ficam
 * em cache de módulo (ver packages/db/src/repositories/cnae-lookup.ts), então
 * isso não custa query nenhuma por item e a busca principal continua idêntica
 * — partition pruning e paginação por cursor intactos.
 */
async function enriquecerComCnae(
  items: PageResult["items"]
): Promise<CnpjListItemEnriquecido[]> {
  if (items.length === 0) return [];

  const [descricoes, estrutura] = await Promise.all([
    cnaeRepository.descricaoMap(),
    cnaeRepository.estruturaMap(),
  ]);

  // QSA resolvido por PÁGINA (uma query indexada para os <=200 itens), nunca
  // por linha e nunca como Map global — company_socio_agg tem ~13,8M linhas.
  // Ver a nota em packages/db/src/repositories/socio-lookup.ts.
  // QSA e CNAEs secundários resolvidos por PÁGINA, em paralelo — nenhum dos
  // dois cabe num Map de módulo (company_socio_agg ~13,8M linhas,
  // company_cnae_secundario na casa das dezenas de milhões).
  const cnpjs = items.map((i) => i.cnpj);
  const [qsa, secundarios] = await Promise.all([
    socioRepository.qsaEnrichmentFor(cnpjs),
    cnaeRepository.secundariosPara(cnpjs),
  ]);

  return items.map((item) => {
    const hierarquia = estrutura.get(classeFromCnae(item.cnae_principal));
    const q = qsa.get(socioRepository.basicoFromCnpj(item.cnpj));
    const sec = secundarios.get(item.cnpj) ?? [];
    return {
      ...item,
      cnae_descricao: descricoes.get(item.cnae_principal) ?? null,
      cnae_secao: hierarquia?.secao_desc ?? null,
      cnae_divisao: hierarquia?.divisao_desc ?? null,
      socio_administrador: q?.socio_administrador ?? null,
      qualificacao_admin: q?.qualificacao_admin ?? null,
      qtd_socios: q?.qtd_socios ?? null,
      tem_socio_estrangeiro: q?.tem_socio_estrangeiro ?? null,
      grupo_tamanho: q?.grupo_tamanho ?? null,
      cnaes_secundarios: sec,
      atividade_mista: temAtividadeMista(item.cnae_principal, sec),
    };
  });
}

// ── Resolução de contexto de busca ───────────────────────────────────────────
//
// company_cnpj.municipio_codigo usa o código de município da Receita Federal
// (TOM), um sistema de numeração independente do código IBGE (cities.codigo_ibge,
// e do filters.municipio_codigo recebido da API). Os dois nunca coincidem —
// por isso toda resolução abaixo passa por cities.municipio_codigo_rf (casado
// por nome+UF em apps/workers/src/scripts/match-municipio-codigo-rf.ts) antes
// de filtrar company_cnpj. Ver CityInRadius e findByCodigoIbge em city.repository.
//
// Regra de negócio central:
//   1. Se lat+lng+raio_km fornecidos → busca municípios no raio.
//        a. Se há municípios no raio: usa os municipio_codigo_rf de todos como
//           filtro (primary path), ignorando os que não têm correspondência.
//           Se o usuário não informou uf explicitamente, infere o conjunto de
//           UFs presentes nesses municípios — mantém partition pruning mesmo
//           numa busca puramente geográfica.
//        b. Se raio retornou vazio + municipio_codigo fornecido: usa só ele (fallback).
//        c. Se raio retornou vazio + sem fallback: busca sem filtro de município.
//   2. Se lat+lng+raio_km não fornecidos + municipio_codigo presente: usa ele diretamente.
//   3. Se nenhum dos dois: busca sem filtro de município (retorna por UF ou tudo).

/** Resultado da resolução geográfica — reutilizável entre searchCnpjs e countCnpjs. */
export interface SearchContext {
  /** Códigos de município da Receita Federal — prontos para filtrar company_cnpj. */
  municipio_codigos: number[] | undefined;
  /** UFs inferidas das cidades do raio; só populado quando filters.uf não foi informado. */
  ufs_inferidas: string[] | undefined;
  /**
   * Valor final de cnae_prefixos: os prefixos digitados pelo usuário ou, na
   * ausência deles, as divisões (2 díg) das seções CNAE escolhidas. É assim
   * que o filtro de setor funciona sem denormalizar seção em company_cnpj.
   * Ver resolveCnaePrefixos em @radar/db.
   */
  cnae_prefixos_resolvidos: string[] | undefined;
}

/** Parte geográfica do contexto, resolvida independente do setor. */
type GeoContext = Omit<SearchContext, "cnae_prefixos_resolvidos">;

/** Resolve um único codigo_ibge (filters.municipio_codigo) para o código Receita Federal. */
async function resolveMunicipioCodigoRf(codigoIbge: number): Promise<number[] | undefined> {
  const city = await cityRepository.findByCodigoIbge(codigoIbge);
  return city?.municipio_codigo_rf != null ? [city.municipio_codigo_rf] : undefined;
}

async function resolveGeoContext(
  filters: CnpjSearchFilters
): Promise<GeoContext> {
  if (
    filters.lat !== undefined &&
    filters.lng !== undefined &&
    filters.raio_km !== undefined
  ) {
    const citiesInRadius = await radiusSearchService.getRadiusCities(
      filters.lat,
      filters.lng,
      filters.raio_km
    );

    if (citiesInRadius.length > 0) {
      const ufs_inferidas =
        filters.uf === undefined
          ? Array.from(new Set(citiesInRadius.map((c) => c.uf)))
          : undefined;
      const municipio_codigos = citiesInRadius
        .map((c) => c.municipio_codigo_rf)
        .filter((codigo): codigo is number => codigo !== null);
      return {
        municipio_codigos: municipio_codigos.length > 0 ? municipio_codigos : undefined,
        ufs_inferidas,
      };
    }

    if (filters.municipio_codigo !== undefined) {
      return {
        municipio_codigos: await resolveMunicipioCodigoRf(filters.municipio_codigo),
        ufs_inferidas: undefined,
      };
    }

    return { municipio_codigos: undefined, ufs_inferidas: undefined };
  }

  if (filters.municipio_codigo !== undefined) {
    return {
      municipio_codigos: await resolveMunicipioCodigoRf(filters.municipio_codigo),
      ufs_inferidas: undefined,
    };
  }

  return { municipio_codigos: undefined, ufs_inferidas: undefined };
}

async function resolveSearchContextFromFilters(
  filters: CnpjSearchFilters
): Promise<SearchContext> {
  const [geo, cnae_prefixos_resolvidos] = await Promise.all([
    resolveGeoContext(filters),
    // Resolvedor compartilhado com os consumers de exportação e contagem
    // (packages/db) — busca, export e count nunca divergem na tradução
    // setor → prefixos nem na precedência entre eles.
    cnaeRepository.resolvePrefixos(filters),
  ]);
  return { ...geo, cnae_prefixos_resolvidos };
}

/**
 * Resolve o contexto geográfico (municípios do raio + UFs inferidas) uma
 * única vez por requisição. O caller (route handler) chama isto uma vez e
 * repassa o resultado para searchCnpjs e countCnpjs, evitando que a busca
 * por raio rode duas vezes (antes cada função resolvia por conta própria).
 */
export async function resolveSearchContext(rawFilters: unknown): Promise<SearchContext> {
  const filters = CnpjSearchFiltersSchema.parse(rawFilters);
  return resolveSearchContextFromFilters(filters);
}

/**
 * Traduz filtros de busca + contexto já resolvido em FindByFiltersInput.
 * Evita duplicação entre searchCnpjs e countCnpjs — e agora também entre
 * apps/web (email-campaign.service reaproveita esta função, mesmo app,
 * sem motivo pra duplicar).
 *
 * Precedência dos campos multi-valor (ufs/municipio_nomes/cnae_prefixos/
 * portes) sobre os singulares (uf/municipio_nome/cnae_prefixo/porte) segue
 * a mesma regra que já existia pra uf vs uf_in: explícito do usuário sempre
 * vence o que foi inferido (ex: uf do raio).
 */
export function buildRepositoryFilters(
  filters: CnpjSearchFilters,
  context: SearchContext
): FindByFiltersInput {
  return {
    uf: filters.uf,
    uf_in:
      filters.uf !== undefined
        ? undefined
        : filters.ufs !== undefined && filters.ufs.length > 0
          ? filters.ufs
          : context.ufs_inferidas,
    municipio_codigos: context.municipio_codigos,
    municipio_nome: filters.municipio_nome,
    municipio_nomes: filters.municipio_nomes,
    situacao: filters.situacao,
    cnae_prefixo: filters.cnae_prefixo,
    // Já resolvido no contexto: prefixos digitados ou, na falta deles, as
    // divisões das seções escolhidas (filtro de Setor).
    cnae_prefixos: context.cnae_prefixos_resolvidos,
    porte: filters.porte,
    portes: filters.portes,
    matriz_filial: filters.matriz_filial,
    natureza_juridica: filters.natureza_juridica,
    naturezas_juridicas: filters.naturezas_juridicas,
    opcao_simples: filters.opcao_simples,
    opcao_mei: filters.opcao_mei,
    data_abertura_de: filters.data_abertura_de,
    data_abertura_ate: filters.data_abertura_ate,
    texto_livre: filters.texto_livre,
    faz_parte_de_grupo: filters.faz_parte_de_grupo,
    qtd_socios_min: filters.qtd_socios_min,
  };
}

// ── API pública ───────────────────────────────────────────────────────────────

/**
 * Ponto de entrada único para buscas de CNPJ.
 *
 * Valida os filtros com Zod e delega a query ao repository. Se `context` não
 * for informado, resolve a busca por raio internamente (uso standalone,
 * ex: testes ou chamadas fora da rota /api/cnpj/companies); quando chamado a
 * partir da rota, o contexto já vem resolvido por resolveSearchContext.
 */
export async function searchCnpjs(
  rawFilters: unknown,
  pagination: { cursor?: bigint; limit: number },
  context?: SearchContext,
  /**
   * "distance" ordena pela distância real até lat/lng (só faz sentido com
   * origem definida e sem cursor — usado pelo Mapa, que sempre pede uma
   * página única). Ignorado nesses dois casos, com fallback silencioso
   * para "id" — não deveria acontecer porque a rota só manda "distance"
   * quando lat/lng estão presentes e não manda cursor, mas cair pro
   * comportamento antigo é mais seguro que lançar.
   */
  orderBy: "id" | "distance" = "id"
): Promise<EnrichedPageResult> {
  const filters = CnpjSearchFiltersSchema.parse(rawFilters);
  const ctx = context ?? (await resolveSearchContextFromFilters(filters));
  const repoFilters = buildRepositoryFilters(filters, ctx);

  if (
    orderBy === "distance" &&
    pagination.cursor === undefined &&
    filters.lat !== undefined &&
    filters.lng !== undefined
  ) {
    const items = await cnpjRepository.findByFiltersNearOrigin(
      repoFilters,
      { lat: filters.lat, lng: filters.lng },
      pagination.limit
    );
    return { items: await enriquecerComCnae(items), nextCursor: null };
  }

  const page = await cnpjRepository.findByFilters(repoFilters, pagination);
  return {
    items: await enriquecerComCnae(page.items),
    nextCursor: page.nextCursor,
  };
}

export interface CountResult {
  /** Número de registros encontrados (limitado ao cap quando exact = false). */
  count: number;
  /** true = contagem exata; false = há mais registros do que o cap informado. */
  exact: boolean;
}

/**
 * Contagem com teto para uso na UI.
 *
 * @param cap Máximo de linhas a verificar (default 10.000). Se houver mais,
 *            retorna { count: cap, exact: false }.
 */
export async function countCnpjs(
  rawFilters: unknown,
  cap = 10_000,
  context?: SearchContext
): Promise<CountResult> {
  const filters = CnpjSearchFiltersSchema.parse(rawFilters);
  const ctx = context ?? (await resolveSearchContextFromFilters(filters));
  const repoFilters = buildRepositoryFilters(filters, ctx);
  return cnpjRepository.countByFiltersCapped(repoFilters, cap);
}

/**
 * Enfileira geocodificação sob demanda (fila geocode-enrichment) para CNPJs
 * sem coordenada. Fire-and-forget: nunca lança, nunca é aguardada pelo
 * caller — a rota GET /api/cnpj/companies chama isto depois de montar a
 * resposta, sem atrasar nem arriscar a busca do usuário por causa de uma
 * falha no Redis/BullMQ.
 */
export function enqueueGeocodeEnrichment(items: Array<{ id: string; uf: string }>): void {
  if (items.length === 0) return;
  geocodeEnrichmentQueue.add("enrich", { items }).catch((err: unknown) => {
    console.error(
      "[cnpj-search] falha ao enfileirar geocode-enrichment:",
      err instanceof Error ? err.message : err
    );
  });
}
