/**
 * Restauração de backup do PostgreSQL a partir do R2/MinIO.
 *
 * Uso:
 *   # Listar backups disponíveis:
 *   npm run restore --workspace=apps/workers
 *
 *   # Restaurar em banco específico (recomendado: banco de teste, nunca produção):
 *   npm run restore --workspace=apps/workers -- \
 *     --backup backup-2026-06-27-0300.dump \
 *     --db postgresql://radar:senha@localhost:5433/radar_db_restore
 *
 *   # Restaurar usando DATABASE_URL do ambiente:
 *   npm run restore --workspace=apps/workers -- --backup backup-2026-06-27-0300.dump
 *
 * Env obrigatórias:
 *   R2_BACKUP_BUCKET — bucket de origem
 *
 * Env opcionais com fallback:
 *   R2_BACKUP_ENDPOINT, R2_BACKUP_ACCESS_KEY_ID, R2_BACKUP_SECRET_ACCESS_KEY
 *
 * ATENÇÃO: pg_restore sobrescreve o banco de destino. Nunca use o banco de
 * produção como destino. O script cria o banco de destino se ele não existir,
 * mas não apaga dados existentes — use um banco limpo para testes de integridade.
 */

import { spawnSync } from "child_process";
import { unlinkSync, existsSync, createWriteStream } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { pipeline } from "stream/promises";
import {
  S3Client,
  GetObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import type { Readable } from "stream";

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
  const u = new URL(url);
  return {
    host: u.hostname,
    port: u.port || "5432",
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.slice(1),
  };
}

// ── Args ──────────────────────────────────────────────────────────────────────

interface RestoreArgs {
  backup: string | null;
  dbUrl: string | null;
}

function parseArgs(): RestoreArgs {
  const args = process.argv.slice(2);
  let backup: string | null = null;
  let dbUrl: string | null = process.env.DATABASE_URL ?? null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--backup" && args[i + 1]) {
      backup = args[++i];
    } else if (args[i] === "--db" && args[i + 1]) {
      dbUrl = args[++i];
    }
  }

  return { backup, dbUrl };
}

// ── Lista de backups disponíveis ──────────────────────────────────────────────

async function listBackups(client: S3Client, bucket: string): Promise<void> {
  const listed = await client.send(
    new ListObjectsV2Command({ Bucket: bucket, Prefix: "backups/" })
  );

  const items = listed.Contents ?? [];
  if (items.length === 0) {
    console.log("[restore] nenhum backup encontrado em", bucket);
    return;
  }

  const sorted = [...items].sort((a, b) =>
    (b.Key ?? "").localeCompare(a.Key ?? "")
  );

  console.log(`\nBackups disponíveis em ${bucket}:\n`);
  for (const item of sorted) {
    const sizeMb = item.Size
      ? `${(item.Size / 1024 / 1024).toFixed(1)} MB`
      : "? MB";
    const modified = item.LastModified
      ? item.LastModified.toISOString().slice(0, 16)
      : "?";
    const name = (item.Key ?? "").replace("backups/", "");
    console.log(`  ${name.padEnd(40)} ${sizeMb.padStart(10)}   ${modified}`);
  }

  console.log(
    "\nUso: npm run restore --workspace=apps/workers -- " +
      "--backup backup-YYYY-MM-DD-HHmm.dump " +
      "[--db postgresql://user:senha@host:porta/banco]"
  );
}

// ── Prepara banco limpo para restore ─────────────────────────────────────────

