/**
 * Runner do refresh de analytics.
 *
 * Executa refresh-cnpj-summaries.sql contra o banco e exibe o resultado.
 *
 * NÃO chamar a partir de rotas de API. Ver comentário no arquivo SQL.
 *
 * Uso: npm run analytics:refresh --workspace=apps/workers
 */

import pg from "pg";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL não definida");
  process.exit(1);
}

const client = new pg.Client({ connectionString: DATABASE_URL });

client.on("notice", (msg) => console.log(`  [NOTICE] ${msg.message}`));

async function showTable(table: string): Promise<void> {
  const res = await client.query(
    `SELECT * FROM analytics.${table} ORDER BY total DESC`
  );
  console.log(`\nanalytics.${table} — ${res.rows.length} linha(s):`);
  if (res.rows.length === 0) {
    console.log("  (vazio)");
    return;
  }
  res.rows.forEach((r) => {
    const line = Object.entries(r)
      .map(([k, v]) => `${k}=${v ?? "NULL"}`)
      .join("  ");
    console.log("  " + line);
  });
}

async function main(): Promise<void> {
  await client.connect();
  console.log("Conectado ao banco.\n");

  const sql = readFileSync(
    join(__dirname, "refresh-cnpj-summaries.sql"),
    "utf-8"
  );

  console.log("Executando refresh das tabelas analytics...");
  const t0 = performance.now();

  await client.query(sql);

  const totalMs = (performance.now() - t0).toFixed(0);
  console.log(`\nRefresh concluído em ${totalMs} ms total.`);

  // Mostra o log das execuções recém registradas
  const log = await client.query<{
    id: string;
    tabela: string;
    linhas_processadas: string;
    duracao_ms: number;
    executado_em: Date;
  }>(
    `SELECT id, tabela, linhas_processadas, duracao_ms, executado_em
     FROM analytics.refresh_log
     ORDER BY executado_em DESC
     LIMIT 8`
  );

  console.log("\nrefresh_log (últimas execuções):");
  console.log("─".repeat(68));
  for (const r of log.rows) {
    const ts = r.executado_em.toISOString().replace("T", " ").slice(0, 19);
    console.log(
      `  ${r.tabela.padEnd(32)}  ` +
        `${String(r.linhas_processadas).padStart(6)} linhas  ` +
        `${String(r.duracao_ms).padStart(5)} ms  ` +
        `${ts}`
    );
  }
  console.log("─".repeat(68));

  // Conteúdo atual de cada tabela
  const tables = [
    "cnpj_summary_by_uf",
    "cnpj_summary_by_cnae",
    "cnpj_summary_by_status",
    "cnpj_summary_by_size",
  ] as const;

  for (const t of tables) {
    await showTable(t);
  }

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
