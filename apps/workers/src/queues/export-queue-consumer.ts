/**
 * Consumer BullMQ da fila "cnpj-export".
 *
 * Responsabilidades:
 *   1. Marcar CnpjExportJob como 'running'
 *   2. Resolver parâmetros geográficos (lat/lng/raio_km) → municipio_codigos
 *   3. Paginar company_cnpj via cursor e fazer upload CSV gzipado para R2/MinIO
 *   4. Atualizar storage_key, tamanho_bytes, linhas e progresso_pct
 *   5. Marcar como 'completed' ou 'failed' conforme resultado
 *
 * Retry: 3 tentativas, backoff exponencial de 5s (configurado no producer em
 * apps/web/src/server/queue/export-queue.ts).
 *
 * NÃO importar nada de apps/web (CLAUDE.md regra 1).
 */

import { Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { PrismaClient, resolveCnaePrefixos } from "@radar/db";
import type { FindByFiltersInput } from "@radar/db";
import { EXPORT_QUEUE_NAME } from "@radar/shared";
import type { ExportJobPayload, CnpjSearchFilters } from "@radar/shared";
import { exportToCsv } from "../lib/csv-exporter.js";

const prisma = new PrismaClient();

function makeConnection(): IORedis {
  return new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: null,
  });
}

// ── Resolução geográfica ──────────────────────────────────────────────────────

/**
 * Converte parâmetros de raio (lat/lng/raio_km) em lista de municipio_codigos.
 *
 * Duplica a lógica de radius-search.service (apps/web) para evitar importação
 * cruzada entre apps (CLAUDE.md regra 1). O worker tem acesso ao banco via Prisma.
 *
 * company_cnpj.municipio_codigo usa o código de município da Receita Federal
 * (TOM), independente do código IBGE (cities.codigo_ibge/filtros.municipio_codigo).
 * Por isso toda resolução passa por cities.municipio_codigo_rf (casado por
 * nome+UF via scripts/match-municipio-codigo-rf.ts) — ver o mesmo comentário
 * em apps/web/src/server/services/cnpj-search.service.ts.
 */
async function resolveMunicipioCodigoRf(codigoIbge: number): Promise<number[] | undefined> {
  const rows = await prisma.$queryRaw<{ municipio_codigo_rf: number | null }[]>`
    SELECT municipio_codigo_rf FROM cities WHERE codigo_ibge = ${codigoIbge} LIMIT 1
  `;
  return rows[0]?.municipio_codigo_rf != null ? [rows[0].municipio_codigo_rf] : undefined;
}

async function resolveMunicipioCodigos(
  filtros: CnpjSearchFilters
): Promise<number[] | undefined> {
  if (
    filtros.lat !== undefined &&
    filtros.lng !== undefined &&
    filtros.raio_km !== undefined
  ) {
    const raioMetros = filtros.raio_km * 1000;

    // geom (índice GIST) em vez de ST_MakePoint on-the-fly — mesma correção
    // de performance aplicada em city.repository.ts (apps/web).
    const cities = await prisma.$queryRaw<{ municipio_codigo_rf: number | null }[]>`
      SELECT municipio_codigo_rf
      FROM cities
      WHERE ST_DWithin(
        geom,
        ST_SetSRID(ST_MakePoint(${filtros.lng}, ${filtros.lat}), 4326)::geography,
        ${raioMetros}
      )
      AND categoria = 'municipio'
    `;

    if (cities.length > 0) {
      const codigos = cities
        .map((c) => c.municipio_codigo_rf)
        .filter((codigo): codigo is number => codigo !== null);
      return codigos.length > 0 ? codigos : undefined;
    }

    if (filtros.municipio_codigo !== undefined) {
      return resolveMunicipioCodigoRf(filtros.municipio_codigo);
    }

    return undefined;
  }

  if (filtros.municipio_codigo !== undefined) {
    return resolveMunicipioCodigoRf(filtros.municipio_codigo);
  }

  return undefined;
}

// ── Processador ───────────────────────────────────────────────────────────────

