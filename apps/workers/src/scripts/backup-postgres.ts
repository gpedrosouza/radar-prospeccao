/**
 * Backup do PostgreSQL para R2/MinIO com política de retenção GFS simplificada.
 *
 * Uso:
 *   npm run backup --workspace=apps/workers
 *
 * Env obrigatórias:
 *   DATABASE_URL       — conexão com o banco a fazer backup
 *   R2_BACKUP_BUCKET   — bucket de destino (separado do radar-exports)
 *
 * Env opcionais (fallback para R2_* se não definidas):
 *   R2_BACKUP_ENDPOINT, R2_BACKUP_ACCESS_KEY_ID, R2_BACKUP_SECRET_ACCESS_KEY
 *
 * Formato do dump: -Fc (custom format do pg_dump, já comprimido com zlib).
 * Gzip adicional descartado: -Fc comprime ~70-80%, overhead extra é < 5%.
 *
 * Política de retenção (executada após upload bem-sucedido):
 *   ≤ 7 dias   → mantém todos (backups diários)
 *   7-30 dias  → mantém apenas os de domingo (backups semanais)
 *   > 30 dias  → remove todos
 */

import { spawnSync } from "child_process";
import { createReadStream, unlinkSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Upload } from "@aws-sdk/lib-storage";
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";

// ── Config ────────────────────────────────────────────────────────────────────

interface BackupS3Config {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

function getBackupS3Config(): BackupS3Config {
  const endpoint =
    process.env.R2_BACKUP_ENDPOINT ?? process.env.R2_ENDPOINT;
  const accessKeyId =
    process.env.R2_BACKUP_ACCESS_KEY_ID ?? process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey =
    process.env.R2_BACKUP_SECRET_ACCESS_KEY ?? process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BACKUP_BUCKET;

  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error(
      "Variáveis de backup não configuradas. Obrigatória: R2_BACKUP_BUCKET. " +
        "Opcionais com fallback: R2_BACKUP_ENDPOINT, R2_BACKUP_ACCESS_KEY_ID, " +
        "R2_BACKUP_SECRET_ACCESS_KEY (usam R2_* se não definidas)."
    );
  }

  return { endpoint, accessKeyId, secretAccessKey, bucket };
}

interface PgConnectionParams {
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
}

function parseDatabaseUrl(url: string): PgConnectionParams {
  // URL pode ter ?schema=public (Prisma-specific) — ignorar query string
  const u = new URL(url);
  return {
    host: u.hostname,
    port: u.port || "5432",
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.slice(1), // remove "/" inicial
  };
}

// ── Nomenclatura e retenção ───────────────────────────────────────────────────

const BACKUP_PREFIX = "backups/";

function buildBackupKey(): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const hh = String(now.getUTCHours()).padStart(2, "0");
  const min = String(now.getUTCMinutes()).padStart(2, "0");
  return `${BACKUP_PREFIX}backup-${yyyy}-${mm}-${dd}-${hh}${min}.dump`;
}

function parseBackupDate(key: string): Date | null {
  const match = key.match(
    /backup-(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})\.dump$/
  );
  if (!match) return null;
  const [, yyyy, mm, dd, hh, min] = match;
  return new Date(`${yyyy}-${mm}-${dd}T${hh}:${min}:00Z`);
}

function shouldKeep(key: string, now: Date): boolean {
  const date = parseBackupDate(key);
  if (!date) return true; // não reconhecido → preserva por segurança

  const ageDays =
    (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24);

  if (ageDays <= 7) return true;           // diários: todos nos últimos 7 dias
  if (ageDays <= 30) return date.getUTCDay() === 0; // semanais: só domingos
  return false;                              // > 30 dias: remove
}

// ── pg_dump ───────────────────────────────────────────────────────────────────

function runPgDump(db: PgConnectionParams, outputPath: string): void {
  console.log(`[backup] rodando pg_dump → ${outputPath}`);

  const result = spawnSync(
    "pg_dump",
    [
      "--host", db.host,
      "--port", db.port,
      "--username", db.user,
      "--dbname", db.database,
      "--format", "c",      // custom format: zlib-comprimido + restauração seletiva
      "--no-password",
      "--file", outputPath,
    ],
    {
      env: { ...process.env, PGPASSWORD: db.password },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  if (result.status !== 0) {
    const stderr = result.stderr?.toString().trim() ?? "";
    throw new Error(`pg_dump falhou (exit ${String(result.status)}): ${stderr}`);
  }

  console.log("[backup] pg_dump concluído");
}

// ── Upload multipart ──────────────────────────────────────────────────────────

async function uploadToR2(
  client: S3Client,
  bucket: string,
  key: string,
  filePath: string
): Promise<void> {
  console.log(`[backup] enviando para R2: ${bucket}/${key}`);

  const upload = new Upload({
    client,
    params: {
      Bucket: bucket,
      Key: key,
      Body: createReadStream(filePath),
      ContentType: "application/octet-stream",
    },
    partSize: 10 * 1024 * 1024, // 10 MB por parte
    queueSize: 4,
  });

  upload.on("httpUploadProgress", (progress) => {
    if (progress.loaded && progress.total) {
      const pct = Math.round((progress.loaded / progress.total) * 100);
      process.stdout.write(`\r[backup] upload: ${pct}%`);
    }
  });

  await upload.done();
  process.stdout.write("\n");
  console.log("[backup] upload concluído");
}

// ── Retenção ──────────────────────────────────────────────────────────────────

async function applyRetention(
  client: S3Client,
  bucket: string
): Promise<void> {
  console.log("[backup] aplicando política de retenção...");

  const listed = await client.send(
    new ListObjectsV2Command({ Bucket: bucket, Prefix: BACKUP_PREFIX })
  );

  const keys = (listed.Contents ?? []).map((o) => o.Key ?? "").filter(Boolean);
  const now = new Date();
  const toDelete = keys.filter((key) => !shouldKeep(key, now));

  if (toDelete.length === 0) {
    console.log("[backup] retenção: nenhum backup a remover");
    return;
  }

  console.log(
    `[backup] retenção: removendo ${toDelete.length} backup(s) antigo(s)`
  );

  await client.send(
    new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: { Objects: toDelete.map((Key) => ({ Key })) },
    })
  );

  for (const key of toDelete) {
    console.log(`[backup]   removido: ${key}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`[backup] iniciando — ${new Date().toISOString()}`);

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL não definida");

  const db = parseDatabaseUrl(databaseUrl);
  const config = getBackupS3Config();

  const client = new S3Client({
    endpoint: config.endpoint,
    region: "auto",
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: true,
  });

  const key = buildBackupKey();
  const tmpFile = join(tmpdir(), `radar-backup-${Date.now()}.dump`);

  try {
    runPgDump(db, tmpFile);
    await uploadToR2(client, config.bucket, key, tmpFile);
    await applyRetention(client, config.bucket);
    console.log(`[backup] sucesso: ${key} — ${new Date().toISOString()}`);
  } finally {
    if (existsSync(tmpFile)) {
      unlinkSync(tmpFile);
      console.log("[backup] arquivo temporário removido");
    }
  }
}

main().catch((err: unknown) => {
  console.error("[backup] ERRO FATAL:", err);
  process.exit(1);
});
