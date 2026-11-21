/**
 * Teste ponta a ponta da fila de exportação (com verificação do arquivo no MinIO).
 *
 * Fluxo:
 *   1. Cria CnpjExportJob no banco
 *   2. Sobe worker inline e enfileira o job
 *   3. Aguarda conclusão via BullMQ QueueEvents (timeout 60s)
 *   4. Verifica estado final no banco (status, storage_key, linhas, tamanho_bytes)
 *   5. Baixa o arquivo do MinIO, descomprime e valida o cabeçalho CSV
 *
 * Pré-requisitos:
 *   - PostgreSQL, Redis e MinIO rodando (docker compose up -d)
 *   - Bucket radar-exports criado (criado automaticamente pelo minio-init)
 *   - Pelo menos um usuário no banco (npm run seed --workspace=packages/db)
 *
 * Uso: npm run test:queue --workspace=apps/workers
 */

import { Queue, QueueEvents } from "bullmq";
import IORedis from "ioredis";
import { createGunzip } from "zlib";
import { Readable } from "stream";
import { PrismaClient } from "@radar/db";
import { EXPORT_QUEUE_NAME } from "@radar/shared";
import type { ExportJobPayload } from "@radar/shared";
import { GetObjectCommand, CreateBucketCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
import { createExportWorker } from "../queues/export-queue-consumer.js";
import { createS3Client, getS3Config } from "../lib/s3-client.js";

const REDIS_URL  = process.env.REDIS_URL  ?? "redis://localhost:6379";
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("DATABASE_URL não definida");
  process.exit(1);
}

const prisma = new PrismaClient();

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getTestUserId(): Promise<string> {
  const user = await prisma.user.findFirst();
  if (!user) {
    throw new Error(
      "Nenhum usuário encontrado. Execute: npm run seed --workspace=packages/db"
    );
  }
  return user.id;
}

/** Garante que o bucket existe no MinIO antes de tentar o upload. */
async function ensureBucketExists(): Promise<void> {
  const config = getS3Config();
  const s3 = createS3Client(config);

  try {
    await s3.send(new HeadBucketCommand({ Bucket: config.bucket }));
  } catch {
    console.log(`[setup] bucket "${config.bucket}" não existe — criando...`);
    await s3.send(new CreateBucketCommand({ Bucket: config.bucket }));
    console.log(`[setup] bucket "${config.bucket}" criado`);
  }
}

