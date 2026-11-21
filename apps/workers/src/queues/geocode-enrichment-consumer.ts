/**
 * Consumer BullMQ da fila "geocode-enrichment".
 *
 * Processa a cascata de geocodificação (CNEFE por CEP → CNEFE por município
 * → BrasilAPI CEP → Google Geocoding, via geocodeCompany de
 * @radar/shared/server) para os CNPJs sem coordenada retornados por uma
 * busca no Mapa (enfileirados por GET /api/cnpj/companies).
 *
 * Regras de custo (CLAUDE.md — "trate custo como recurso finito"):
 *   - Teto de chamadas pagas (Google) por job via GEOCODE_ENRICHMENT_GOOGLE_CAP_PER_JOB.
 *   - Delay entre chamadas de rede (BrasilAPI/Google) via CNPJ_GEOCODE_DELAY_MS
 *     — CNEFE é lookup local, não tem delay.
 *   - Idempotência: a query que busca os CNPJs já filtra latitude IS NULL —
 *     se outro job resolveu um CNPJ nesse meio tempo, ele simplesmente não
 *     aparece no resultado, sem gastar nenhuma chamada à toa.
 *
 * NÃO importar nada de apps/web (CLAUDE.md regra 1).
 */

import { Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { PrismaClient } from "@radar/db";
import { GEOCODE_ENRICHMENT_QUEUE_NAME } from "@radar/shared";
import type { GeocodeEnrichmentJobPayload } from "@radar/shared";
import { geocodeCompany, type GeocodeSource } from "@radar/shared/server";

const prisma = new PrismaClient();

const DELAY_MS = parseInt(process.env.CNPJ_GEOCODE_DELAY_MS ?? "150", 10);
const GOOGLE_CAP_PER_JOB = parseInt(
  process.env.GEOCODE_ENRICHMENT_GOOGLE_CAP_PER_JOB ?? "20",
  10
);
const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

function makeConnection(): IORedis {
  return new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: null,
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Lookup CNEFE (Prisma) ───────────────────────────────────────────────────────

/** Resolve o centroide CNEFE do CEP extraído do endereço da empresa — direto, sem crosswalk. */
async function lookupCnefeCep(cep: string): Promise<{ lat: number; lng: number } | null> {
  const rows = await prisma.$queryRaw<{ latitude: number; longitude: number }[]>`
    SELECT latitude, longitude FROM cnefe_ceps WHERE cep = ${cep} LIMIT 1
  `;
  const row = rows[0];
  return row ? { lat: row.latitude, lng: row.longitude } : null;
}

/**
 * Resolve o centroide CNEFE do município de uma empresa a partir do código
 * de município da Receita Federal (company_cnpj.municipio_codigo). Fallback
 * de lookupCnefeCep — mais grosseiro (nível de cidade, não de CEP).
 *
 * company_cnpj.municipio_codigo usa o código de município da Receita Federal
 * (TOM), independente do código IBGE usado por cities.codigo_ibge e por
 * cnefe_municipio_centroides.codigo_municipio — o JOIN abaixo atravessa o
 * crosswalk cities.municipio_codigo_rf (ver cnpj-search.service.ts em
 * apps/web para o mesmo problema/solução no contexto da busca por raio).
 */
async function lookupCnefeCentroid(
  uf: string,
  municipioCodigoRf: number
): Promise<{ lat: number; lng: number } | null> {
  const rows = await prisma.$queryRaw<{ latitude: number; longitude: number }[]>`
    SELECT cc.latitude, cc.longitude
    FROM cities c
    JOIN cnefe_municipio_centroides cc
      ON cc.uf = c.uf AND cc.codigo_municipio = c.codigo_ibge
    WHERE c.uf = ${uf} AND c.municipio_codigo_rf = ${municipioCodigoRf}
    LIMIT 1
  `;
  const row = rows[0];
  return row ? { lat: row.latitude, lng: row.longitude } : null;
}

// ── Persistência ──────────────────────────────────────────────────────────────

async function persistCoords(
  id: bigint,
  uf: string,
  lat: number,
  lng: number,
  source: GeocodeSource
): Promise<void> {
  // WHERE inclui uf para direcionar o UPDATE à partição correta (mesmo
  // padrão de updateCoords em geocode-cnpj.ts). ST_MakePoint recebe
  // (longitude, latitude) — ordem oposta à convenção geográfica.
  await prisma.$executeRaw`
    UPDATE company_cnpj
    SET latitude       = ${lat},
        longitude      = ${lng},
        geom           = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
        geocode_source = ${source},
        atualizado_em  = NOW()
    WHERE id = ${id} AND uf = ${uf}
  `;
}

// ── Processador ───────────────────────────────────────────────────────────────

interface PendingRow {
  id: bigint;
  uf: string;
  endereco: string | null;
  municipio_nome: string;
  municipio_codigo: number;
}

async function processGeocodeEnrichmentJob(
  job: Job<GeocodeEnrichmentJobPayload>
): Promise<void> {
  const { items } = job.data;
  if (items.length === 0) return;

  // Agrupa por UF: partition pruning na query + reflete como os ids chegam
  // (uma busca no Mapa tipicamente cobre 1 UF, raramente cruza fronteira).
  const idsByUf = new Map<string, bigint[]>();
  for (const item of items) {
    const arr = idsByUf.get(item.uf) ?? [];
    arr.push(BigInt(item.id));
    idsByUf.set(item.uf, arr);
  }

  const pending: PendingRow[] = [];
  for (const [uf, ids] of idsByUf) {
    // latitude IS NULL de novo aqui = idempotência: se outro job já resolveu
    // este CNPJ nesse meio tempo, ele não volta nessa query.
    const rows = await prisma.$queryRaw<PendingRow[]>`
      SELECT id, uf, endereco, municipio_nome, municipio_codigo
      FROM company_cnpj
      WHERE uf = ${uf} AND id = ANY(${ids}) AND latitude IS NULL
    `;
    pending.push(...rows);
  }

  console.log(
    `[geocode-enrichment] job ${job.id}: ${items.length} solicitado(s), ${pending.length} pendente(s) (resto já resolvido ou não encontrado)`
  );

  const counts: Record<GeocodeSource | "nao_resolvido", number> = {
    cnefe_cep: 0,
    cnefe_municipio: 0,
    brasilapi_cep: 0,
    google_geocoding: 0,
    nao_resolvido: 0,
  };
  let googleCallsUsed = 0;

  for (const row of pending) {
    const allowGoogle = googleCallsUsed < GOOGLE_CAP_PER_JOB && Boolean(GOOGLE_API_KEY);

    const outcome = await geocodeCompany(
      { endereco: row.endereco, municipioNome: row.municipio_nome, uf: row.uf },
      {
        lookupCnefeCep,
        lookupCnefeCentroid: () => lookupCnefeCentroid(row.uf, row.municipio_codigo),
        googleApiKey: allowGoogle ? GOOGLE_API_KEY : undefined,
      }
    );

    if (outcome.googleAttempted) {
      googleCallsUsed++;
    }

    // Fontes locais (CNEFE) não custam nem precisam de delay — só BrasilAPI/Google.
    const fonteLocal = outcome.result?.source === "cnefe_cep" || outcome.result?.source === "cnefe_municipio";

    if (outcome.result) {
      await persistCoords(row.id, row.uf, outcome.result.lat, outcome.result.lng, outcome.result.source);
      counts[outcome.result.source]++;
    } else {
      counts.nao_resolvido++;
    }

    if (!fonteLocal) {
      await delay(DELAY_MS);
    }
  }

  console.log(
    `[geocode-enrichment] job ${job.id} concluído — ` +
      `cnefe_cep=${counts.cnefe_cep} cnefe_municipio=${counts.cnefe_municipio} ` +
      `brasilapi_cep=${counts.brasilapi_cep} ` +
      `google_geocoding=${counts.google_geocoding} (cap=${GOOGLE_CAP_PER_JOB}) ` +
      `não_resolvido=${counts.nao_resolvido}`
  );
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createGeocodeEnrichmentWorker(): Worker<GeocodeEnrichmentJobPayload> {
  const worker = new Worker<GeocodeEnrichmentJobPayload>(
    GEOCODE_ENRICHMENT_QUEUE_NAME,
    processGeocodeEnrichmentJob,
    {
      connection: makeConnection(),
      // Concorrência 1: evita que dois jobs concorrentes gastem chamadas
      // Google em paralelo sem visibilidade um do outro (o cap é por job,
      // não global — concorrência baixa mantém o comportamento previsível).
      concurrency: 1,
    }
  );

  worker.on("failed", (job, err) => {
    console.error(
      `[geocode-enrichment] job ${job?.id} falhou:`,
      err.message
    );
  });

  worker.on("error", (err) => {
    console.error("[geocode-enrichment] worker error:", err.message);
  });

  async function shutdown() {
    console.log("[geocode-enrichment] encerrando graciosamente...");
    await worker.close();
    await prisma.$disconnect();
  }

  process.on("SIGTERM", () => shutdown().then(() => process.exit(0)));
  process.on("SIGINT", () => shutdown().then(() => process.exit(0)));

  return worker;
}
