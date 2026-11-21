/**
 * Acesso aos dicionários de CNAE — tradução do código e hierarquia de setor.
 *
 * Reside em packages/db para que apps/web e apps/workers consumam sem
 * cross-import entre apps (CLAUDE.md regra 1).
 *
 * Dois níveis, duas tabelas:
 *   lookup_cnae            subclasse, 7 dígitos — é o que company_cnpj grava
 *                          em cnae_principal. Populada pelo importador da Receita.
 *   lookup_cnae_estrutura  classe, 5 dígitos (CNAE 2.0 do IBGE) → grupo,
 *                          divisão e seção. Populada por
 *                          seeds/import-cnae-estrutura.ts.
 *
 * A ponte entre os dois é posicional: os 5 primeiros dígitos da subclasse são
 * a classe (ver classeFromCnae). Não existe FK — company_cnpj é particionada e
 * não é tocada por esta feature.
 *
 * Ambos os dicionários são pequenos (~1.3k subclasses, 673 classes) e estáticos
 * entre importações, então ficam em cache de módulo após a primeira leitura:
 * nenhuma listagem paga JOIN por linha nem query por item.
 */

import type { PrismaClient } from "@prisma/client";

export interface CnaeEstrutura {
  classe: string;
  classe_desc: string;
  grupo: string | null;
  grupo_desc: string | null;
  divisao: string | null;
  divisao_desc: string | null;
  secao: string | null;
  secao_desc: string | null;
}

/** Uma seção da CNAE 2.0 com as divisões que a compõem — base do filtro de setor. */
export interface CnaeSecao {
  secao: string;
  secao_desc: string;
  /** Divisões de 2 dígitos. Viram prefixos LIKE na busca (ver Parte E). */
  divisoes: string[];
}

// ── Derivação pura ────────────────────────────────────────────────────────────

/**
 * Subclasse (7 díg) → classe (5 díg).
 *
 * Normaliza antes de cortar: um código que perdeu o zero à esquerda em algum
 * trânsito por JSON/number ("810099") ainda precisa virar "08100", não "81009".
 */
export function classeFromCnae(cnae: string): string {
  return cnae.replace(/\D/g, "").padStart(7, "0").slice(0, 5);
}

// ── Cache de módulo ───────────────────────────────────────────────────────────

let descricaoCache: Map<string, string> | null = null;
let estruturaCache: Map<string, CnaeEstrutura> | null = null;

/** Usado por testes e após rodar o seed no mesmo processo. */
export function resetCnaeLookupCache(): void {
  descricaoCache = null;
  estruturaCache = null;
}

/** Map código 7 díg → denominação da subclasse. */
export async function getCnaeDescricaoMap(
  prisma: PrismaClient
): Promise<Map<string, string>> {
  if (descricaoCache !== null) return descricaoCache;

  const rows = await prisma.$queryRaw<Array<{ codigo: string; descricao: string }>>`
    SELECT codigo, descricao FROM lookup_cnae
  `;
  descricaoCache = new Map(rows.map((r) => [r.codigo.trim(), r.descricao]));
  return descricaoCache;
}

/** Map classe 5 díg → hierarquia (grupo, divisão, seção). */
export async function getCnaeEstruturaMap(
  prisma: PrismaClient
): Promise<Map<string, CnaeEstrutura>> {
  if (estruturaCache !== null) return estruturaCache;

  const rows = await prisma.$queryRaw<CnaeEstrutura[]>`
    SELECT classe, classe_desc, grupo, grupo_desc, divisao, divisao_desc, secao, secao_desc
    FROM lookup_cnae_estrutura
  `;
  estruturaCache = new Map(
    rows.map((r) => [
      r.classe.trim(),
      {
        ...r,
        classe: r.classe.trim(),
        grupo: r.grupo?.trim() ?? null,
        divisao: r.divisao?.trim() ?? null,
        secao: r.secao?.trim() ?? null,
      },
    ])
  );
  return estruturaCache;
}

/**
 * Seções com suas divisões, ordenadas — alimenta o seletor de setor na UI e a
 * tradução seção → cnae_prefixos na busca.
 *
 * Derivado do Map já cacheado: não vai ao banco depois da primeira carga.
 */
export async function getCnaeSecoes(prisma: PrismaClient): Promise<CnaeSecao[]> {
  const estrutura = await getCnaeEstruturaMap(prisma);

  const porSecao = new Map<string, { desc: string; divisoes: Set<string> }>();
  for (const item of estrutura.values()) {
    if (item.secao === null || item.divisao === null) continue;
    const atual = porSecao.get(item.secao);
    if (atual === undefined) {
      porSecao.set(item.secao, {
        desc: item.secao_desc ?? item.secao,
        divisoes: new Set([item.divisao]),
      });
    } else {
      atual.divisoes.add(item.divisao);
    }
  }

  return Array.from(porSecao, ([secao, { desc, divisoes }]) => ({
    secao,
    secao_desc: desc,
    divisoes: Array.from(divisoes).sort(),
  })).sort((a, b) => a.secao.localeCompare(b.secao));
}

/**
 * Seções → divisões que as compõem, prontas para virar `cnae_prefixos`.
 *
 * É assim que o filtro de setor evita denormalizar seção em company_cnpj: as
 * divisões são prefixos de 2 dígitos do próprio cnae_principal, então a busca
 * cai no caminho já indexado (LIKE 'NN%' com idx_company_cnpj_cnae_prefix,
 * bpchar_pattern_ops) sem tocar no schema da tabela particionada.
 */
export async function divisoesDasSecoes(
  prisma: PrismaClient,
  secoes: string[]
): Promise<string[]> {
  if (secoes.length === 0) return [];

  const todas = await getCnaeSecoes(prisma);
  const alvo = new Set(secoes.map((s) => s.trim().toUpperCase()));

  return todas
    .filter((s) => alvo.has(s.secao))
    .flatMap((s) => s.divisoes)
    .sort();
}

/**
 * Decide o valor final de `cnae_prefixos` a partir dos filtros do usuário.
 *
 * Vive aqui, e não em cada app, porque a mesma decisão precisa valer na busca
 * (apps/web), na exportação e na contagem (apps/workers) — três caminhos que já
 * duplicam a montagem de FindByFiltersInput e divergiriam na primeira mudança.
 *
 * Precedência: prefixo digitado pelo usuário vence o setor. É a mesma regra de
 * uf vs uf_in aplicada em todo o resto do código — o explícito sempre vence o
 * derivado.
 */
export async function resolveCnaePrefixos(
  prisma: PrismaClient,
  filtros: {
    cnae_prefixo?: string;
    cnae_prefixos?: string[];
    cnae_secoes?: string[];
  }
): Promise<string[] | undefined> {
  if (filtros.cnae_prefixos !== undefined && filtros.cnae_prefixos.length > 0) {
    return filtros.cnae_prefixos;
  }
  if (filtros.cnae_prefixo !== undefined) return undefined;
  if (filtros.cnae_secoes === undefined || filtros.cnae_secoes.length === 0) {
    return undefined;
  }

  const divisoes = await divisoesDasSecoes(prisma, filtros.cnae_secoes);
  return divisoes.length > 0 ? divisoes : undefined;
}