/** Baixa o arquivo gzipado do MinIO, descomprime e retorna o conteúdo como string. */
async function downloadAndDecompress(storageKey: string): Promise<string> {
  const config = getS3Config();
  const s3 = createS3Client(config);

  const resp = await s3.send(
    new GetObjectCommand({ Bucket: config.bucket, Key: storageKey })
  );

  if (!resp.Body) {
    throw new Error("Resposta S3 sem Body");
  }

  const gunzip = createGunzip();
  const chunks: Buffer[] = [];

  // resp.Body é um SdkStreamMixin (AsyncIterable em Node.js ≥ 18)
  const bodyStream = resp.Body as unknown as AsyncIterable<Uint8Array>;
  const readable = Readable.from(bodyStream);

  await new Promise<void>((resolve, reject) => {
    readable
      .pipe(gunzip)
      .on("data", (chunk: Buffer) => chunks.push(chunk))
      .on("end", resolve)
      .on("error", reject);
  });

  return Buffer.concat(chunks).toString("utf-8");
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("=".repeat(60));
  console.log("Teste ponta a ponta — fila cnpj-export + MinIO");
  console.log("=".repeat(60));

  // ── 0. Garante bucket ────────────────────────────────────────────────────
  await ensureBucketExists();

  // ── 1. Cria registro de auditoria no banco ───────────────────────────────
  const testFilters = { situacao: "Ativa" };

  const dbJob = await prisma.cnpjExportJob.create({
    data: {
      usuario_id: await getTestUserId(),
      filtros:    testFilters,
      status:     "queued",
    },
  });

  console.log(`\n[1] CnpjExportJob criado → id=${dbJob.id} status=${dbJob.status}`);

  // ── 2. Sobe worker inline ────────────────────────────────────────────────
  const worker = createExportWorker();
  console.log(`[2] Worker iniciado (fila: ${EXPORT_QUEUE_NAME})`);

  // ── 3. Enfileira job ─────────────────────────────────────────────────────
  const qConn = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
  const queue = new Queue<ExportJobPayload>(EXPORT_QUEUE_NAME, {
    connection: qConn,
  });

  const payload: ExportJobPayload = {
    exportJobId: dbJob.id,
    usuarioId:   dbJob.usuario_id,
    filtros:     testFilters,
  };

  const bullJob = await queue.add("export-cnpj", payload, { jobId: dbJob.id });
  console.log(`[3] Job enfileirado → BullMQ id=${bullJob.id}`);

  // ── 4. Aguarda conclusão via QueueEvents ─────────────────────────────────
  console.log("[4] Aguardando conclusão (timeout 60s)...");

  const eventsConn = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
  const queueEvents = new QueueEvents(EXPORT_QUEUE_NAME, {
    connection: eventsConn,
  });

  let jobFinished = false;
  try {
    // BullMQ v5: waitUntilFinished é método do Job
    await bullJob.waitUntilFinished(queueEvents, 60_000);
    jobFinished = true;
  } catch (err) {
    console.error(`[4] FALHOU: ${err instanceof Error ? err.message : err}`);
  }

  // ── 5. Estado final no banco ─────────────────────────────────────────────
  const finalJob = await prisma.cnpjExportJob.findUnique({
    where: { id: dbJob.id },
  });

  console.log("\n" + "─".repeat(60));
  console.log("Estado final no banco:");
  console.log(`  id:            ${finalJob?.id}`);
  console.log(`  status:        ${finalJob?.status}`);
  console.log(`  progresso:     ${finalJob?.progresso_pct}%`);
  console.log(`  linhas:        ${finalJob?.linhas ?? "null"}`);
  console.log(`  tamanho_bytes: ${finalJob?.tamanho_bytes?.toString() ?? "null"}`);
  console.log(`  storage_key:   ${finalJob?.storage_key ?? "null"}`);
  console.log(`  concluido_em:  ${finalJob?.concluido_em?.toISOString() ?? "null"}`);
  console.log(`  erro:          ${finalJob?.erro ?? "null"}`);
  console.log("─".repeat(60));

  let ok = jobFinished && finalJob?.status === "completed";

  // ── 6. Verifica arquivo no MinIO ─────────────────────────────────────────
  if (ok && finalJob?.storage_key) {
    console.log("\n[6] Verificando arquivo no MinIO...");
    try {
      const content = await downloadAndDecompress(finalJob.storage_key);
      const firstLine = content.split("\n")[0] ?? "";
      const csvValid  = firstLine.includes("CNPJ") && firstLine.includes("Razão Social");

      console.log(`  primeiros 200 chars: ${content.slice(0, 200).replace(/\n/g, "↵")}`);
      console.log(`  CSV válido (header): ${csvValid ? "✓" : "✗"}`);
      console.log(`  linhas no arquivo:   ${content.split("\n").filter(Boolean).length - 1} (excl. header)`);

      if (!csvValid) ok = false;
    } catch (err) {
      console.error(
        "  Erro ao baixar/verificar arquivo:",
        err instanceof Error ? err.message : err
      );
      ok = false;
    }
  }

  // ── Resultado ─────────────────────────────────────────────────────────────
  console.log(`\nResultado: ${ok ? "✓ PASSOU" : "✗ FALHOU"}\n`);

  // ── Teardown ──────────────────────────────────────────────────────────────
  await queueEvents.close();
  await queue.close();
  qConn.disconnect();
  eventsConn.disconnect();
  await worker.close();
  await prisma.$disconnect();

  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
