/**
 * Queries sobre a tabela cities, incluindo busca por raio via PostGIS.
 *
 * geom é uma coluna GEOGRAPHY(POINT, 4326) persistida a partir de
 * latitude/longitude (migration 20260721000001_cities_geom_index), com
 * índice GIST — ST_DWithin usa o índice em vez de seq scan.
 */

import { prisma } from "@/lib/prisma";

// ── Tipos públicos ────────────────────────────────────────────────────────────

export interface CityInRadius {
  /** Código IBGE — identifica o município, não usado para filtrar company_cnpj. */
  codigo_ibge: number;
  nome: string;
  uf: string;
  distancia_km: number;
  /**
   * Código de município da Receita Federal (company_cnpj.municipio_codigo) —
   * sistema de código independente do IBGE, casado por nome+UF via
   * apps/workers/src/scripts/match-municipio-codigo-rf.ts. Null quando o
   * município não tem correspondência (ver relatório do script).
   */
  municipio_codigo_rf: number | null;
}

// ── Implementação ─────────────────────────────────────────────────────────────

/**
 * Retorna todos os municípios dentro do raio fornecido, ordenados por distância.
 * Usa ST_DWithin sobre a coluna geom (índice GIST) — evita seq scan.
 */
export async function findWithinRadius(
  lat: number,
  lng: number,
  raioKm: number
): Promise<CityInRadius[]> {
  const raioMetros = raioKm * 1000;

  return prisma.$queryRaw<CityInRadius[]>`
    SELECT
      codigo_ibge,
      nome,
      uf::text                                     AS uf,
      municipio_codigo_rf,
      ROUND(
        (ST_Distance(
          geom,
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
        ) / 1000)::numeric,
        2
      )::float                                      AS distancia_km
    FROM cities
    WHERE ST_DWithin(
      geom,
      ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
      ${raioMetros}
    )
    AND categoria = 'municipio'
    ORDER BY distancia_km
  `;
}

/**
 * Busca um único município pelo código IBGE — usado para resolver
 * filters.municipio_codigo (documentado como codigo_ibge) para o código
 * de município da Receita Federal antes de filtrar company_cnpj.
 */
export async function findByCodigoIbge(
  codigoIbge: number
): Promise<{ municipio_codigo_rf: number | null } | null> {
  const rows = await prisma.$queryRaw<{ municipio_codigo_rf: number | null }[]>`
    SELECT municipio_codigo_rf
    FROM cities
    WHERE codigo_ibge = ${codigoIbge}
    LIMIT 1
  `;
  return rows[0] ?? null;
}
