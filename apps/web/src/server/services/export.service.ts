import { CnpjSearchFiltersSchema } from "@radar/shared";
import * as exportJobRepository from "@/server/repositories/export-job.repository";
import { exportQueue } from "@/server/queue/export-queue";
import { redis } from "@/server/lib/redis-client";
import type { CnpjExportJob } from "@/server/repositories/export-job.repository";
import { getS3Client } from "@/server/lib/s3-client";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type { CnpjExportJob };

// ── Limites de rate ───────────────────────────────────────────────────────────

const CONCURRENT_LIMIT = 5;    // jobs queued + running por usuário
const HOURLY_LIMIT = 10;       // jobs criados por usuário por hora

// ── Erros de domínio ──────────────────────────────────────────────────────────

export class JobNotFoundError extends Error {
  constructor(id: string) {
    super(`Export job não encontrado: ${id}`);
    this.name = "JobNotFoundError";
  }
}

export class JobAccessDeniedError extends Error {
  constructor() {
    super("Acesso negado ao export job");
    this.name = "JobAccessDeniedError";
  }
}

export class ExportConcurrentLimitError extends Error {
  constructor() {
    super(
      `Limite de ${CONCURRENT_LIMIT} exportações simultâneas atingido. ` +
      "Aguarde a conclusão de uma exportação em andamento."
    );
    this.name = "ExportConcurrentLimitError";
  }
}

export class ExportHourlyLimitError extends Error {
  constructor() {
    super(
      `Limite de ${HOURLY_LIMIT} exportações por hora atingido. ` +
      "Tente novamente na próxima hora."
    );
    this.name = "ExportHourlyLimitError";
  }
}

// ── Implementação ─────────────────────────────────────────────────────────────

/**
 * Cria um job de exportação e o enfileira no BullMQ.
 *
 * Fluxo:
 *   1. Valida filtros com Zod (falha rápido, sem tocar banco nem fila).
 *   2. Persiste o registro em CnpjExportJob com status 'queued' (trilha de auditoria).
 *   3. Adiciona o job ao BullMQ usando o UUID do registro como jobId de correlação.
 *   4. Retorna imediatamente — não aguarda o processamento.
 *
 * O worker atualizará CnpjExportJob.status conforme o processamento avança.
 */
export async function createExportJob(
  userId: string,
  rawFilters: unknown
): Promise<CnpjExportJob> {
  const filters = CnpjSearchFiltersSchema.parse(rawFilters);

  // ── Limite de jobs simultâneos (via DB, sem side effect) ──────────────────
  const activeCount = await exportJobRepository.countActiveByUserId(userId);
  if (activeCount >= CONCURRENT_LIMIT) {
    throw new ExportConcurrentLimitError();
  }

  // ── Limite por hora (via Redis INCR com TTL) ───────────────────────────────
  // Redis indisponível não bloqueia a exportação — o limite de concorrência
  // via DB ainda protege contra abuso. Falha silenciosa e logada.
  try {
    const hourKey = `ratelimit:export:${userId}:${new Date().toISOString().slice(0, 13)}`;
    const hourlyCount = await redis.incr(hourKey);
    if (hourlyCount === 1) {
      await redis.expire(hourKey, 3_600);
    }
    if (hourlyCount > HOURLY_LIMIT) {
      throw new ExportHourlyLimitError();
    }
  } catch (err) {
    if (err instanceof ExportHourlyLimitError) throw err;
    console.warn("[export] Redis rate-limit indisponível, ignorando:", (err as Error).message);
  }

  const dbJob = await exportJobRepository.create({
    usuario_id: userId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    filtros: filters as any,
  });

  await exportQueue.add(
    "export-cnpj",
    { exportJobId: dbJob.id, usuarioId: userId, filtros: filters },
    // jobId = UUID do registro → correlação 1:1 entre Redis e Postgres
    { jobId: dbJob.id }
  );

  return dbJob;
}

/** Retorna o job se pertencer ao usuário. Lança se não existir ou acesso negado. */
export async function getJob(
  id: string,
  userId: string
): Promise<CnpjExportJob> {
  const job = await exportJobRepository.findById(id);

  if (!job) throw new JobNotFoundError(id);
  if (job.usuario_id !== userId) throw new JobAccessDeniedError();

  return job;
}

/** Retorna todos os jobs do usuário, do mais recente ao mais antigo. */
export async function getUserJobs(userId: string): Promise<CnpjExportJob[]> {
  return exportJobRepository.findByUserId(userId);
}

/**
 * Retorna a URL de download para o arquivo exportado.
 *
 * Para arquivos locais (storage_key com prefixo "local:") retorna a rota de
 * download interna — o browser usa o cookie de sessão para autenticar.
 * Para arquivos em R2/S3 retorna uma URL pré-assinada com TTL configurável.
 *
 * @throws JobNotFoundError  se o job não existir ou não pertencer ao usuário
 * @throws Error             se o job ainda não tem arquivo (storage_key ausente)
 */
export async function getJobDownloadUrl(
  id: string,
  userId: string
): Promise<string> {
  const job = await getJob(id, userId);

  if (!job.storage_key) {
    throw new Error(
      `Arquivo ainda não disponível para o job ${id} (status: ${job.status})`
    );
  }

  if (job.storage_key.startsWith("local:")) {
    return `/api/cnpj/export-jobs/${id}/download`;
  }

  const bucket = process.env.R2_BUCKET;
  if (!bucket) {
    throw new Error("R2_BUCKET não configurado");
  }

  const expiryHours = parseInt(
    process.env.CNPJ_EXPORT_PRESIGNED_URL_EXPIRY_HOURS ?? "4",
    10
  );

  const s3 = getS3Client();
  const url = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: bucket, Key: job.storage_key }),
    { expiresIn: expiryHours * 3_600 }
  );

  return url;
}
