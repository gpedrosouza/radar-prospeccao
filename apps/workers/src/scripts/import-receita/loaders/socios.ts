import path from "node:path";
import { getClient } from "../db.js";
import { processFile, findFiles, SOCIO_BASENAMES } from "../zip-reader.js";
import { streamCsvToCopy, type ParseRowFn } from "../csv-copy.js";
import { truncateStagingSocio } from "../schema.js";
import type { ImportConfig } from "../config.js";

// Colunas do CSV Socios (0-indexed):
// 0: cnpj_basico
// 1: identificador_socio (1=PJ, 2=PF, 3=Estrangeiro)
// 2: nome_socio_razao_social
// 3: cpf_cnpj_socio (CPF mascarado ou CNPJ completo)
// 4: qualificacao_socio (código 2 dígitos)
// 5: data_entrada_sociedade (YYYYMMDD)
// 6: pais (código)
// 7: representante_legal (CPF mascarado)
// 8: nome_representante
// 9: qualificacao_representante (código 2 dígitos)
// 10: faixa_etaria (código 1 dígito)
const parseSocioRow: ParseRowFn = (fields) => {
  if (fields.length < 11) return null;

  const cnpjBasico = (fields[0] ?? "").trim().padStart(8, "0");
  if (!cnpjBasico || cnpjBasico === "00000000") return null;

  const str = (v: string | undefined) => (v ?? "").trim() || null;
  const date = (v: string | undefined) => {
    const s = (v ?? "").trim();
    return s && s !== "00000000" ? s : null;
  };

  return [
    cnpjBasico,
    str(fields[1]),   // identificador_socio
    str(fields[2]),   // nome_socio_razao_social
    str(fields[3]),   // cpf_cnpj_socio
    str(fields[4]),   // qualificacao_socio
    date(fields[5]),  // data_entrada_sociedade
    str(fields[6]),   // pais
    str(fields[7]),   // representante_legal
    str(fields[8]),   // nome_representante
    str(fields[9]),   // qualificacao_representante
    str(fields[10]),  // faixa_etaria
  ];
};

const COPY_SQL =
  "COPY staging_socio " +
  "(cnpj_basico, identificador_socio, nome_socio_razao_social, cpf_cnpj_socio, " +
  "qualificacao_socio, data_entrada_sociedade, pais, representante_legal, " +
  "nome_representante, qualificacao_representante, faixa_etaria) " +
  "FROM STDIN WITH (FORMAT text, NULL '\\N')";

export async function loadSocios(cfg: ImportConfig): Promise<void> {
  const client = await getClient();
  const files = findFiles(cfg.cnpjDir, SOCIO_BASENAMES);

  if (files.length === 0) {
    console.warn(`  Aviso: nenhum arquivo Socios*.zip encontrado em ${cfg.cnpjDir}`);
    return;
  }

  if (cfg.truncateStaging) {
    console.log("  Truncando staging_socio...");
    await truncateStagingSocio();
  }

  let grandTotal = 0;
  let grandSkipped = 0;

  for (const filePath of files) {
    console.log(`  Carregando ${path.basename(filePath)}...`);
    let fileRows = 0;
    let fileSkipped = 0;

    await processFile(filePath, async (_entryName, stream) => {
      const stats = await streamCsvToCopy(stream, client, COPY_SQL, parseSocioRow, {
        encoding: cfg.encoding,
        maxRows: cfg.maxRows ? cfg.maxRows - grandTotal : undefined,
        progressEvery: cfg.progressEvery,
        label: "Socios",
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

  console.log(
    `  Total Sócios: ${grandTotal.toLocaleString("pt-BR")} registros` +
      (grandSkipped > 0 ? `, ${grandSkipped} ignorados` : ""),
  );
}
