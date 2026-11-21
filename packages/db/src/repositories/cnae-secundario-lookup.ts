/**
 * Acesso aos CNAEs secundários (company_cnae_secundario), populada pelo passo
 * `cnae-sec` do importador da Receita.
 *
 * Reside em packages/db para que apps/web e apps/workers consumam sem
 * cross-import entre apps (CLAUDE.md regra 1).
 *
 * ── Por que a leitura é por LOTE, e não um Map de módulo ─────────────────────
 * O padrão de cnae-lookup.ts (tabela inteira num Map cacheado) vale lá porque
 * os dicionários têm ~1.3k e ~673 linhas. Aqui não: a tabela tem uma linha por
 * CNPJ × CNAE secundário — na ordem de dezenas de milhões, o mesmo motivo pelo
 * qual socio-lookup.ts também não cacheia company_socio_agg. Um Map global
 * estouraria o heap do worker de exportação antes da primeira linha do CSV.
 *
 * O acesso é o mesmo dos sócios: a exportação pagina de 1.000 em 1.000 e a
 * listagem devolve no máximo 200 itens, então cada chamada resolve só os CNPJs
 * daquela página — uma query pelo prefixo da PK, limitada e previsível.
 */

import { Prisma, type PrismaClient } from "@prisma/client";

/** Mesmo teto de socio-lookup.ts: protege quem chamar com uma lista grande. */
const CHUNK = 5_000;

function chunked<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/** Normaliza para os 14 dígitos gravados na tabela (aceita máscara). */
function normalizarCnpj(cnpj: string): string {
  return cnpj.replace(/\D/g, "").padStart(14, "0").slice(0, 14);
}

/**
 * CNPJ → lista de CNAEs secundários (7 dígitos), ordenada.
 *
 * CNPJs sem secundário simplesmente não aparecem no Map — é o caso majoritário
 * e legítimo, não ausência de dado. O chamador trata como lista vazia.
 */
export async function getCnaeSecundarioFor(
  prisma: PrismaClient,
  cnpjs: string[]
): Promise<Map<string, string[]>> {
  const alvo = Array.from(
    new Set(cnpjs.map(normalizarCnpj).filter((c) => c !== ""))
  );
  if (alvo.length === 0) return new Map();

  const result = new Map<string, string[]>();

  for (const parte of chunked(alvo, CHUNK)) {
    const rows = await prisma.$queryRaw<Array<{ cnpj: string; cnae: string }>>`
      SELECT cnpj, cnae
      FROM company_cnae_secundario
      WHERE cnpj IN (${Prisma.join(parte)})
      ORDER BY cnpj, cnae
    `;
    for (const row of rows) {
      const cnpj = row.cnpj.trim();
      const lista = result.get(cnpj);
      if (lista === undefined) result.set(cnpj, [row.cnae.trim()]);
      else lista.push(row.cnae.trim());
    }
  }

  return result;
}

/**
 * Secundários de UM CNPJ — atalho para a ficha do lead, onde não há página.
 */
export async function getCnaeSecundarioDoCnpj(
  prisma: PrismaClient,
  cnpj: string
): Promise<string[]> {
  const mapa = await getCnaeSecundarioFor(prisma, [cnpj]);
  return mapa.get(normalizarCnpj(cnpj)) ?? [];
}
