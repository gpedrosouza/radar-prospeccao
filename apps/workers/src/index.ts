import { createExportWorker } from "./queues/export-queue-consumer.js";
import { createEmailCampaignWorker } from "./queues/email-campaign-consumer.js";
import { createGeocodeEnrichmentWorker } from "./queues/geocode-enrichment-consumer.js";
import { createCountWorker } from "./queues/cnpj-count-consumer.js";
import {
  EXPORT_QUEUE_NAME,
  EMAIL_CAMPAIGN_QUEUE_NAME,
  GEOCODE_ENRICHMENT_QUEUE_NAME,
  COUNT_QUEUE_NAME,
} from "@radar/shared";

async function main(): Promise<void> {
  console.log("Radar workers iniciando...");

  // Sem atribuir a variáveis: quem mantém o processo vivo é a conexão Redis
  // que cada Worker registra no event loop, não uma referência local — main()
  // retorna logo abaixo e qualquer const aqui sairia de escopo na mesma hora.
  createExportWorker();
  console.log(
    `[export-worker] aguardando jobs na fila "${EXPORT_QUEUE_NAME}"...`
  );

  createEmailCampaignWorker();
  console.log(
    `[email-campaign] aguardando jobs na fila "${EMAIL_CAMPAIGN_QUEUE_NAME}"...`
  );

  createGeocodeEnrichmentWorker();
  console.log(
    `[geocode-enrichment] aguardando jobs na fila "${GEOCODE_ENRICHMENT_QUEUE_NAME}"...`
  );

  createCountWorker();
  console.log(
    `[count-worker] aguardando jobs na fila "${COUNT_QUEUE_NAME}"...`
  );
}

main().catch((err) => {
  console.error("Falha ao iniciar workers:", err);
  process.exit(1);
});
