/**
 * Factory de repository para CompanyCnpj.
 *
 * Reside em packages/db para que tanto apps/web quanto apps/workers possam
 * importá-lo sem violar a regra de não-importação cruzada entre apps (CLAUDE.md #1).
 *
 * Uso:
 *   import { createCnpjRepository } from "@radar/db";
 *   const repo = createCnpjRepository(prismaInstance);
 *   const page = await repo.findByFilters(filters, { limit: 500 });
 */

import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";

// ── Tipos públicos ────────────────────────────────────────────────────────────

/** Subconjunto de colunas retornado nas listagens e exportações. */
export interface CnpjListItem {
  id: bigint;
  uf: string;
  cnpj: string;
  razao_social: string;
  nome_fantasia: string | null;
  municipio_codigo: number;
  municipio_nome: string;
  cnae_principal: string;
  situacao: string;
  porte: string | null;
  /**
   * Descrição da natureza jurídica ("Empresário (Individual)"), não o código —
   * o importador resolve o código pelo dicionário antes de gravar. Ver
   * classificarTipoPessoa em @radar/shared.
   */
  natureza_juridica: string | null;
  /** Decimal(15,2) serializado como string — number perderia precisão. */
  capital_social: string | null;
  data_abertura: Date | null;
  matriz_filial: string | null;
  email: string | null;
  telefone: string | null;
  endereco: string | null;
  opcao_simples: boolean;
  opcao_mei: boolean;
  latitude: number | null;
  longitude: number | null;
}

/** Filtros já resolvidos (sem parâmetros de raio/geo). */
export interface FindByFiltersInput {
  /** UF única — normalmente selecionada explicitamente pelo usuário. Tem precedência sobre uf_in. */
  uf?: string;
  /**
   * Lista de UFs inferidas (ex: a partir das cidades retornadas por uma busca de raio que
   * cruza fronteira estadual). Só é usada quando `uf` não está definido — habilita partition
   * pruning mesmo sem UF explícita.
   */
  uf_in?: string[];
  /** Códigos IBGE de município — produzidos pelo radius-search ou passados diretamente. */
  municipio_codigos?: number[];
  /** Nome do município (contains, case-insensitive). */
  municipio_nome?: string;
  /** Múltiplos nomes de município (OR de contains) — precedência sobre municipio_nome. */
  municipio_nomes?: string[];
  situacao?: string;
  /** Prefixo CNAE. Gera LIKE 'prefixo%' com índice bpchar_pattern_ops. */
  cnae_prefixo?: string;
  /** Múltiplos prefixos CNAE (OR de LIKE 'prefixo%') — precedência sobre cnae_prefixo. */
  cnae_prefixos?: string[];
  porte?: string;
  /** Múltiplos portes (IN) — precedência sobre porte. */
  portes?: string[];
  matriz_filial?: string;
  opcao_simples?: boolean;
  opcao_mei?: boolean;
  /**
   * Código da natureza jurídica na Receita (ex: "2135"). Traduzido para a
   * descrição correspondente antes de virar cláusula WHERE — a coluna guarda
   * texto, não código. Ver resolveNaturezasJuridicas.
   */
  natureza_juridica?: string;
  /** Múltiplos códigos (IN) — precedência sobre natureza_juridica. */
  naturezas_juridicas?: string[];
  data_abertura_de?: string;
  data_abertura_ate?: string;
  /** Busca livre (OR de razao_social/nome_fantasia contains + cnpj contains). */
  texto_livre?: string;

  // ── Filtros de QSA ──────────────────────────────────────────────────────
  // Vivem em outras tabelas (company_socio_agg / analytics.grupo_economico),
  // unidas por cnpj_basico = substr(cnpj, 1, 8). Viram EXISTS correlacionado
  // em buildWhereRaw; não há como expressá-los no where tipado do Prisma, e
  // por isso findByFilters/countByFiltersCapped caem no caminho raw quando um
  // deles está presente (ver usaFiltroQsa) — nunca são ignorados em silêncio.

  /** true = só CNPJs em grupo econômico; false = só os que não estão em nenhum. */
  faz_parte_de_grupo?: boolean;
  /** Mínimo de sócios no QSA (>=). CNPJs sem QSA nunca satisfazem. */
  qtd_socios_min?: number;
}

