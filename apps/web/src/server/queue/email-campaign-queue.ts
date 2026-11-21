/**
 * Fila BullMQ "email-campaign" — lado producer (apps/web).
 *
 * Enfileira UM job por campanha (não um job por e-mail).
 * O consumer (apps/workers) itera pelos destinatários com delay entre envios.
 *
 * Em testes, este módulo inteiro é substituído por vi.mock().
 */

import { Queue } from "bullmq";
import IORedis from "ioredis";
import { EMAIL_CAMPAIGN_QUEUE_NAME } from "@radar/shared";
import type { EmailCampaignJobPayload } from "@radar/shared";

const connection = new IORedis(
  process.env.REDIS_URL ?? "redis://localhost:6379",
  { maxRetriesPerRequest: null }
);

connection.on("error", (err) => {
  console.error("[email-campaign-queue] Redis connection error:", err.message);
});

export const emailCampaignQueue = new Queue<EmailCampaignJobPayload>(
  EMAIL_CAMPAIGN_QUEUE_NAME,
  {
    connection,
    defaultJobOptions: {
      // Sem retry automático — falhas de envio são tratadas por destinatário no worker,
      // não por re-tentativa de toda a campanha. Campanhas parcialmente enviadas não
      // devem reenviar para quem já recebeu.
      attempts: 1,
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 200 },
    },
  }
);
