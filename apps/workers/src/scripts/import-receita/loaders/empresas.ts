import path from "node:path";
import { getClient } from "../db.js";
import { processFile, findFiles, EMPRESA_BASENAMES } from "../zip-reader.js";
import { streamCsvToCopy, type ParseRowFn } from "../csv-copy.js";
import { truncateStagingEmpresa } from "../schema.js";
import type { ImportConfig } from "../config.js";

// Colunas do CSV Empresas (0-indexed):
// 0: cnpj_basico  1: razao_social  2: natureza_juridica  3: qualificacao_responsavel
// 4: capital_social  5: porte  6: ente_federativo_responsavel
const parseEmpresaRow: ParseRowFn = (fields) => {
  if (fields.length < 7) return null;

  const cnpjBasico = (fields[0] ?? "").trim().padStart(8, "0");
  const razaoSocial = (fields[1] ?? "").trim();
  if (!cnpjBasico || !razaoSocial) return null;

  return [
    cnpjBasico,
    razaoSocial,
    (fields[2] ?? "").trim() || null, // natureza_juridica
    (fields[3] ?? "").trim() || null, // qualificacao_responsavel
    (fields[4] ?? "").trim() || null, // capital_social (ex: "1000000,00")
    (fields[5] ?? "").trim() || null, // porte (00=N/A, 01=ME, 03=EPP, 05=Demais)
    (fields[6] ?? "").trim() || null, // ente_federativo_responsavel
  ];
};

const COPY_SQL =
  "COPY staging_empresa " +
  "(cnpj_basico, razao_social, natureza_juridica, qualificacao_responsavel, " +
  "capital_social, porte, ente_federativo) " +
  "FROM STDIN WITH (FORMAT text, NULL '\\N')";

export async function loadEmpresas(cfg: ImportConfig): Promise<void> {
  const client = await getClient();
  const files = findFiles(cfg.cnpjDir, EMPRESA_BASENAMES);

  if (files.length === 0) {
    console.warn(`  Aviso: nenhum arquivo Empresas*.zip encontrado em ${cfg.cnpjDir}`);
    return;
  }

  if (cfg.truncateStaging) {
    console.log("  Truncando staging_empresa...");
    await truncateStagingEmpresa();
  }

  let grandTotal = 0;
  let grandSkipped = 0;

  for (const filePath of files) {
    console.log(`  Carregando ${path.basename(filePath)}...`);
    let fileRows = 0;
    let fileSkipped = 0;

    await processFile(filePath, async (_entryName, stream) => {
      const stats = await streamCsvToCopy(stream, client, COPY_SQL, parseEmpresaRow, {
        encoding: cfg.encoding,
        maxRows: cfg.maxRows ? cfg.maxRows - grandTotal : undefined,
        progressEvery: cfg.progressEvery,
        label: "Empresas",
      });
      fileRows += stats.rows;
      fileSkipped += stats.skipped;
      grandTotal += stats.rows;
      grandSkipped += stats.skipped;
    });

    console.log(
      `  ${path.basename(filePath)}: ${fileRows.toLocaleString("pt-BR")} registros` +
        (fileSkipped > 0 ? `, ${fileSkipped} ignorados` : ""),
    );

    if (cfg.maxRows && grandTotal >= cfg.maxRows) break;
  }

  console.log(`  Total Empresas: ${grandTotal.toLocaleString("pt-BR")} registros` +
    (grandSkipped > 0 ? `, ${grandSkipped} ignorados` : ""));
}
