/**
 * Acesso ao QSA agregado (company_socio_agg) e ao grupo econômico
 * (analytics.grupo_economico).
 *
 * Reside em packages/db para que apps/web e apps/workers consumam sem
 * cross-import entre apps (CLAUDE.md regra 1).
 *
 * ── Por que NÃO existe um getSocioAggMap(prisma) cacheado ────────────────────
 * O padrão de cnae-lookup.ts (carregar a tabela inteira num Map de módulo)
 * funciona lá porque os dicionários têm ~1.3k e ~673 linhas. Aqui não serve:
 * company_socio_agg tem uma linha por cnpj_basico presente em company_cnpj —
 * medido em ~13,8 milhões de linhas (15,2M CNPJs, ~91% de básicos distintos).
 * Um Map com 13,8M chaves de 8 chars apontando para objetos de 6 campos passa
 * de 3 GB de heap: estouraria o worker de exportação antes da primeira linha
 * do CSV, e cada processo web pagaria o mesmo custo.
 *
 * O acesso é, portanto, por LOTE: a exportação pagina de 1.000 em 1.000 e a
 * listagem devolve no máximo 200 itens, então cada chamada resolve o QSA só
 * dos CNPJs daquela página — uma query indexada por PK, limitada e previsível,
 * em vez de uma carga total mantida em memória.
 */

import { Prisma, type PrismaClient } from "@prisma/client";

export interface SocioAgg {
  cnpj_basico: string;
  qtd_socios: number;
  socio_administrador: string | null;
  qualificacao_admin: string | null;
  tem_socio_estrangeiro: boolean;
  tem_socio_pj: boolean;
  data_entrada_admin: Date | null;
}

export interface GrupoEconomico {
  cnpj_basico: string;
  grupo_id: string;
  grupo_tamanho: number;
}

/** QSA de um CNPJ, já unido — o que a listagem e o export consomem. */
export interface QsaEnrichment {
  qtd_socios: number;
  socio_administrador: string | null;
  qualificacao_admin: string | null;
  tem_socio_estrangeiro: boolean;
  tem_socio_pj: boolean;
  /** null quando o CNPJ não faz parte de nenhum grupo (o caso comum). */
  grupo_tamanho: number | null;
}

// ── Derivação pura ────────────────────────────────────────────────────────────

/**
 * CNPJ completo (14 díg) → cnpj_basico (8 díg), a chave de junção do QSA.
 *
 * Normaliza antes de cortar pelo mesmo motivo de classeFromCnae: um CNPJ que
 * perdeu zeros à esquerda em trânsito por JSON/number ainda precisa render o
 * básico certo. Máscaras ("12.345.678/0001-90") também são aceitas.
 */
export function basicoFromCnpj(cnpj: string): string {
  return cnpj.replace(/\D/g, "").padStart(14, "0").slice(0, 8);
}

// ── Leitura por lote ──────────────────────────────────────────────────────────

/**
 * Postgres aceita até 65535 parâmetros por statement. O teto real de uso é
 * bem menor (1.000 por página de export), mas o chunk protege quem chamar com
 * uma lista maior.
 */
const CHUNK = 5_000;

function chunked<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/** Deduplica e descarta vazios — várias filiais compartilham o mesmo básico. */
function normalizeBasicos(basicos: string[]): string[] {
  return Array.from(new Set(basicos.filter((b) => b !== "")));
}

export async function getSocioAggFor(
  prisma: PrismaClient,
  basicos: string[]
): Promise<Map<string, SocioAgg>> {
  const alvo = normalizeBasicos(basicos);
  if (alvo.length === 0) return new Map();

  const result = new Map<string, SocioAgg>();

  for (const parte of chunked(alvo, CHUNK)) {
    const rows = await prisma.$queryRaw<SocioAgg[]>`
      SELECT cnpj_basico, qtd_socios, socio_administrador, qualificacao_admin,
             tem_socio_estrangeiro, tem_socio_pj, data_entrada_admin
      FROM company_socio_agg
      WHERE cnpj_basico IN (${Prisma.join(parte)})
    `;
    for (const row of rows) {
      result.set(row.cnpj_basico.trim(), {
        ...row,
        cnpj_basico: row.cnpj_basico.trim(),
        qtd_socios: Number(row.qtd_socios),
      });
    }
  }

  return result;
}

