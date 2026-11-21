import path from "node:path";
import { getClient } from "../db.js";
import { processFile, findFiles, DICTIONARY_BASENAMES } from "../zip-reader.js";
import { streamCsvToCopy, type ParseRowFn } from "../csv-copy.js";
import { truncateLookup } from "../schema.js";
import type { ImportConfig } from "../config.js";

// Cada dicionário tem apenas (codigo, descricao)
function makeDictionaryParser(
  codeIndex = 0,
  descIndex = 1,
  codePad = 0,
): ParseRowFn {
  return (fields) => {
    if (fields.length < 2) return null;
    const codigo = (fields[codeIndex] ?? "").trim();
    const descricao = (fields[descIndex] ?? "").trim();
    if (!codigo) return null;
    return [codePad > 0 ? codigo.padStart(codePad, "0") : codigo, descricao || null];
  };
}

interface DictionarySpec {
  basename: string;
  table: "lookup_cnae" | "lookup_natureza_juridica" | "lookup_municipio_rf" | "lookup_pais" | "lookup_qualificacao";
  copySQL: string;
  parse: ParseRowFn;
  label: string;
}

const DICTIONARIES: DictionarySpec[] = [
  {
    basename: "cnaes",
    table: "lookup_cnae",
    copySQL: "COPY lookup_cnae (codigo, descricao) FROM STDIN WITH (FORMAT text, NULL '\\N')",
    parse: makeDictionaryParser(0, 1, 7),
    label: "CNAEs",
  },
  {
    basename: "naturezas",
    table: "lookup_natureza_juridica",
    copySQL: "COPY lookup_natureza_juridica (codigo, descricao) FROM STDIN WITH (FORMAT text, NULL '\\N')",
    parse: makeDictionaryParser(0, 1, 4),
    label: "Naturezas Jurídicas",
  },
  {
    basename: "municipios",
    table: "lookup_municipio_rf",
    copySQL: "COPY lookup_municipio_rf (codigo, descricao) FROM STDIN WITH (FORMAT text, NULL '\\N')",
    parse: makeDictionaryParser(0, 1, 7),
    label: "Municípios RF",
  },
  {
    basename: "paises",
    table: "lookup_pais",
    copySQL: "COPY lookup_pais (codigo, descricao) FROM STDIN WITH (FORMAT text, NULL '\\N')",
    parse: makeDictionaryParser(0, 1, 3),
    label: "Países",
  },
  {
    basename: "qualificacoes",
    table: "lookup_qualificacao",
    copySQL: "COPY lookup_qualificacao (codigo, descricao) FROM STDIN WITH (FORMAT text, NULL '\\N')",
    parse: makeDictionaryParser(0, 1, 2),
    label: "Qualificações",
  },
];

export async function loadDictionaries(cfg: ImportConfig): Promise<void> {
  const client = await getClient();
  const found = findFiles(cfg.cnpjDir, DICTIONARY_BASENAMES);

  if (found.length === 0) {
    console.warn(
      `  Aviso: nenhum arquivo de dicionário encontrado em ${cfg.cnpjDir}`,
    );
    return;
  }

  for (const filePath of found) {
    const base = path.basename(filePath, path.extname(filePath)).toLowerCase();
    const spec = DICTIONARIES.find((d) => d.basename === base);
    if (!spec) continue;

    console.log(`  Truncando ${spec.table}...`);
    await truncateLookup(spec.table);

    console.log(`  Carregando ${spec.label} de ${path.basename(filePath)}...`);

    let totalRows = 0;
    let totalSkipped = 0;

    await processFile(filePath, async (_entryName, stream) => {
      const stats = await streamCsvToCopy(
        stream,
        client,
        spec.copySQL,
        spec.parse,
        {
          encoding: cfg.encoding,
          maxRows: cfg.maxRows,
          progressEvery: cfg.progressEvery,
          label: spec.label,
        },
      );
      totalRows += stats.rows;
      totalSkipped += stats.skipped;
    });

    console.log(
      `  ${spec.label}: ${totalRows.toLocaleString("pt-BR")} registros` +
        (totalSkipped > 0 ? `, ${totalSkipped} ignorados` : ""),
    );
  }
}