/** Um filtro de QSA está ativo? Decide entre o caminho Prisma e o raw. */
export function usaFiltroQsa(filters: FindByFiltersInput): boolean {
  return (
    filters.faz_parte_de_grupo !== undefined ||
    filters.qtd_socios_min !== undefined
  );
}

export interface PageResult {
  items: CnpjListItem[];
  /** null quando não há mais páginas. */
  nextCursor: bigint | null;
}

/** Subconjunto retornado para montagem de listas de destinatários de e-mail. */
export interface CnpjEmailItem {
  cnpj: string;
  uf: string;
  email: string;
  razao_social: string;
  nome_fantasia: string | null;
}

// ── Internos ─────────────────────────────────────────────────────────────────

const LIST_SELECT = {
  id: true,
  uf: true,
  cnpj: true,
  razao_social: true,
  nome_fantasia: true,
  municipio_codigo: true,
  municipio_nome: true,
  cnae_principal: true,
  situacao: true,
  porte: true,
  natureza_juridica: true,
  capital_social: true,
  data_abertura: true,
  matriz_filial: true,
  email: true,
  telefone: true,
  endereco: true,
  opcao_simples: true,
  opcao_mei: true,
  latitude: true,
  longitude: true,
} satisfies Prisma.CompanyCnpjSelect;

/** Linha crua do Prisma antes da normalização de Decimal → string. */
type RawListRow = Omit<CnpjListItem, "capital_social"> & {
  capital_social: Prisma.Decimal | null;
};

/**
 * Decimal do Prisma não é JSON-serializable de forma estável nem comparável
 * como number sem perda — a interface pública expõe string.
 */
function toListItem(row: RawListRow): CnpjListItem {
  return { ...row, capital_social: row.capital_social?.toString() ?? null };
}

/**
 * Traduz códigos de natureza jurídica ("2135") para as descrições gravadas em
 * company_cnpj.natureza_juridica ("Empresário (Individual)").
 *
 * O dicionário (lookup_natureza_juridica, 91 linhas) é estático entre
 * importações, então fica em cache de módulo depois da primeira leitura — o
 * custo por busca é zero e nenhuma query de listagem paga JOIN por linha.
 */
let naturezaLookupCache: Map<string, string> | null = null;

async function getNaturezaLookup(prisma: PrismaClient): Promise<Map<string, string>> {
  if (naturezaLookupCache !== null) return naturezaLookupCache;

  const rows = await prisma.$queryRaw<Array<{ codigo: string; descricao: string }>>`
    SELECT codigo, descricao FROM lookup_natureza_juridica
  `;
  naturezaLookupCache = new Map(rows.map((r) => [r.codigo.trim(), r.descricao]));
  return naturezaLookupCache;
}

/** Normaliza "213-5" → "2135" (formato do dicionário: CHAR(4) sem hífen). */
function normalizarCodigoNatureza(codigo: string): string {
  return codigo.replace(/\D/g, "").padStart(4, "0");
}

/**
 * Códigos → descrições. Retorna undefined quando não há filtro de natureza;
 * array vazio quando os códigos informados não existem no dicionário (IN ()
 * → zero linhas, que é a semântica correta para um código inexistente).
 */
async function resolveNaturezasJuridicas(
  prisma: PrismaClient,
  filters: FindByFiltersInput
): Promise<string[] | undefined> {
  const codigos =
    filters.naturezas_juridicas !== undefined && filters.naturezas_juridicas.length > 0
      ? filters.naturezas_juridicas
      : filters.natureza_juridica !== undefined
        ? [filters.natureza_juridica]
        : undefined;

  if (codigos === undefined) return undefined;

  const lookup = await getNaturezaLookup(prisma);
  return codigos
    .map((c) => lookup.get(normalizarCodigoNatureza(c)))
    .filter((d): d is string => d !== undefined);
}

