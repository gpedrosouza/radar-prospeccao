/**
 * Importador da base de Dados Abertos CNPJ da Receita Federal.
 *
 * Uso:
 *   RECEITA_CNPJ_DIR=/caminho/para/zips npm run import:receita --workspace=apps/workers
 *
 * Variáveis de ambiente:
 *   RECEITA_CNPJ_DIR            Pasta com os ZIPs (obrigatório)
 *   RECEITA_IMPORT_ONLY         dictionaries | empresas | simples | socios | estabelecimentos | cnae-sec | socios-agg | all
 *   RECEITA_IMPORT_MAX_ROWS     Limita linhas por tipo (para testes)
 *   RECEITA_IMPORT_PROGRESS_EVERY  A cada N linhas imprimir progresso (padrão: 100000)
 *   RECEITA_IMPORT_ENCODING     Encoding dos CSVs: latin1 (padrão) | utf8
 *   RECEITA_IMPORT_TRUNCATE_STAGING  true (padrão) | false
 *   RECEITA_IMPORT_TRUNCATE_TARGET   true | false (padrão) — TRUNCATE em company_cnpj
 *   DATABASE_URL                Connection string do PostgreSQL
 */

import { loadConfig } from "./config.js";
import { getClient, closeClient } from "./db.js";
import { ensureSchema } from "./schema.js";
import { loadDictionaries } from "./loaders/dictionaries.js";
import { loadEmpresas } from "./loaders/empresas.js";
import { loadSimples } from "./loaders/simples.js";
import { loadSocios } from "./loaders/socios.js";
import { loadEstabelecimentos } from "./loaders/estabelecimentos.js";
import { loadCnaeSecundario } from "./loaders/cnae-secundario.js";
import { buildSocioAgg, refreshGrupoEconomico } from "./loaders/socios-agg.js";

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m ${s % 60}s`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

async function run(): Promise<void> {
  const cfg = loadConfig();

  console.log("=== Importador Receita Federal — Dados Abertos CNPJ ===\n");
  console.log(`  Diretório : ${cfg.cnpjDir}`);
  console.log(`  Importar  : ${cfg.importOnly}`);
  console.log(`  Encoding  : ${cfg.encoding}`);
  if (cfg.maxRows) {
    console.log(`  Max linhas: ${cfg.maxRows.toLocaleString("pt-BR")} por tipo`);
  }
  console.log();

  // Garante conexão com banco antes de criar schema
  await getClient();
  console.log("Banco conectado. Verificando schema...");
  await ensureSchema();
  console.log("Schema OK.\n");

  const shouldRun = (phase: string) =>
    cfg.importOnly === "all" || cfg.importOnly === phase;

  const totalStart = Date.now();

  if (shouldRun("dictionaries")) {
    const t = Date.now();
    console.log("--- Dicionários ---");
    await loadDictionaries(cfg);
    console.log(`Dicionários concluídos em ${formatDuration(Date.now() - t)}\n`);
  }

  if (shouldRun("empresas")) {
    const t = Date.now();
    console.log("--- Empresas ---");
    await loadEmpresas(cfg);
    console.log(`Empresas concluídas em ${formatDuration(Date.now() - t)}\n`);
  }

  if (shouldRun("simples")) {
    const t = Date.now();
    console.log("--- Simples Nacional / MEI ---");
    await loadSimples(cfg);
    console.log(`Simples concluído em ${formatDuration(Date.now() - t)}\n`);
  }

  if (shouldRun("socios")) {
    const t = Date.now();
    console.log("--- Sócios ---");
    await loadSocios(cfg);
    console.log(`Sócios concluídos em ${formatDuration(Date.now() - t)}\n`);
  }

  if (shouldRun("estabelecimentos")) {
    const t = Date.now();
    console.log("--- Estabelecimentos → company_cnpj ---");
    await loadEstabelecimentos(cfg);
    console.log(`Estabelecimentos concluídos em ${formatDuration(Date.now() - t)}\n`);
  }

  // Logo depois de estabelecimentos, de propósito: staging_estabelecimento
  // ainda está populada aqui — é a única janela em que a lista de CNAEs
  // secundários existe (ver o cabeçalho de loaders/cnae-secundario.ts).
  if (shouldRun("cnae-sec")) {
    const t = Date.now();
    console.log("--- CNAE secundário ---");
    await loadCnaeSecundario();
    console.log(`CNAE secundário concluído em ${formatDuration(Date.now() - t)}\n`);
  }

  // Depois de estabelecimentos: o agregado e restrito aos cnpj_basico que
  // existem em company_cnpj, entao precisa da tabela final ja populada.
  if (shouldRun("socios-agg")) {
    const t = Date.now();
    console.log("--- QSA agregado (decisor, no de socios, grupo) ---");
    await buildSocioAgg();
    await refreshGrupoEconomico();
    console.log(`QSA agregado concluido em ${formatDuration(Date.now() - t)}`);
  }

  console.log(`\n=== Importação concluída em ${formatDuration(Date.now() - totalStart)} ===`);
}

run()
  .catch((err) => {
    console.error("\nErro fatal na importação:", err);
    process.exitCode = 1;
  })
  .finally(() => closeClient());