export async function getGrupoEconomicoFor(
  prisma: PrismaClient,
  basicos: string[]
): Promise<Map<string, GrupoEconomico>> {
  const alvo = normalizeBasicos(basicos);
  if (alvo.length === 0) return new Map();

  const result = new Map<string, GrupoEconomico>();

  for (const parte of chunked(alvo, CHUNK)) {
    const rows = await prisma.$queryRaw<GrupoEconomico[]>`
      SELECT cnpj_basico, grupo_id, grupo_tamanho
      FROM analytics.grupo_economico
      WHERE cnpj_basico IN (${Prisma.join(parte)})
    `;
    for (const row of rows) {
      result.set(row.cnpj_basico.trim(), {
        ...row,
        cnpj_basico: row.cnpj_basico.trim(),
        grupo_id: row.grupo_id.trim(),
        grupo_tamanho: Number(row.grupo_tamanho),
      });
    }
  }

  return result;
}

/**
 * QSA + grupo de uma página de CNPJs, num Map por cnpj_basico.
 *
 * É o ponto de entrada que export e listagem usam: duas queries por página
 * (não por linha), disparadas em paralelo. CNPJs sem QSA simplesmente não
 * aparecem no Map — o chamador trata como "sem informação", que é o caso
 * legítimo de empresário individual sem quadro societário.
 */
export async function getQsaEnrichmentFor(
  prisma: PrismaClient,
  cnpjs: string[]
): Promise<Map<string, QsaEnrichment>> {
  const basicos = normalizeBasicos(cnpjs.map(basicoFromCnpj));
  if (basicos.length === 0) return new Map();

  const [agg, grupo] = await Promise.all([
    getSocioAggFor(prisma, basicos),
    getGrupoEconomicoFor(prisma, basicos),
  ]);

  const result = new Map<string, QsaEnrichment>();
  for (const basico of basicos) {
    const a = agg.get(basico);
    const g = grupo.get(basico);
    if (a === undefined && g === undefined) continue;

    result.set(basico, {
      qtd_socios: a?.qtd_socios ?? 0,
      socio_administrador: a?.socio_administrador ?? null,
      qualificacao_admin: a?.qualificacao_admin ?? null,
      tem_socio_estrangeiro: a?.tem_socio_estrangeiro ?? false,
      tem_socio_pj: a?.tem_socio_pj ?? false,
      grupo_tamanho: g?.grupo_tamanho ?? null,
    });
  }

  return result;
}

/**
 * QSA nominal de UM CNPJ, para a ficha do lead.
 *
 * LGPD: seleciona nome e qualificação, nunca cpf_cnpj_socio. A coluna existe
 * em staging_socio e é usada só como chave de junção do grupo econômico
 * (ver a migration analytics.grupo_economico) — não há caminho de leitura que
 * a exponha à UI ou ao export.
 */
export interface SocioDaFicha {
  nome: string;
  qualificacao: string | null;
  /** "PJ" | "PF" | "Estrangeiro" — derivado de identificador_socio. */
  tipo: string;
  data_entrada: Date | null;
}

export async function getSociosDoCnpj(
  prisma: PrismaClient,
  cnpj: string
): Promise<SocioDaFicha[]> {
  const basico = basicoFromCnpj(cnpj);
  if (basico === "") return [];

  const rows = await prisma.$queryRaw<
    Array<{
      nome: string;
      qualificacao: string | null;
      identificador: string | null;
      data_entrada: Date | null;
    }>
  >`
    SELECT s.nome_socio_razao_social AS nome,
           q.descricao               AS qualificacao,
           s.identificador_socio     AS identificador,
           CASE
             WHEN s.data_entrada_sociedade ~ '^\\d{8}$'
              AND s.data_entrada_sociedade <> '00000000'
             THEN to_date(s.data_entrada_sociedade, 'YYYYMMDD')
             ELSE NULL
           END                       AS data_entrada
    FROM staging_socio s
    LEFT JOIN lookup_qualificacao q ON q.codigo = s.qualificacao_socio
    WHERE s.cnpj_basico = ${basico}
      AND s.nome_socio_razao_social IS NOT NULL
    ORDER BY s.nome_socio_razao_social
  `;

  const TIPO: Record<string, string> = {
    "1": "PJ",
    "2": "PF",
    "3": "Estrangeiro",
  };

  return rows.map((r) => ({
    nome: r.nome,
    qualificacao: r.qualificacao,
    tipo: TIPO[(r.identificador ?? "").trim()] ?? "Não informado",
    data_entrada: r.data_entrada,
  }));
}
