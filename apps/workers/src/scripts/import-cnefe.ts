/**
 * Importa o CNEFE (IBGE, Censo 2022, pasta Coordenadas_enderecos/UF/) para
 * cnefe_municipio_centroides — primeira etapa (mais barata, precisão de
 * município) da cascata de geocodificação sob demanda (CLAUDE.md §
 * "Estratégia de geocodificação / enriquecimento externo").
 *
 * DESVIO DO DESENHO ORIGINAL — ver comentário completo na migration
 * 20260721000003_cnefe_municipio_centroides: o CSV do IBGE
 * (Coordenadas_enderecos) só tem COD_UF, COD_MUN, COD_ESPECIE, LATITUDE,
 * LONGITUDE, NV_GEO_COORD (confirmado contra
 * Dicionario_Coordenadas_Censo2022.xls) — sem CEP nem logradouro. Por isso
 * este script agrega em CENTROIDE POR MUNICÍPIO durante a leitura em
 * streaming do CSV, em vez de fazer COPY linha-a-linha de ~111M endereços
 * para uma tabela crua. Precisão mais fina por CEP está em
 * import-cnefe-ceps.ts, que lê um dataset diferente (Arquivos_CNEFE) que
 * tem CEP na mesma linha.
 *
 * Uso:
 *   npm run import:cnefe --workspace=apps/workers -- --uf=SP --file="C:\...\35.csv"
 *   npm run import:cnefe --workspace=apps/workers -- --dir="C:\...\cnefe" --all
 *   npm run import:cnefe --workspace=apps/workers -- --dir="C:\...\cnefe" --all --force
 *
 * Nomeação esperada dos arquivos em modo --all: "{codigo_uf}.csv" ou
 * "{codigo_uf}_{SIGLA}.csv" (ex: "35.csv" ou "35_SP.csv") — a UF é deduzida
 * pelo código IBGE de 2 dígitos no início do nome.
 *
 * Idempotência: por padrão pula UFs que já têm registros em
 * cnefe_municipio_centroides. --force reimporta (upsert) mesmo assim.
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

// ── Agregação por município ────────────────────────────────────────────────────

interface ImportFileResult {
  uf: string;
  linhasLidas: number;
  linhasInvalidas: number;
  municipios: number;
  tempoMs: number;
}

async function aggregateByMunicipio(
  filePath: string
): Promise<{ aggregates: Map<number, Agg>; linhasLidas: number; linhasInvalidas: number }> {
  return streamAggregateLatLng<number>({
    filePath,
    delimiter: ";",
    requiredColumns: ["COD_MUN", "LATITUDE", "LONGITUDE"],
    parseRow: (fields, colIdx) => {
      const codigoMunicipio = parseInt(fields[colIdx.COD_MUN], 10);
      if (!Number.isFinite(codigoMunicipio)) return null;
      return {
        key: codigoMunicipio,
        lat: parseFloat(fields[colIdx.LATITUDE]),
        lng: parseFloat(fields[colIdx.LONGITUDE]),
      };
    },
    onProgress: (n) => console.log(`    ... ${n.toLocaleString("pt-BR")} linhas lidas`),
  });
}

async function upsertCentroides(
  client: pg.Client,
  uf: string,
  aggregates: Map<number, Agg>
): Promise<number> {
  await client.query("BEGIN");
  try {
    for (const [codigoMunicipio, agg] of aggregates) {
      const lat = agg.sumLat / agg.count;
      const lng = agg.sumLng / agg.count;
      await client.query(
        `INSERT INTO cnefe_municipio_centroides (uf, codigo_municipio, total_enderecos, latitude, longitude, geom)
         VALUES ($1, $2, $3, $4, $5, ST_SetSRID(ST_MakePoint($5, $4), 4326)::geography)
         ON CONFLICT (uf, codigo_municipio) DO UPDATE
         SET total_enderecos = EXCLUDED.total_enderecos,
             latitude        = EXCLUDED.latitude,
             longitude       = EXCLUDED.longitude,
             geom            = EXCLUDED.geom`,
        [uf, codigoMunicipio, agg.count, lat, lng]
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
    `SELECT count(*)::text AS count FROM cnefe_municipio_centroides WHERE uf = $1`,
    [uf]
  );
  return parseInt(result.rows[0].count, 10) > 0;
}

async function importFile(client: pg.Client, uf: string, filePath: string): Promise<ImportFileResult> {
  const inicio = Date.now();
  const { aggregates, linhasLidas, linhasInvalidas } = await aggregateByMunicipio(filePath);
  const municipios = await upsertCentroides(client, uf, aggregates);
  return { uf, linhasLidas, linhasInvalidas, municipios, tempoMs: Date.now() - inicio };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("Importador CNEFE → cnefe_municipio_centroides");
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
              `, ${r.municipios} município(s), ${(r.tempoMs / 1000).toFixed(1)}s`
          );
          resultados.push({
            uf,
            status: "ok",
            detalhe: `${r.linhasLidas} linhas, ${r.municipios} municípios, ${(r.tempoMs / 1000).toFixed(1)}s`,
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
          `, ${r.municipios} município(s), ${(r.tempoMs / 1000).toFixed(1)}s`
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
