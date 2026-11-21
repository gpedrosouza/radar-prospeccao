import {
  paramsToFilters,
  filtersToUrlParams,
  filtersToApiParams,
  filtersToApiBody,
} from "../../mapa/_components/utils";
import { type CnpjsFilterState, DEFAULT_CNPJS_FILTERS } from "./types";

/** Dados da Receita Federal vêm em maiúsculas sem acento — normaliza a busca do usuário. */
// Range de combining marks (U+0300–U+036F), casado de propósito após NFD.
const DIACRITICS_RE = /[̀-ͯ]/g;

export function normalizeCidade(value: string): string {
  return value.normalize("NFD").replace(DIACRITICS_RE, "").trim();
}

function parseCsv(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export function cnpjsParamsToFilters(
  params: Record<string, string>
): CnpjsFilterState {
  const base = paramsToFilters(params);
  return {
    ...base,
    ufs: parseCsv(params.uf).map((s) => s.toUpperCase()),
    textoLivre: params.q ?? "",
    cidades: parseCsv(params.cidade),
  };
}

export function cnpjsFiltersToUrlParams(
  filters: CnpjsFilterState
): URLSearchParams {
  const p = filtersToUrlParams(filters);
  if (filters.ufs.length > 0) p.set("uf", filters.ufs.join(","));
  if (filters.textoLivre) p.set("q", filters.textoLivre);
  if (filters.cidades.length > 0) p.set("cidade", filters.cidades.join(","));
  return p;
}

export function cnpjsFiltersToApiParams(
  filters: CnpjsFilterState,
  pagination: { cursor?: string; limit?: number }
): URLSearchParams {
  const p = filtersToApiParams(filters);
  // Override the Mapa default of 2000 with the table page size
  p.set("limit", String(pagination.limit ?? 50));
  if (filters.ufs.length > 0) p.set("ufs", filters.ufs.join(","));
  if (filters.cidades.length > 0) {
    p.set("municipio_nomes", filters.cidades.map(normalizeCidade).join(","));
  }
  if (filters.textoLivre.trim()) p.set("texto_livre", filters.textoLivre.trim());
  if (pagination.cursor) p.set("cursor", pagination.cursor);
  return p;
}

/**
 * Builds the filter object for POST /api/cnpj/export-jobs e POST
 * /api/cnpj/count-jobs — mesmo corpo, os dois aceitam CnpjSearchFilters.
 */
export function filtersToExportBody(
  filters: CnpjsFilterState
): Record<string, unknown> {
  const body = filtersToApiBody(filters);
  if (filters.ufs.length > 0) body.ufs = filters.ufs;
  if (filters.cidades.length > 0) body.municipio_nomes = filters.cidades.map(normalizeCidade);
  if (filters.textoLivre.trim()) body.texto_livre = filters.textoLivre.trim();
  return body;
}

export function isDefaultCnpjsFilters(f: CnpjsFilterState): boolean {
  return JSON.stringify(f) === JSON.stringify(DEFAULT_CNPJS_FILTERS);
}