function buildWhere(
  filters: FindByFiltersInput,
  /** Descrições já resolvidas por resolveNaturezasJuridicas. */
  naturezaDescricoes?: string[]
): Prisma.CompanyCnpjWhereInput {
  const where: Prisma.CompanyCnpjWhereInput = {};

  // Partition pruning: incluir uf sempre que disponível. uf_in é o fallback
  // quando não há uf explícita mas o conjunto de UFs pôde ser inferido
  // (ex: municípios de uma busca por raio) — ainda restringe as partições
  // varridas em vez de fazer scan nas 27.
  if (filters.uf !== undefined) {
    where.uf = filters.uf;
  } else if (filters.uf_in !== undefined && filters.uf_in.length > 0) {
    where.uf = { in: filters.uf_in };
  }

  if (
    filters.municipio_codigos !== undefined &&
    filters.municipio_codigos.length > 0
  ) {
    where.municipio_codigo = { in: filters.municipio_codigos };
  }

  // andGroups acumula condições que precisam de um OR interno (múltiplos
  // valores em campos de texto parcial) — Prisma aceita misturar chaves
  // soltas no `where` (AND implícito) com uma chave `AND` explícita no
  // mesmo objeto, então isso convive com todas as atribuições diretas acima/abaixo.
  const andGroups: Prisma.CompanyCnpjWhereInput[] = [];

  if (filters.municipio_nomes !== undefined && filters.municipio_nomes.length > 0) {
    andGroups.push({
      OR: filters.municipio_nomes.map((nome) => ({
        municipio_nome: { contains: nome, mode: "insensitive" as const },
      })),
    });
  } else if (filters.municipio_nome !== undefined) {
    where.municipio_nome = { contains: filters.municipio_nome, mode: "insensitive" };
  }

  if (filters.situacao !== undefined) where.situacao = filters.situacao;

  // startsWith → LIKE 'prefixo%' aproveitando idx_company_cnpj_cnae_prefix (bpchar_pattern_ops).
  if (filters.cnae_prefixos !== undefined && filters.cnae_prefixos.length > 0) {
    andGroups.push({
      OR: filters.cnae_prefixos.map((prefixo) => ({
        cnae_principal: { startsWith: prefixo },
      })),
    });
  } else if (filters.cnae_prefixo !== undefined) {
    where.cnae_principal = { startsWith: filters.cnae_prefixo };
  }

  // porte é igualdade exata — múltiplos valores viram IN direto, sem precisar de OR.
  if (filters.portes !== undefined && filters.portes.length > 0) {
    where.porte = { in: filters.portes };
  } else if (filters.porte !== undefined) {
    where.porte = filters.porte;
  }

  if (naturezaDescricoes !== undefined)
    where.natureza_juridica = { in: naturezaDescricoes };

  if (filters.matriz_filial !== undefined)
    where.matriz_filial = filters.matriz_filial;
  if (filters.opcao_simples !== undefined)
    where.opcao_simples = filters.opcao_simples;
  if (filters.opcao_mei !== undefined) where.opcao_mei = filters.opcao_mei;

  const dataAberturaFilter: Prisma.DateTimeNullableFilter = {};
  if (filters.data_abertura_de !== undefined)
    dataAberturaFilter.gte = new Date(filters.data_abertura_de);
  if (filters.data_abertura_ate !== undefined)
    dataAberturaFilter.lte = new Date(filters.data_abertura_ate);
  if (Object.keys(dataAberturaFilter).length > 0)
    where.data_abertura = dataAberturaFilter;

  // Busca livre — OR entre razão social, nome fantasia e CNPJ (dígitos).
  // Sempre combinada via AND com o resto dos filtros (uf/município/etc já
  // reduzem bastante o espaço de linhas escaneado antes desse OR rodar).
  if (filters.texto_livre !== undefined) {
    const digits = filters.texto_livre.replace(/\D/g, "");
    andGroups.push({
      OR: [
        { razao_social: { contains: filters.texto_livre, mode: "insensitive" as const } },
        { nome_fantasia: { contains: filters.texto_livre, mode: "insensitive" as const } },
        ...(digits.length > 0 ? [{ cnpj: { contains: digits } }] : []),
      ],
    });
  }

  if (andGroups.length > 0) where.AND = andGroups;

  return where;
}

/**
 * Mesma lógica de buildWhere, em SQL raw parametrizado (Prisma.sql) — usada
 * só por findByFiltersNearOrigin, que precisa ordenar por ST_Distance sobre
 * a coluna geom (Unsupported no client Prisma, não dá pra expressar em
 * orderBy tipado). Mantida ao lado de buildWhere de propósito: qualquer
 * filtro novo precisa ser espelhado aqui também.
 */