async function processExportJob(job: Job<ExportJobPayload>): Promise<void> {
  const { exportJobId, filtros } = job.data;

  console.log(
    `[export-worker] iniciando job ${job.id} (exportJobId=${exportJobId})`
  );

  // 1. Marcar como running
  await prisma.cnpjExportJob.update({
    where: { id: exportJobId },
    data: { status: "running" },
  });
  await job.updateProgress(0);

  // 2. Resolver municípios a partir de parâmetros geográficos
  const municipio_codigos = await resolveMunicipioCodigos(filtros);
  // Setor (seção CNAE) vira lista de divisões = prefixos de 2 dígitos. Mesma
  // função usada por apps/web, para busca e exportação nunca divergirem.
  const cnae_prefixos = await resolveCnaePrefixos(prisma, filtros);

  const filters: FindByFiltersInput = {
    uf:                filtros.uf,
    // Diferente de cnpj-search.service (web), este worker não infere UF a
    // partir do raio — nunca inferiu, ver resolveMunicipioCodigos acima.
    // ufs (multi-seleção explícita do usuário) só entra aqui quando uf não
    // foi informado, mesma precedência de uf vs uf_in em todo o resto do código.
    uf_in:             filtros.uf === undefined ? filtros.ufs : undefined,
    municipio_codigos,
    municipio_nome:    filtros.municipio_nome,
    municipio_nomes:   filtros.municipio_nomes,
    situacao:          filtros.situacao,
    cnae_prefixo:      filtros.cnae_prefixo,
    cnae_prefixos,
    porte:             filtros.porte,
    portes:            filtros.portes,
    matriz_filial:     filtros.matriz_filial,
    natureza_juridica:   filtros.natureza_juridica,
    naturezas_juridicas: filtros.naturezas_juridicas,
    opcao_simples:     filtros.opcao_simples,
    opcao_mei:         filtros.opcao_mei,
    data_abertura_de:  filtros.data_abertura_de,
    data_abertura_ate: filtros.data_abertura_ate,
    texto_livre:       filtros.texto_livre,
  };

  // 3. Chave de destino no bucket
  const storageKey = `exports/${exportJobId}/${Date.now()}.csv.gz`;

  console.log(
    `[export-worker] job ${job.id} → key=${storageKey}`,
    `filtros=${JSON.stringify(filters)}`
  );

  // 4. Callback de progresso: atualiza banco e BullMQ a cada N linhas
  const onProgress = async (rowsProcessed: number): Promise<void> => {
    // Estimativa: 1.000 linhas ≈ 1%. Capped em 99% até o upload completar.
    const pct = Math.min(99, Math.round(rowsProcessed / 1_000));
    await prisma.cnpjExportJob.update({
      where: { id: exportJobId },
      data: { progresso_pct: pct },
    });
    await job.updateProgress(pct);
  };

  // 5. Exportar: paginar DB → CSV → gzip → S3 multipart
  const result = await exportToCsv(prisma, filters, storageKey, onProgress);

  console.log(
    `[export-worker] job ${job.id} upload concluído:`,
    `rows=${result.totalRows} bytes=${result.sizeBytes}`
  );

  // 6. Marcar como completed com metadados do arquivo
  await prisma.cnpjExportJob.update({
    where: { id: exportJobId },
    data: {
      status:        "completed",
      storage_key:   result.storageKey,
      tamanho_bytes: BigInt(result.sizeBytes),
      linhas:        result.totalRows,
      progresso_pct: 100,
      concluido_em:  new Date(),
    },
  });

  await job.updateProgress(100);

  console.log(`[export-worker] job ${job.id} concluído`);
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createExportWorker(): Worker<ExportJobPayload> {
  const worker = new Worker<ExportJobPayload>(
    EXPORT_QUEUE_NAME,
    processExportJob,
    {
      connection: makeConnection(),
      concurrency: 2,
    }
  );

  // 'failed' só dispara quando todas as tentativas se esgotam (BullMQ v5).
  worker.on("failed", async (job, err) => {
    const isFinalAttempt =
      !job || job.attemptsMade >= (job.opts.attempts ?? 1);

    console.error(
      `[export-worker] job ${job?.id} falhou` +
        ` (tentativa ${job?.attemptsMade}/${job?.opts.attempts ?? 1}):`,
      err.message
    );

    if (isFinalAttempt && job?.data.exportJobId) {
      await prisma.cnpjExportJob
        .update({
          where: { id: job.data.exportJobId },
          data: {
            status:       "failed",
            erro:         err.message.slice(0, 1000),
            concluido_em: new Date(),
          },
        })
        .catch((dbErr) => {
          console.error(
            "[export-worker] erro ao registrar falha no banco:",
            dbErr
          );
        });
    }
  });

  worker.on("error", (err) => {
    console.error("[export-worker] worker error:", err.message);
  });

  async function shutdown() {
    console.log("[export-worker] encerrando graciosamente...");
    await worker.close();
    await prisma.$disconnect();
  }

  process.on("SIGTERM", () => shutdown().then(() => process.exit(0)));
  process.on("SIGINT",  () => shutdown().then(() => process.exit(0)));

  return worker;
}