function prepareFreshDatabase(db: PgConnectionParams): void {
  // Restaurar sobre um banco com objetos pré-existentes causa conflitos com
  // schemas pré-instalados pela imagem postgis/postgis (tiger, topology, etc.).
  // A solução mais confiável: recriar do zero com template0 (sem PostGIS pré-instalado).
  console.log(`[restore] preparando banco limpo "${db.database}"...`);

  // Termina conexões abertas no banco (evita "in use" no DROP)
  spawnSync(
    "psql",
    [
      "--host", db.host,
      "--port", db.port,
      "--username", db.user,
      "--dbname", "postgres",
      "--no-password",
      "-c",
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity ` +
      `WHERE datname = '${db.database}' AND pid <> pg_backend_pid();`,
    ],
    {
      env: { ...process.env, PGPASSWORD: db.password },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  // Drop (se existir)
  const dropResult = spawnSync(
    "dropdb",
    [
      "--host", db.host,
      "--port", db.port,
      "--username", db.user,
      "--no-password",
      "--if-exists",
      db.database,
    ],
    {
      env: { ...process.env, PGPASSWORD: db.password },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  if (dropResult.status !== 0) {
    const stderr = dropResult.stderr?.toString().trim() ?? "";
    throw new Error(`dropdb falhou (exit ${String(dropResult.status)}): ${stderr}`);
  }

  // Cria vazio a partir de template0 (sem schemas pré-instalados pelo postgis/postgis)
  const createResult = spawnSync(
    "createdb",
    [
      "--host", db.host,
      "--port", db.port,
      "--username", db.user,
      "--no-password",
      "--template", "template0",
      db.database,
    ],
    {
      env: { ...process.env, PGPASSWORD: db.password },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  if (createResult.status !== 0) {
    const stderr = createResult.stderr?.toString().trim() ?? "";
    throw new Error(`createdb falhou (exit ${String(createResult.status)}): ${stderr}`);
  }

  console.log(`[restore] banco "${db.database}" recriado limpo (template0)`);
}

// ── Download do backup ────────────────────────────────────────────────────────

async function downloadBackup(
  client: S3Client,
  bucket: string,
  key: string,
  destPath: string
): Promise<void> {
  console.log(`[restore] baixando ${bucket}/${key}...`);

  const response = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: key })
  );

  if (!response.Body) {
    throw new Error("Resposta do R2 sem body — objeto pode não existir");
  }

  await pipeline(response.Body as Readable, createWriteStream(destPath));
  console.log(`[restore] download concluído → ${destPath}`);
}

// ── pg_restore ────────────────────────────────────────────────────────────────

function runPgRestore(db: PgConnectionParams, filePath: string): void {
  console.log(
    `[restore] rodando pg_restore → ${db.host}:${db.port}/${db.database}`
  );

  const result = spawnSync(
    "pg_restore",
    [
      "--host", db.host,
      "--port", db.port,
      "--username", db.user,
      "--dbname", db.database,
      "--no-password",
      "--no-owner",       // não tenta aplicar ownership do dump original
      "--no-privileges",  // não tenta aplicar GRANTs do dump original
      "--verbose",
      filePath,
    ],
    {
      env: { ...process.env, PGPASSWORD: db.password },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  // pg_restore usa stderr para o verbose normal — exibir sempre
  const stderr = result.stderr?.toString().trim() ?? "";
  if (stderr) console.log(stderr);

  const stdout = result.stdout?.toString().trim() ?? "";
  if (stdout) console.log(stdout);

  if (result.status !== 0) {
    throw new Error(
      `pg_restore falhou (exit ${String(result.status)}). ` +
        "Veja a saída acima para detalhes."
    );
  }

  console.log("[restore] pg_restore concluído com sucesso");
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { backup, dbUrl } = parseArgs();
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

  if (!backup) {
    await listBackups(client, config.bucket);
    return;
  }

  if (!dbUrl) {
    throw new Error(
      "Banco de destino não definido. " +
        "Use --db postgresql://... ou defina DATABASE_URL no ambiente."
    );
  }

  const key = backup.startsWith("backups/") ? backup : `backups/${backup}`;
  const db = parseDatabaseUrl(dbUrl);
  const tmpFile = join(tmpdir(), `radar-restore-${Date.now()}.dump`);

  console.log(`[restore] iniciando — ${new Date().toISOString()}`);
  console.log(`[restore] backup: ${key}`);
  console.log(`[restore] destino: ${db.host}:${db.port}/${db.database}`);
  console.log(
    "\n⚠️  ATENÇÃO: esta operação sobrescreve dados no banco de destino.\n"
  );

  try {
    prepareFreshDatabase(db);
    await downloadBackup(client, config.bucket, key, tmpFile);
    runPgRestore(db, tmpFile);
    console.log(`\n[restore] sucesso — ${new Date().toISOString()}`);
  } finally {
    if (existsSync(tmpFile)) {
      unlinkSync(tmpFile);
      console.log("[restore] arquivo temporário removido");
    }
  }
}

main().catch((err: unknown) => {
  console.error("[restore] ERRO FATAL:", err);
  process.exit(1);
});
