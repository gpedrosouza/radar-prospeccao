import yauzl from "yauzl";
import fs from "node:fs";
import path from "node:path";
import { createReadStream } from "node:fs";

export type EntryHandler = (
  entryName: string,
  stream: NodeJS.ReadableStream,
) => Promise<void>;

async function processZipFile(zipPath: string, handler: EntryHandler): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipFile) => {
      if (err) return reject(err);

      zipFile.readEntry();

      zipFile.on("entry", (entry: yauzl.Entry) => {
        // Skip directory entries
        if (/\/$/.test(entry.fileName)) {
          zipFile.readEntry();
          return;
        }

        zipFile.openReadStream(entry, (streamErr, readStream) => {
          if (streamErr) return reject(streamErr);

          handler(entry.fileName, readStream)
            .then(() => zipFile.readEntry())
            .catch((handlerErr: unknown) => {
              readStream.destroy();
              reject(handlerErr);
            });
        });
      });

      zipFile.on("end", resolve);
      zipFile.on("error", reject);
    });
  });
}

async function processCsvFile(csvPath: string, handler: EntryHandler): Promise<void> {
  const stream = createReadStream(csvPath);
  await handler(path.basename(csvPath), stream);
}

export async function processFile(filePath: string, handler: EntryHandler): Promise<void> {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".zip") {
    await processZipFile(filePath, handler);
  } else if (ext === ".csv") {
    await processCsvFile(filePath, handler);
  } else {
    throw new Error(`Tipo de arquivo não suportado: ${ext}`);
  }
}

/**
 * Encontra arquivos no diretório que correspondem aos basenames informados.
 * Prefere .zip sobre .csv quando ambos existem.
 */
export function findFiles(dir: string, basenames: readonly string[]): string[] {
  const allFiles = fs.readdirSync(dir);
  const allFilesLower = allFiles.map((f) => f.toLowerCase());
  const result: string[] = [];

  for (const basename of basenames) {
    const bn = basename.toLowerCase();

    const zipIdx = allFilesLower.indexOf(`${bn}.zip`);
    if (zipIdx !== -1) {
      result.push(path.join(dir, allFiles[zipIdx]!));
      continue;
    }

    const csvIdx = allFilesLower.indexOf(`${bn}.csv`);
    if (csvIdx !== -1) {
      result.push(path.join(dir, allFiles[csvIdx]!));
    }
  }

  return result;
}

/** Basenames numerados de Empresas0 a Empresas9. */
export const EMPRESA_BASENAMES = Array.from(
  { length: 10 },
  (_, i) => `empresas${i}`,
);

/** Basenames numerados de Socios0 a Socios9. */
export const SOCIO_BASENAMES = Array.from(
  { length: 10 },
  (_, i) => `socios${i}`,
);

/** Basenames numerados de Estabelecimentos0 a Estabelecimentos9. */
export const ESTABELECIMENTO_BASENAMES = Array.from(
  { length: 10 },
  (_, i) => `estabelecimentos${i}`,
);

export const DICTIONARY_BASENAMES = [
  "cnaes",
  "naturezas",
  "municipios",
  "paises",
  "qualificacoes",
] as const;
