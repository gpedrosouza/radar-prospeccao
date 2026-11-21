/**
 * Reseta latitude/longitude/geom/geocode_source dos CNPJs que foram
 * geocodificados no nível de município (geocode_source = 'cnefe_municipio')
 * — resolvido de forma grosseira antes de cnefe_ceps existir, ou para UFs
 * ainda sem import-cnefe-ceps.ts rodado.
 *
 * Depois do reset, a fila geocode-enrichment pega esses CNPJs de novo na
 * próxima busca no Mapa que os retornar (WHERE latitude IS NULL), com
 * chance de resolver por CEP — mais preciso — dessa vez.
 *
 * Uso:
 *   npm run reenrich:municipio-level --workspace=apps/workers -- --dry-run
 *   npm run reenrich:municipio-level --workspace=apps/workers -- --dry-run --uf=SP
 *   npm run reenrich:municipio-level --workspace=apps/workers
 *   npm run reenrich:municipio-level --workspace=apps/workers -- --uf=SP
 */

import pg from "pg";

const cliArgs = process.argv.slice(2);
const DRY_RUN = cliArgs.includes("--dry-run");

function argValue(flag: string): string | undefined {
  const prefix = `--${flag}=`;
  const found = cliArgs.find((a) => a.startsWith(prefix));
  return found?.slice(prefix.length);
}

const UF_ARG = argValue("uf")?.toUpperCase();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("ERRO: DATABASE_URL não definida");
  process.exit(1);
}

async function main(): Promise<void> {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();

  console.log("Reprocessamento — CNPJs geocodificados no nível de município");
  console.log("─".repeat(60));
  console.log(`Modo: ${DRY_RUN ? "DRY-RUN (sem alterações)" : "REAL"}`);
  console.log(`UF:   ${UF_ARG ?? "todas"}`);
  console.log("─".repeat(60));

  const whereClause = UF_ARG
    ? `geocode_source = 'cnefe_municipio' AND uf = $1`
    : `geocode_source = 'cnefe_municipio'`;
  const params = UF_ARG ? [UF_ARG] : [];

  const countByUf = await client.query<{ uf: string; total: number }>(
    `SELECT uf, count(*)::int AS total FROM company_cnpj WHERE ${whereClause} GROUP BY uf ORDER BY uf`,
    params
  );

  if (countByUf.rows.length === 0) {
    console.log("\nNenhum CNPJ com geocode_source = 'cnefe_municipio' encontrado — nada a fazer.");
    await client.end();
    return;
  }

  console.log();
  let totalGeral = 0;
  for (const r of countByUf.rows) {
    console.log(`  ${r.uf}: ${r.total.toLocaleString("pt-BR")}`);
    totalGeral += r.total;
  }
  console.log(`  TOTAL: ${totalGeral.toLocaleString("pt-BR")}`);

  if (DRY_RUN) {
    console.log("\nDRY-RUN — nenhuma alteração aplicada. Rode sem --dry-run para resetar de verdade.");
    console.log("─".repeat(60));
    await client.end();
    return;
  }

  const result = await client.query(
    `UPDATE company_cnpj
     SET latitude = NULL, longitude = NULL, geom = NULL, geocode_source = NULL, atualizado_em = NOW()
     WHERE ${whereClause}`,
    params
  );

  console.log(
    `\n${result.rowCount} CNPJ(s) resetado(s) — serão reprocessados na próxima busca no Mapa que os retornar.`
  );
  console.log("─".repeat(60));

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
