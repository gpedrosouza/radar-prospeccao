/**
 * Valida índices e coleta estatísticas da tabela company_cnpj.
 *
 * Uso:
 *   npm run db:analyze --workspace=apps/workers
 *
 * O script:
 *  1. Roda ANALYZE na tabela particionada (propaga para todas as 27 partições)
 *  2. Exibe EXPLAIN ANALYZE das 4 queries de referência com e sem seqscan
 *  3. Gera um resumo de row counts por partição
 *
 * Requer DATABASE_URL no ambiente (carregado de .env via --env-file).
 */

import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL não definida");
  process.exit(1);
}

const client = new pg.Client({ connectionString: DATABASE_URL });

async function run(sql: string, label: string): Promise<void> {
  console.log(`\n${"=".repeat(72)}`);
  console.log(`## ${label}`);
  console.log(`${"=".repeat(72)}`);
  const start = performance.now();
  const result = await client.query(sql);
  const elapsed = (performance.now() - start).toFixed(1);
  if (result.rows.length > 0 && "QUERY PLAN" in result.rows[0]) {
    result.rows.forEach((r) => console.log(r["QUERY PLAN"]));
  } else {
    result.rows.forEach((r) => console.log(JSON.stringify(r)));
  }
  console.log(`\n[elapsed: ${elapsed} ms]`);
}

async function main() {
  await client.connect();
  console.log("Conectado ao banco.\n");

  // ── 1. ANALYZE ────────────────────────────────────────────────────────────
  console.log("Rodando ANALYZE VERBOSE company_cnpj (propaga às 27 partições)...");
  const t0 = performance.now();
  await client.query("ANALYZE VERBOSE company_cnpj");
  console.log(`ANALYZE concluído em ${(performance.now() - t0).toFixed(0)} ms`);

  // ── 2. Queries de referência ───────────────────────────────────────────────

  // (a) Partition pruning + partial index (situacao = 'Ativa')
  await run(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
     SELECT * FROM company_cnpj
     WHERE uf = 'SP' AND situacao = 'Ativa'
     LIMIT 500`,
    "(a) natural — partition pruning + partial index"
  );
  await run(
    `SET enable_seqscan = off;
     EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
     SELECT * FROM company_cnpj
     WHERE uf = 'SP' AND situacao = 'Ativa'
     LIMIT 500`,
    "(a) forced — valida idx_company_cnpj_sp_municipio_codigo_cnae_principal_idx"
  );

  // (b) LIKE prefix sobre bpchar_pattern_ops
  await run(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
     SELECT * FROM company_cnpj
     WHERE cnae_principal LIKE '6201%'
     LIMIT 500`,
    "(b) natural — LIKE prefix sem filtro de uf (varrre 27 partições)"
  );
  await run(
    `SET enable_seqscan = off;
     EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
     SELECT * FROM company_cnpj
     WHERE cnae_principal LIKE '6201%'
     LIMIT 500`,
    "(b) forced — valida _cnae_principal_idx com bpchar_pattern_ops"
  );

  // (c) Paginação por OFFSET — O(OFFSET) scans
  await run(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
     SELECT * FROM company_cnpj
     WHERE uf = 'SP'
     ORDER BY id
     LIMIT 500 OFFSET 10000`,
    "(c) natural — OFFSET 10000 (lento em produção — O(n) rows lidos antes do LIMIT)"
  );
  await run(
    `SET enable_seqscan = off;
     EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
     SELECT * FROM company_cnpj
     WHERE uf = 'SP'
     ORDER BY id
     LIMIT 500 OFFSET 10000`,
    "(c) forced — valida _uf_id_idx para ORDER BY + OFFSET"
  );

  // (d) Paginação por cursor — O(1) posicionamento via id >
  await run(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
     SELECT * FROM company_cnpj
     WHERE uf = 'SP' AND id > 50000
     ORDER BY id
     LIMIT 500`,
    "(d) natural — cursor id > last_seen (rápido — usa _uf_id_idx diretamente)"
  );
  await run(
    `SET enable_seqscan = off;
     EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
     SELECT * FROM company_cnpj
     WHERE uf = 'SP' AND id > 50000
     ORDER BY id
     LIMIT 500`,
    "(d) forced — valida Index Cond: (uf = 'SP' AND id > ?)"
  );

  // ── 3. Row counts por partição ─────────────────────────────────────────────
  console.log(`\n${"=".repeat(72)}`);
  console.log("## Row counts por partição");
  console.log(`${"=".repeat(72)}`);
  const counts = await client.query<{ partition: string; rows: string }>(`
    SELECT
      c.relname                                      AS partition,
      pg_stat_get_live_tuples(c.oid)::bigint::text   AS rows
    FROM pg_class c
    JOIN pg_inherits i ON i.inhrelid = c.oid
    JOIN pg_class p    ON p.oid = i.inhparent
    WHERE p.relname = 'company_cnpj'
    ORDER BY c.relname
  `);
  const total = counts.rows.reduce((s, r) => s + BigInt(r.rows), 0n);
  counts.rows.forEach((r) =>
    console.log(`  ${r.partition.padEnd(28)} ${r.rows.padStart(12)} rows`)
  );
  console.log(`  ${"TOTAL".padEnd(28)} ${total.toString().padStart(12)} rows`);

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