function buildWhereRaw(
  filters: FindByFiltersInput,
  naturezaDescricoes?: string[]
): Prisma.Sql {
  const conditions: Prisma.Sql[] = [];

  if (filters.uf !== undefined) {
    conditions.push(Prisma.sql`uf = ${filters.uf}`);
  } else if (filters.uf_in !== undefined && filters.uf_in.length > 0) {
    conditions.push(Prisma.sql`uf IN (${Prisma.join(filters.uf_in)})`);
  }

  if (filters.municipio_codigos !== undefined && filters.municipio_codigos.length > 0) {
    conditions.push(Prisma.sql`municipio_codigo IN (${Prisma.join(filters.municipio_codigos)})`);
  }

  if (filters.municipio_nomes !== undefined && filters.municipio_nomes.length > 0) {
    const ors = filters.municipio_nomes.map(
      (nome) => Prisma.sql`municipio_nome ILIKE ${`%${nome}%`}`
    );
    conditions.push(Prisma.sql`(${Prisma.join(ors, " OR ")})`);
  } else if (filters.municipio_nome !== undefined) {
    conditions.push(Prisma.sql`municipio_nome ILIKE ${`%${filters.municipio_nome}%`}`);
  }

  if (filters.situacao !== undefined) conditions.push(Prisma.sql`situacao = ${filters.situacao}`);

  if (filters.cnae_prefixos !== undefined && filters.cnae_prefixos.length > 0) {
    const ors = filters.cnae_prefixos.map(
      (prefixo) => Prisma.sql`cnae_principal LIKE ${`${prefixo}%`}`
    );
    conditions.push(Prisma.sql`(${Prisma.join(ors, " OR ")})`);
  } else if (filters.cnae_prefixo !== undefined) {
    conditions.push(Prisma.sql`cnae_principal LIKE ${`${filters.cnae_prefixo}%`}`);
  }

  if (filters.portes !== undefined && filters.portes.length > 0) {
    conditions.push(Prisma.sql`porte IN (${Prisma.join(filters.portes)})`);
  } else if (filters.porte !== undefined) {
    conditions.push(Prisma.sql`porte = ${filters.porte}`);
  }
  // IN () é sintaticamente inválido no Postgres — FALSE tem a mesma semântica
  // (código de natureza inexistente no dicionário → zero linhas).
  if (naturezaDescricoes !== undefined) {
    conditions.push(
      naturezaDescricoes.length > 0
        ? Prisma.sql`natureza_juridica IN (${Prisma.join(naturezaDescricoes)})`
        : Prisma.sql`FALSE`
    );
  }

  if (filters.matriz_filial !== undefined)
    conditions.push(Prisma.sql`matriz_filial = ${filters.matriz_filial}`);
  if (filters.opcao_simples !== undefined)
    conditions.push(Prisma.sql`opcao_simples = ${filters.opcao_simples}`);
  if (filters.opcao_mei !== undefined)
    conditions.push(Prisma.sql`opcao_mei = ${filters.opcao_mei}`);
  if (filters.data_abertura_de !== undefined)
    conditions.push(Prisma.sql`data_abertura >= ${new Date(filters.data_abertura_de)}`);
  if (filters.data_abertura_ate !== undefined)
    conditions.push(Prisma.sql`data_abertura <= ${new Date(filters.data_abertura_ate)}`);

  if (filters.texto_livre !== undefined) {
    const digits = filters.texto_livre.replace(/\D/g, "");
    const ors = [
      Prisma.sql`razao_social ILIKE ${`%${filters.texto_livre}%`}`,
      Prisma.sql`nome_fantasia ILIKE ${`%${filters.texto_livre}%`}`,
      ...(digits.length > 0 ? [Prisma.sql`cnpj LIKE ${`%${digits}%`}`] : []),
    ];
    conditions.push(Prisma.sql`(${Prisma.join(ors, " OR ")})`);
  }

  // QSA — subselect correlacionado por cnpj_basico. company_socio_agg e
  // analytics.grupo_economico são acessadas pela PK (CHAR(8)), então cada
  // linha candidata paga um lookup de índice, não um scan.
  if (filters.faz_parte_de_grupo !== undefined) {
    const existe = Prisma.sql`EXISTS (
      SELECT 1 FROM analytics.grupo_economico g
      WHERE g.cnpj_basico = substr(company_cnpj.cnpj, 1, 8)::CHAR(8)
    )`;
    conditions.push(
      filters.faz_parte_de_grupo ? existe : Prisma.sql`NOT ${existe}`
    );
  }

  if (filters.qtd_socios_min !== undefined) {
    conditions.push(Prisma.sql`EXISTS (
      SELECT 1 FROM company_socio_agg a
      WHERE a.cnpj_basico = substr(company_cnpj.cnpj, 1, 8)::CHAR(8)
        AND a.qtd_socios >= ${filters.qtd_socios_min}
    )`);
  }

  return conditions.length > 0 ? Prisma.join(conditions, " AND ") : Prisma.sql`TRUE`;
}

