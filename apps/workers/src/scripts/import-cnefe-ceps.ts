/**
 * Importa o CNEFE completo (IBGE, Censo 2022, pasta Arquivos_CNEFE/CSV/UF/)
 * para cnefe_ceps — segunda etapa (mais precisa que cnefe_municipio_centroides)
 * da cascata de geocodificação sob demanda (CLAUDE.md § "Estratégia de
 * geocodificação / enriquecimento externo").
 *
 * Diferente de Coordenadas_enderecos (usado em import-cnefe.ts), o dataset
 * Arquivos_CNEFE tem CEP e LATITUDE/LONGITUDE na mesma linha — confirmado
 * no header real de múltiplos arquivos de UF (idêntico entre eles) e no
 * dicionário oficial Dicionario_CNEFE_Censo_2022.xls. Não precisa de join
 * com outro dataset — um único arquivo, uma linha por endereço.
 *
 * Arquivos bem maiores que Coordenadas_enderecos (ex: 35_SP.csv tem ~3,8GB
 * descompactado, contra ~870MB do arquivo irmão) — streaming linha a linha
 * via streamAggregateLatLng (lib/cnefe-shared.ts) é obrigatório, nunca
 * carrega o arquivo inteiro em memória.
 *
 * Uso:
 *   npm run import:cnefe-ceps --workspace=apps/workers -- --uf=SP --file="C:\...\35_SP.csv"
 *   npm run import:cnefe-ceps --workspace=apps/workers -- --dir="C:\...\cnefe_correto" --all
 *   npm run import:cnefe-ceps --workspace=apps/workers -- --dir="C:\...\cnefe_correto" --all --force
 *
 * Nomeação esperada dos arquivos em modo --all: "{codigo_uf}_{SIGLA}.csv"
 * (ex: "35_SP.csv") — a UF é deduzida pelo código IBGE de 2 dígitos no
 * início do nome. Nem todas as 27 UFs precisam estar presentes — o script
 * processa o que encontrar e reporta as que faltam ao final, sem quebrar.
 *
 * Idempotência: por padrão pula UFs que já têm registros em cnefe_ceps.
 * --force reimporta (upsert) mesmo assim.
 */

import pg from "pg";
import {
  descobrirArquivosPorUf,
  ufsFaltando,
  streamAggregateLatLng,
  type Agg,
} from "./lib/cnefe-shared.js";

// ── Config / CLI ──────────────────────────────────────────────────────────────

const cliArgs = process.argv.slice(2);
const FORCE = cliArgs.includes("--force");
const ALL = cliArgs.includes("--all");

function argValue(flag: string): string | undefined {
  const prefix = `--${flag}=`;
  const found = cliArgs.find((a) => a.startsWith(prefix));
  return found?.slice(prefix.length);
}

const UF_ARG = argValue("uf")?.toUpperCase();
const FILE_ARG = argValue("file");
const DIR_ARG = argValue("dir");

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("ERRO: DATABASE_URL não definida");
  process.exit(1);
}

// ── Agregação por CEP ───────────────────────────────────────────────────────────

interface ImportFileResult {
  uf: string;
  linhasLidas: number;
  linhasInvalidas: number;
  ceps: number;
  tempoMs: number;
}

/** CEP plausível: exatamente 8 dígitos, não todo-zero (mesma regra de extractCepFromEndereco). */
function isValidCep(cep: string): boolean {
  return /^\d{8}$/.test(cep) && cep !== "00000000";
}

async function aggregateByCep(
  filePath: string
): Promise<{ aggregates: Map<string, Agg>; linhasLidas: number; linhasInvalidas: number }> {
  return streamAggregateLatLng<string>({
    filePath,
    delimiter: ";",
    requiredColumns: ["CEP", "LATITUDE", "LONGITUDE"],
    parseRow: (fields, colIdx) => {
      const cep = fields[colIdx.CEP]?.trim();
      if (!cep || !isValidCep(cep)) return null;
      return {
        key: cep,
        lat: parseFloat(fields[colIdx.LATITUDE]),
        lng: parseFloat(fields[colIdx.LONGITUDE]),
      };
    },
    onProgress: (n) => console.log(`    ... ${n.toLocaleString("pt-BR")} linhas lidas`),
  });
}

