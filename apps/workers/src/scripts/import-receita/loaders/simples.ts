import path from "node:path";
import { getClient } from "../db.js";
import { processFile, findFiles } from "../zip-reader.js";
import { streamCsvToCopy, type ParseRowFn } from "../csv-copy.js";
import { truncateStagingSimples } from "../schema.js";
import type { ImportConfig } from "../config.js";

// Colunas do CSV Simples (0-indexed):
// 0: cnpj_basico  1: opcao_simples (S/N)  2: data_opcao_simples  3: data_exclusao_simples
// 4: opcao_mei (S/N)  5: data_opcao_mei  6: data_exclusao_mei
const parseSimpleRow: ParseRowFn = (fields) => {
  if (fields.length < 7) return null;

  const cnpjBasico = (fields[0] ?? "").trim().padStart(8, "0");
  if (!cnpjBasico || cnpjBasico === "00000000") return null;

  const opt = (v: string | undefined) => {
    const s = (v ?? "").trim();
    return s === "S" || s === "N" ? s : null;
  };

  const date = (v: string | undefined) => {
    const s = (v ?? "").trim();
    return s && s !== "00000000" ? s : null;
  };

  return [
    cnpjBasico,
    opt(fields[1]),   // opcao_simples
    date(fields[2]),  // data_opcao_simples
    date(fields[3]),  // data_exclusao_simples
    opt(fields[4]),   // opcao_mei
    date(fields[5]),  // data_opcao_mei
    date(fields[6]),  // data_exclusao_mei
  ];
};

const COPY_SQL =
  "COPY staging_simples " +
  "(cnpj_basico, opcao_simples, data_opcao_simples, data_exclusao_simples, " +
  "opcao_mei, data_opcao_mei, data_exclusao_mei) " +
  "FROM STDIN WITH (FORMAT text, NULL '\\N')";

export async function loadSimples(cfg: ImportConfig): Promise<void> {
  const client = await getClient();
  const files = findFiles(cfg.cnpjDir, ["simples"]);

  if (files.length === 0) {
    console.warn(`  Aviso: Simples.zip não encontrado em ${cfg.cnpjDir}`);
    return;
  }

  if (cfg.truncateStaging) {
    console.log("  Truncando staging_simples...");
    await truncateStagingSimples();
  }

  const filePath = files[0]!;
  console.log(`  Carregando ${path.basename(filePath)}...`);

  let totalRows = 0;
  let totalSkipped = 0;

  await processFile(filePath, async (_entryName, stream) => {
    const stats = await streamCsvToCopy(stream, client, COPY_SQL, parseSimpleRow, {
      encoding: cfg.encoding,
      maxRows: cfg.maxRows,
      progressEvery: cfg.progressEvery,
      label: "Simples",
    });
    totalRows += stats.rows;
    totalSkipped += stats.skipped;
  });

  console.log(
    `  Simples: ${totalRows.toLocaleString("pt-BR")} registros` +
      (totalSkipped > 0 ? `, ${totalSkipped} ignorados` : ""),
  );
}
