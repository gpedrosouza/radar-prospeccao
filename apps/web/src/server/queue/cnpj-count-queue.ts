/**
 * Fila BullMQ "cnpj-count" — lado producer (apps/web).
 *
 * Contagem exata em background: countByFiltersCapped (cnpj-search.service)
 * continua respondendo na hora com um teto de 10.000, mas para o usuário
 * que quer o total exato de uma busca ampla, este job roda um
 * prisma.count() sem teto no worker e reporta o resultado via SSE — sem
 * bloquear a rota síncrona de busca.
 *
 * Mesmo padrão de conexão do export-queue.ts. Em testes, este módulo
 * inteiro é substituído por vi.mock().
 */

import { Queue } from "bullmq";
import IORedis from "ioredis";
import { COUNT_QUEUE_NAME } from "@radar/shared";
import type { CountJobPayload, CountJobResult } from "@radar/shared";

const connection = new IORedis(
  process.env.REDIS_URL ?? "redis://localhost:6379",
  {
    maxRetriesPerRequest: null,
  }
);

connection.on("error", (err) => {
  console.error("[cnpj-count-queue] Redis connection error:", err.message);
});

export const cnpjCountQueue = new Queue<CountJobPayload, CountJobResult>(
  COUNT_QUEUE_NAME,
  {
    connection,
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: "exponential", delay: 2_000 },
      // Job efêmero — sem tela de histórico, curto TTL no Redis é suficiente.
      removeOnComplete: { count: 50, age: 3_600 },
      removeOnFail: { count: 50, age: 3_600 },
    },
  }
);