/**
 * Colunas de CnpjListItem em SQL. Extraída porque três caminhos raw
 * (findByFilters com filtro de QSA, findByFiltersNearOrigin e a contagem)
 * projetam exatamente o mesmo conjunto — mantê-la em um lugar só evita que
 * eles divirjam quando uma coluna nova entrar em LIST_SELECT.
 */
const LIST_COLUMNS_SQL = Prisma.sql`
  id, uf, cnpj, razao_social, nome_fantasia, municipio_codigo, municipio_nome,
  cnae_principal, situacao, porte, natureza_juridica, capital_social,
  data_abertura, matriz_filial, email, telefone, endereco,
  opcao_simples, opcao_mei, latitude, longitude
`;

// ── Factory ───────────────────────────────────────────────────────────────────

export function createCnpjRepository(prisma: PrismaClient) {
  return {
    /**
     * Paginação por cursor (NUNCA por OFFSET).
     * Cursor usa o índice (uf, id) quando uf está presente no where.
     */
    async findByFilters(
      filters: FindByFiltersInput,
      pagination: { cursor?: bigint; limit: number }
    ): Promise<PageResult> {
      const naturezas = await resolveNaturezasJuridicas(prisma, filters);

      // Filtro de QSA mora em outra tabela e não cabe no where tipado do
      // Prisma. Cai no raw equivalente — mesma ordenação (id ASC), mesmo
      // cursor, mesmas colunas. Sem QSA, o caminho abaixo é o de sempre,
      // byte a byte.
      if (usaFiltroQsa(filters)) {
        const whereRaw = buildWhereRaw(filters, naturezas);
        const cursorRaw =
          pagination.cursor !== undefined
            ? Prisma.sql`AND id > ${pagination.cursor}`
            : Prisma.empty;

        const rawRows = await prisma.$queryRaw<RawListRow[]>`
          SELECT ${LIST_COLUMNS_SQL}
          FROM company_cnpj
          WHERE ${whereRaw} ${cursorRaw}
          ORDER BY id ASC
          LIMIT ${pagination.limit}
        `;
        const next =
          rawRows.length === pagination.limit
            ? rawRows[rawRows.length - 1].id
            : null;
        return { items: rawRows.map(toListItem), nextCursor: next };
      }

      const where = buildWhere(filters, naturezas);

      if (pagination.cursor !== undefined) {
        where.id = { gt: pagination.cursor };
      }

      const rows = await prisma.companyCnpj.findMany({
        where,
        orderBy: { id: "asc" },
        take: pagination.limit,
        select: LIST_SELECT,
      });

      const nextCursor =
        rows.length === pagination.limit ? rows[rows.length - 1].id : null;

      return { items: rows.map(toListItem), nextCursor };
    },

    /**
     * Variante de findByFilters para o Mapa: em vez de `id ASC`, ordena pela
     * distância real até a origem buscada (ST_Distance sobre geom), com
     * registros ainda não geocodificados (geom IS NULL) sempre por último.
     *
     * Sem paginação por cursor de propósito — o Mapa sempre pede uma página
     * única (limit alto, sem "carregar mais"), então não há necessidade de
     * um cursor composto (distância, id) para continuar de forma estável.
     * A tela de CNPJs e a exportação (que paginam de verdade) continuam em
     * findByFilters/id ASC, sem mudança de comportamento.
     *
     * Motivação: com `id ASC`, um raio que cruza vários municípios podia
     * devolver os N primeiros por id inteiramente de uma cidade vizinha,
     * nunca da cidade buscada — os pins no mapa ficavam sem relação
     * nenhuma com a origem. Ver diagnóstico no histórico do projeto.
     */
    async findByFiltersNearOrigin(
      filters: FindByFiltersInput,
      origin: { lat: number; lng: number },
      limit: number
    ): Promise<CnpjListItem[]> {
      const where = buildWhereRaw(
        filters,
        await resolveNaturezasJuridicas(prisma, filters)
      );
      const rows = await prisma.$queryRaw<RawListRow[]>`
        SELECT ${LIST_COLUMNS_SQL}
        FROM company_cnpj
        WHERE ${where}
        ORDER BY
          (geom IS NULL),
          ST_Distance(geom, ST_SetSRID(ST_MakePoint(${origin.lng}, ${origin.lat}), 4326)::geography)
        LIMIT ${limit}
      `;
      return rows.map(toListItem);
    },

    /** Contagem total para estimativa de progresso na exportação. */
    async countByFilters(filters: FindByFiltersInput): Promise<number> {
      const where = buildWhere(
        filters,
        await resolveNaturezasJuridicas(prisma, filters)
      );
      return prisma.companyCnpj.count({ where });
    },

    /**
     * Retorna empresas com e-mail preenchido que batem com os filtros.
     *
     * Usado pelo email-campaign.service para montar a lista de destinatários
     * antes de excluir bounces/unsubscribes. Capped em `limit` linhas (default
     * 50.000) — implementação de streaming por cursor fica para fase posterior.
     */
    async findByFiltersWithEmail(
      filters: FindByFiltersInput,
      limit = 50_000
    ): Promise<CnpjEmailItem[]> {
      const where = buildWhere(
        filters,
        await resolveNaturezasJuridicas(prisma, filters)
      );
      where.email = { not: null };

      const rows = await prisma.companyCnpj.findMany({
        where,
        orderBy: { id: "asc" },
        take: limit,
        select: {
          cnpj: true,
          uf: true,
          email: true,
          razao_social: true,
          nome_fantasia: true,
        },
      });

      // email é not-null por causa do where.email — cast seguro
      return rows.map((r) => ({ ...r, email: r.email! }));
    },

    /**
     * Contagem com teto para evitar full-scan caro na UI.
     *
     * Estratégia: SELECT id, uf LIMIT cap+1 — aproveita buildWhere (incluindo
     * partition pruning por uf) sem precisar duplicar a cláusula WHERE em SQL raw.
     * Se a contagem real > cap, retorna { count: cap, exact: false }.
     *
     * O EXPLAIN-based estimate foi descartado por ser pouco confiável com
     * múltiplos filtros AND sem ANALYZE recente.
     */
    async countByFiltersCapped(
      filters: FindByFiltersInput,
      cap: number
    ): Promise<{ count: number; exact: boolean }> {
      const naturezas = await resolveNaturezasJuridicas(prisma, filters);

      // Mesmo desvio de findByFilters: sem isto a contagem ignoraria o filtro
      // de QSA e reportaria um total maior do que a listagem devolve.
      if (usaFiltroQsa(filters)) {
        const whereRaw = buildWhereRaw(filters, naturezas);
        const rawProbes = await prisma.$queryRaw<Array<{ id: bigint }>>`
          SELECT id FROM company_cnpj WHERE ${whereRaw} LIMIT ${cap + 1}
        `;
        const exactRaw = rawProbes.length <= cap;
        return { count: exactRaw ? rawProbes.length : cap, exact: exactRaw };
      }

      const where = buildWhere(filters, naturezas);
      const probes = await prisma.companyCnpj.findMany({
        where,
        take: cap + 1,
        select: { id: true, uf: true },
      });
      const exact = probes.length <= cap;
      return { count: exact ? probes.length : cap, exact };
    },

    /**
     * Mapa descrição → código da natureza jurídica, para o caminho inverso do
     * filtro: a linha traz o texto, e a exportação precisa emitir também o
     * código estável da Receita.
     *
     * Lido uma vez por job (91 linhas) — nunca por linha exportada. Descrições
     * duplicadas no dicionário ("Natureza Jurídica não informada" = 0000 e
     * 8885) colapsam no último código, sem impacto prático.
     */
    async getCodigoPorDescricaoNatureza(): Promise<Map<string, string>> {
      const lookup = await getNaturezaLookup(prisma);
      return new Map(Array.from(lookup, ([codigo, descricao]) => [descricao, codigo]));
    },
  };
}

export type CnpjRepository = ReturnType<typeof createCnpjRepository>;
