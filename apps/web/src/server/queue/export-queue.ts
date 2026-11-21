/**
 * Fila BullMQ "cnpj-export" — lado producer (apps/web).
 *
 * Este módulo conecta ao Redis e exporta o singleton da Queue. Importado
 * apenas pelo export.service; rotas de API nunca usam a fila diretamente.
 *
 * A conexão é estabelecida na primeira importação do módulo. Em testes,
 * este módulo inteiro é substituído por vi.mock().
 */

import { Queue } from "bullmq";
import IORedis from "ioredis";
import { EXPORT_QUEUE_NAME } from "@radar/shared";
import type { ExportJobPayload } from "@radar/shared";

const connection = new IORedis(
  process.env.REDIS_URL ?? "redis://localhost:6379",
  {
    // Obrigatório para Workers BullMQ — mantemos aqui por consistência com o consumer.
    maxRetriesPerRequest: null,
  }
);

connection.on("error", (err) => {
  console.error("[export-queue] Redis connection error:", err.message);
});

export const exportQueue = new Queue<ExportJobPayload>(EXPORT_QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5_000 },
    // Mantém histórico limitado no Redis para inspeção via BullMQ Board.
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 200 },
  },
});
