/**
 * Fila BullMQ "geocode-enrichment" — lado producer (apps/web).
 *
 * Enfileirada fire-and-forget pela rota GET /api/cnpj/companies quando a
 * busca retorna CNPJs sem coordenada — nunca bloqueia a resposta ao usuário.
 * Mesmo padrão de conexão de export-queue.ts. Em testes, este módulo inteiro
 * é substituído por vi.mock().
 */

import { Queue } from "bullmq";
import IORedis from "ioredis";
import { GEOCODE_ENRICHMENT_QUEUE_NAME } from "@radar/shared";
import type { GeocodeEnrichmentJobPayload } from "@radar/shared";

const connection = new IORedis(
  process.env.REDIS_URL ?? "redis://localhost:6379",
  {
    maxRetriesPerRequest: null,
  }
);

connection.on("error", (err) => {
  console.error("[geocode-enrichment-queue] Redis connection error:", err.message);
});

export const geocodeEnrichmentQueue = new Queue<GeocodeEnrichmentJobPayload>(
  GEOCODE_ENRICHMENT_QUEUE_NAME,
  {
    connection,
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: "exponential", delay: 5_000 },
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 100 },
    },
  }
);
