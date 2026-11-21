/**
 * Singleton IORedis para uso no contexto servidor do Next.js.
 *
 * Separado do export-queue.ts (que tem sua própria conexão para BullMQ)
 * para evitar dependências cruzadas entre fila e features como health check
 * e rate limiting.
 *
 * lazyConnect: true  → não tenta conectar ao importar o módulo,
 *                       só na primeira chamada. Evita falha no startup se
 *                       Redis estiver temporariamente indisponível.
 * maxRetriesPerRequest: 1 → uma tentativa + um retry para tolerância a
 *                            glitches transitórios. Não bloqueia por muito tempo.
 */

import IORedis from "ioredis";

const globalForRedis = globalThis as unknown as { redisClient: IORedis };

export const redis =
  globalForRedis.redisClient ??
  new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 5_000,
    enableOfflineQueue: false,
    // Reconecta automaticamente após erros de stream (ex: suspend/resume do SO)
    reconnectOnError: () => true,
  });

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redisClient = redis;
}
