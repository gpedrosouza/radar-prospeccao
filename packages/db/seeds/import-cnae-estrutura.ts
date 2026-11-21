/**
 * Popula lookup_cnae_estrutura a partir de seeds/cnae-estrutura.csv.
 *
 * Reference data do banco vive em packages/db (não em apps/workers) para que
 * web e workers consumam sem cross-import entre apps — ver CLAUDE.md regra 1.
 *
 * A tabela guarda a hierarquia da CNAE 2.0 (IBGE) no nível classe (5 dígitos).
 * lookup_cnae, populada pelo importador da Receita, é subclasse (7 dígitos):
 * os 5 primeiros dígitos da subclasse são a classe, e é por ela que se chega a
 * grupo / divisão / seção. Ver classeFromCnae em src/repositories/cnae-lookup.ts.
 *
 * Idempotente: TRUNCATE + INSERT dentro de uma transação. Roda antes ou depois
 * do importador da Receita, em qualquer ordem.
 *
 * Uso: npm run seed:cnae-estrutura --workspace=packages/db
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse/sync";
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

interface LinhaCsv {
  classe: string;
  classe_desc: string;
  grupo: string;
  grupo_desc: string;
  divisao: string;
  divisao_desc: string;
  secao: string;
  secao_desc: string;
}

/**
 * Mesma DDL de apps/workers/src/scripts/import-receita/schema.ts — repetida
 * aqui de propósito para o seed rodar num banco onde o importador da Receita
 * ainda não passou (CREATE TABLE IF NOT EXISTS torna as duas convergentes).
 */
const DDL = `
  CREATE TABLE IF NOT EXISTS lookup_cnae_estrutura (
    classe       CHAR(5) PRIMARY KEY,
    classe_desc  TEXT NOT NULL,
    grupo        CHAR(3),
    grupo_desc   TEXT,
    divisao      CHAR(2),
    divisao_desc TEXT,
    secao        CHAR(1),
    secao_desc   TEXT
  );
`;

/** Zero à esquerda importa: a classe é CHAR(5) e "1113" nunca casaria com "01113". */
function pad(valor: string, tamanho: number): string {
  return valor.trim().padStart(tamanho, "0");
}

async function main() {
  const csvPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "cnae-estrutura.csv"
  );

  const linhas = parse(readFileSync(csvPath, "utf8"), {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as LinhaCsv[];

  if (linhas.length === 0) {
    throw new Error(`Nenhuma linha lida de ${csvPath}`);
  }

  const valores = linhas.map((l) =>
    Prisma.sql`(${pad(l.classe, 5)}, ${l.classe_desc}, ${pad(l.grupo, 3)},
                ${l.grupo_desc}, ${pad(l.divisao, 2)}, ${l.divisao_desc},
                ${l.secao}, ${l.secao_desc})`
  );

  await prisma.$transaction([
    prisma.$executeRawUnsafe(DDL),
    prisma.$executeRawUnsafe("TRUNCATE TABLE lookup_cnae_estrutura"),
    prisma.$executeRaw`
      INSERT INTO lookup_cnae_estrutura
        (classe, classe_desc, grupo, grupo_desc, divisao, divisao_desc, secao, secao_desc)
      VALUES ${Prisma.join(valores)}
    `,
  ]);

  const [{ classes, secoes }] = await prisma.$queryRaw<
    Array<{ classes: bigint; secoes: bigint }>
  >`SELECT count(*) AS classes, count(DISTINCT secao) AS secoes FROM lookup_cnae_estrutura`;

  console.log(
    `✓ lookup_cnae_estrutura populada: ${classes} classes, ${secoes} seções`
  );
}

main()
  .catch((err) => {
    console.error("Seed de estrutura CNAE falhou:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
