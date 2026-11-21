import { Transform, type TransformCallback } from "node:stream";
import { pipeline } from "node:stream/promises";
import * as iconv from "iconv-lite";
import { parse as csvParse } from "csv-parse";
import { from as pgCopyFrom } from "pg-copy-streams";
import type { Client } from "pg";

// Converte um campo para o formato COPY TEXT do PostgreSQL.
// NULL é representado por \N; caracteres especiais são escapados.
function escapeCopyText(v: string | null): string {
  if (v === null) return "\\N";
  return v
    .replace(/\\/g, "\\\\")
    .replace(/\t/g, "\\t")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r");
}

function formatCopyRow(values: (string | null)[]): string {
  return values.map(escapeCopyText).join("\t") + "\n";
}

export type ParseRowFn = (fields: string[]) => (string | null)[] | null;

export interface CopyStats {
  rows: number;
  skipped: number;
  limitReached: boolean;
}

class CsvToCopyTransform extends Transform {
  rows = 0;
  skipped = 0;
  limitReached = false;

  constructor(
    private readonly parseRow: ParseRowFn,
    private readonly maxRows: number | undefined,
    private readonly progressEvery: number,
    private readonly label: string,
  ) {
    // writableObjectMode: aceita string[] do csv-parse
    // readable side: emite strings (não object mode) para o pg COPY stream
    super({ writableObjectMode: true });
  }

  _transform(record: string[], _enc: string, callback: TransformCallback): void {
    if (this.maxRows !== undefined && this.rows >= this.maxRows) {
      if (!this.limitReached) {
        this.limitReached = true;
        process.stdout.write(
          `\n  [${this.label}] Limite de ${this.maxRows.toLocaleString("pt-BR")} linhas atingido\n`,
        );
      }
      return callback();
    }

    try {
      const row = this.parseRow(record);
      if (row !== null) {
        this.push(formatCopyRow(row));
        this.rows++;
        if (this.progressEvery > 0 && this.rows % this.progressEvery === 0) {
          process.stdout.write(
            `\r  [${this.label}] ${this.rows.toLocaleString("pt-BR")} linhas...`,
          );
        }
      } else {
        this.skipped++;
      }
    } catch {
      this.skipped++;
    }

    callback();
  }

  _flush(callback: TransformCallback): void {
    if (this.rows > 0) {
      process.stdout.write(
        `\r  [${this.label}] ${this.rows.toLocaleString("pt-BR")} linhas processadas\n`,
      );
    }
    callback();
  }
}

/**
 * Faz streaming de um arquivo CSV (dentro de um ZIP ou direto) para o
 * comando COPY FROM STDIN do PostgreSQL.
 *
 * O PostgreSQL aceita COPY direto na tabela-mãe particionada e redireciona
 * automaticamente para a partição correta com base nos valores inseridos
 * (comportamento garantido pelo PG 12+ para tabelas PARTITION BY LIST).
 */
export async function streamCsvToCopy(
  inputStream: NodeJS.ReadableStream,
  pgClient: Client,
  copySQL: string,
  parseRow: ParseRowFn,
  options: {
    encoding?: string;
    maxRows?: number;
    progressEvery?: number;
    label?: string;
  } = {},
): Promise<CopyStats> {
  const {
    encoding = "latin1",
    maxRows,
    progressEvery = 100_000,
    label = "linhas",
  } = options;

  const copyStream = pgClient.query(pgCopyFrom(copySQL));

  const csvParser = csvParse({
    delimiter: ";",
    relax_column_count: true,
    relax_quotes: true,
    skip_empty_lines: true,
    trim: false, // trim é feito dentro de cada parseRow
  });

  const rowTransform = new CsvToCopyTransform(parseRow, maxRows, progressEvery, label);

  const isLatin = !["utf8", "utf-8", "UTF8", "UTF-8"].includes(encoding);

  if (isLatin) {
    await pipeline(
      inputStream,
      iconv.decodeStream(encoding) as NodeJS.ReadWriteStream,
      csvParser as unknown as NodeJS.ReadWriteStream,
      rowTransform,
      copyStream,
    );
  } else {
    await pipeline(
      inputStream,
      csvParser as unknown as NodeJS.ReadWriteStream,
      rowTransform,
      copyStream,
    );
  }

  return {
    rows: rowTransform.rows,
    skipped: rowTransform.skipped,
    limitReached: rowTransform.limitReached,
  };
}
