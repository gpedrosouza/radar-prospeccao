/**
 * Consumer BullMQ da fila "cnpj-count".
 *
 * Contagem exata (sem teto) rodando em background — o pedido síncrono
 * (GET /api/cnpj/companies) continua usando countByFiltersCapped (teto de
 * 10.000) pra nunca bloquear a UI; este job roda o count() completo e
 * reporta via SSE quando termina.
 *
 * Resolução geográfica (lat/lng/raio_km → municipio_codigos) duplicada de
 * radius-search.service (apps/web) — mesma justificativa de
 * export-queue-consumer.ts: evitar importação cruzada entre apps (CLAUDE.md
 * regra 1). Se essa lógica mudar, replicar nos dois lugares.
 *
 * Sem tabela própria no banco — o resultado vive só no BullMQ (job
 * returnvalue), consultado pela rota SSE. Ver cnpj-count.service.ts (apps/web).
 *
 * NÃO importar nada de apps/web (CLAUDE.md regra 1).
 */

import { Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { PrismaClient, createCnpjRepository, resolveCnaePrefixos } from "@radar/db";
import type { FindByFiltersInput } from "@radar/db";
import { COUNT_QUEUE_NAME } from "@radar/shared";
import type { CountJobPayload, CountJobResult, CnpjSearchFilters } from "@radar/shared";

const prisma = new PrismaClient();
const cnpjRepository = createCnpjRepository(prisma);

function makeConnection(): IORedis {
  return new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: null,
  });
}

// ── Resolução geográfica (idêntica a export-queue-consumer.ts) ────────────────

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

async function processCountJob(job: Job<CountJobPayload>): Promise<CountJobResult> {
  const { filtros } = job.data;

  const municipio_codigos = await resolveMunicipioCodigos(filtros);
  // Mesma tradução setor → prefixos usada na busca e na exportação.
  const cnae_prefixos = await resolveCnaePrefixos(prisma, filtros);

  const filters: FindByFiltersInput = {
    uf:                filtros.uf,
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

  const count = await cnpjRepository.countByFilters(filters);

  console.log(`[count-worker] job ${job.id} concluído: count=${count}`);

  return { count };
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createCountWorker(): Worker<CountJobPayload, CountJobResult> {
  const worker = new Worker<CountJobPayload, CountJobResult>(
    COUNT_QUEUE_NAME,
    processCountJob,
    {
      connection: makeConnection(),
      concurrency: 4,
    }
  );

  worker.on("failed", (job, err) => {
    console.error(
      `[count-worker] job ${job?.id} falhou` +
        ` (tentativa ${job?.attemptsMade}/${job?.opts.attempts ?? 1}):`,
      err.message
    );
  });

  worker.on("error", (err) => {
    console.error("[count-worker] worker error:", err.message);
  });

  async function shutdown() {
    console.log("[count-worker] encerrando graciosamente...");
    await worker.close();
    await prisma.$disconnect();
  }

  process.on("SIGTERM", () => shutdown().then(() => process.exit(0)));
  process.on("SIGINT",  () => shutdown().then(() => process.exit(0)));

  return worker;
}
