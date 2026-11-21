export type ImportOnly =
  | "dictionaries"
  | "empresas"
  | "simples"
  | "socios"
  | "estabelecimentos"
  | "cnae-sec"
  | "socios-agg"
  | "all";

export interface ImportConfig {
  cnpjDir: string;
  maxRows: number | undefined;
  importOnly: ImportOnly;
  progressEvery: number;
  encoding: string;
  truncateStaging: boolean;
  truncateTarget: boolean;
}

const VALID_IMPORT_ONLY: readonly ImportOnly[] = [
  "dictionaries",
  "empresas",
  "simples",
  "socios",
  "estabelecimentos",
  "cnae-sec",
  "socios-agg",
  "all",
];

function isImportOnly(v: string): v is ImportOnly {
  return VALID_IMPORT_ONLY.includes(v as ImportOnly);
}

export function loadConfig(): ImportConfig {
  const cnpjDir = process.env["RECEITA_CNPJ_DIR"];
  if (!cnpjDir) throw new Error("RECEITA_CNPJ_DIR não definido");

  const maxRowsRaw = process.env["RECEITA_IMPORT_MAX_ROWS"];
  const maxRows = maxRowsRaw ? parseInt(maxRowsRaw, 10) : undefined;
  if (maxRows !== undefined && (isNaN(maxRows) || maxRows < 1)) {
    throw new Error(`RECEITA_IMPORT_MAX_ROWS inválido: ${maxRowsRaw}`);
  }

  const importOnlyRaw = process.env["RECEITA_IMPORT_ONLY"] ?? "all";
  if (!isImportOnly(importOnlyRaw)) {
    throw new Error(
      `RECEITA_IMPORT_ONLY inválido: "${importOnlyRaw}". Valores aceitos: ${VALID_IMPORT_ONLY.join(", ")}`,
    );
  }

  const progressEveryRaw = process.env["RECEITA_IMPORT_PROGRESS_EVERY"] ?? "100000";
  const progressEvery = parseInt(progressEveryRaw, 10);
  if (isNaN(progressEvery) || progressEvery < 1) {
    throw new Error(`RECEITA_IMPORT_PROGRESS_EVERY inválido: ${progressEveryRaw}`);
  }

  return {
    cnpjDir,
    maxRows,
    importOnly: importOnlyRaw,
    progressEvery,
    encoding: process.env["RECEITA_IMPORT_ENCODING"] ?? "latin1",
    truncateStaging: process.env["RECEITA_IMPORT_TRUNCATE_STAGING"] !== "false",
    truncateTarget: process.env["RECEITA_IMPORT_TRUNCATE_TARGET"] === "true",
  };
}