async function upsertCeps(client: pg.Client, uf: string, aggregates: Map<string, Agg>): Promise<number> {
  await client.query("BEGIN");
  try {
    for (const [cep, agg] of aggregates) {
      const lat = agg.sumLat / agg.count;
      const lng = agg.sumLng / agg.count;
      await client.query(
        `INSERT INTO cnefe_ceps (cep, uf, total_enderecos, latitude, longitude, geom)
         VALUES ($1, $2, $3, $4, $5, ST_SetSRID(ST_MakePoint($5, $4), 4326)::geography)
         ON CONFLICT (cep) DO UPDATE
         SET uf              = EXCLUDED.uf,
             total_enderecos = EXCLUDED.total_enderecos,
             latitude        = EXCLUDED.latitude,
             longitude       = EXCLUDED.longitude,
             geom            = EXCLUDED.geom`,
        [cep, uf, agg.count, lat, lng]
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
  return aggregates.size;
}

async function ufJaImportada(client: pg.Client, uf: string): Promise<boolean> {
  const result = await client.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM cnefe_ceps WHERE uf = $1`,
    [uf]
  );
  return parseInt(result.rows[0].count, 10) > 0;
}

async function importFile(client: pg.Client, uf: string, filePath: string): Promise<ImportFileResult> {
  const inicio = Date.now();
  const { aggregates, linhasLidas, linhasInvalidas } = await aggregateByCep(filePath);
  const ceps = await upsertCeps(client, uf, aggregates);
  return { uf, linhasLidas, linhasInvalidas, ceps, tempoMs: Date.now() - inicio };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("Importador CNEFE (Arquivos_CNEFE) → cnefe_ceps");
  console.log("─".repeat(60));

  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    if (ALL) {
      if (!DIR_ARG) {
        console.error("ERRO: --all requer --dir=<pasta>");
        process.exit(1);
      }
      const arquivos = descobrirArquivosPorUf(DIR_ARG);
      console.log(`${arquivos.size} arquivo(s) de UF encontrado(s) em ${DIR_ARG}\n`);

      const resultados: Array<{ uf: string; status: string; detalhe: string }> = [];

      for (const [uf, filePath] of [...arquivos.entries()].sort(([a], [b]) => a.localeCompare(b))) {
        if (!FORCE && (await ufJaImportada(client, uf))) {
          console.log(`[${uf}] já importada — pulando (use --force para reimportar)`);
          resultados.push({ uf, status: "pulado", detalhe: "já importada" });
          continue;
        }

        console.log(`[${uf}] importando ${filePath} ...`);
        try {
          const r = await importFile(client, uf, filePath);
          console.log(
            `[${uf}] OK — ${r.linhasLidas.toLocaleString("pt-BR")} linhas` +
              (r.linhasInvalidas > 0 ? ` (${r.linhasInvalidas} inválidas)` : "") +
              `, ${r.ceps.toLocaleString("pt-BR")} CEP(s) único(s), ${(r.tempoMs / 1000).toFixed(1)}s`
          );
          resultados.push({
            uf,
            status: "ok",
            detalhe: `${r.linhasLidas} linhas (${r.linhasInvalidas} inválidas), ${r.ceps} CEPs, ${(r.tempoMs / 1000).toFixed(1)}s`,
          });
        } catch (err) {
          // Um CSV malformado não deve travar as demais UFs.
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[${uf}] ERRO — ${msg}`);
          resultados.push({ uf, status: "erro", detalhe: msg });
        }
      }

      console.log("\n" + "─".repeat(60));
      console.log("Resumo:");
      for (const r of resultados) {
        console.log(`  ${r.uf}: ${r.status} — ${r.detalhe}`);
      }
      const faltando = ufsFaltando(arquivos.keys());
      if (faltando.length > 0) {
        console.log(`\nUFs sem arquivo em ${DIR_ARG}: ${faltando.join(", ")}`);
      }
      console.log("─".repeat(60));
    } else {
      if (!UF_ARG || !FILE_ARG) {
        console.error("ERRO: use --uf=SP --file=<caminho> (ou --dir=<pasta> --all)");
        process.exit(1);
      }

      if (!FORCE && (await ufJaImportada(client, UF_ARG))) {
        console.log(`[${UF_ARG}] já importada — nada a fazer (use --force para reimportar)`);
        return;
      }

      console.log(`[${UF_ARG}] importando ${FILE_ARG} ...`);
      const r = await importFile(client, UF_ARG, FILE_ARG);
      console.log(
        `[${UF_ARG}] OK — ${r.linhasLidas.toLocaleString("pt-BR")} linhas` +
          (r.linhasInvalidas > 0 ? ` (${r.linhasInvalidas} inválidas)` : "") +
          `, ${r.ceps.toLocaleString("pt-BR")} CEP(s) único(s), ${(r.tempoMs / 1000).toFixed(1)}s`
      );
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
