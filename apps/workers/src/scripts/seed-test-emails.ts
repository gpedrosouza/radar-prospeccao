/**
 * Insere CNPJs fake em company_cnpj a partir de uma lista de e-mails de
 * teste — pra poder selecionar essa "base de teste" no fluxo normal de
 * campanha (tela de CNPJs → filtrar por Situação Cadastral = "Teste" →
 * botão Campanha), sem precisar de nenhuma tela ou lógica nova.
 *
 * situacao = "Teste" é o marcador — nunca aparece em dado real da Receita
 * Federal (valores reais: Ativa/Inapta/Baixada/Suspensa/Nula), então filtrar
 * por ele nunca traz CNPJ de verdade junto. Reversível com:
 *   DELETE FROM company_cnpj WHERE situacao = 'Teste';
 *
 * Formato do arquivo de entrada (um e-mail por linha; nome da empresa opcional
 * depois de vírgula — se omitido, gera "EMPRESA TESTE N LTDA"):
 *   fulano@example.com
 *   ciclano@example.com, Ciclano Contabilidade
 *
 * Uso:
 *   npm run seed:test-emails --workspace=apps/workers -- --file=./test-emails.txt
 *   npm run seed:test-emails --workspace=apps/workers -- --file=./test-emails.txt --dry-run
 */

import { readFileSync } from "node:fs";
import { PrismaClient } from "@radar/db";

const prisma = new PrismaClient();

const cliArgs = process.argv.slice(2);
const DRY_RUN = cliArgs.includes("--dry-run");

function argValue(flag: string): string | undefined {
  const prefix = `--${flag}=`;
  const found = cliArgs.find((a) => a.startsWith(prefix));
  return found?.slice(prefix.length);
}

const FILE_PATH = argValue("file");
const UF = "SP"; // partição fixa qualquer, só precisa ser uma UF real válida

interface EmailEntry {
  email: string;
  nome?: string;
}

function parseFile(path: string): EmailEntry[] {
  const raw = readFileSync(path, "utf-8");
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [email, nome] = line.split(",").map((s) => s.trim());
      return { email, nome: nome || undefined };
    });
}

/** CNPJ fake, 14 dígitos, sempre começando em "9" — evita colidir com CNPJ real importado. */
function fakeCnpj(index: number): string {
  return `9${String(index).padStart(13, "0")}`;
}

async function main(): Promise<void> {
  if (!FILE_PATH) {
    console.error("ERRO: informe --file=caminho/para/lista.txt");
    process.exit(1);
  }

  const entries = parseFile(FILE_PATH);
  if (entries.length === 0) {
    console.log("Nenhum e-mail encontrado no arquivo — nada a fazer.");
    return;
  }

  console.log(`Seed de e-mails de teste — ${entries.length} registro(s)`);
  console.log(`Modo: ${DRY_RUN ? "DRY-RUN (sem alterações)" : "REAL"}`);
  console.log("─".repeat(60));

  const now = new Date();
  const rows = entries.map((entry, i) => ({
    cnpj: fakeCnpj(i + 1),
    razao_social: entry.nome?.toUpperCase() ?? `EMPRESA TESTE ${i + 1} LTDA`,
    nome_fantasia: entry.nome ?? null,
    uf: UF,
    municipio_codigo: 999999, // placeholder — nunca bate com código real da Receita
    municipio_nome: "TESTE",
    cnae_principal: "0000000",
    situacao: "Teste",
    porte: "Micro",
    matriz_filial: "MATRIZ",
    opcao_simples: false,
    opcao_mei: false,
    data_abertura: now,
    email: entry.email,
    criado_em: now,
    atualizado_em: now,
  }));

  for (const row of rows) {
    console.log(`  ${row.cnpj}  ${row.email}  (${row.razao_social})`);
  }

  if (DRY_RUN) {
    console.log("─".repeat(60));
    console.log("DRY-RUN — nenhuma alteração aplicada.");
    return;
  }

  await prisma.companyCnpj.createMany({ data: rows });

  console.log("─".repeat(60));
  console.log(`${rows.length} CNPJ(s) de teste inserido(s) em uf=${UF}, situacao='Teste'.`);
  console.log(
    "Pra remover depois: DELETE FROM company_cnpj WHERE situacao = 'Teste';"
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
