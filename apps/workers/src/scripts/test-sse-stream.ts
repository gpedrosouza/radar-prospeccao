/**
 * Teste manual do fluxo SSE completo.
 *
 * O script automatiza a parte de setup (criação do job + worker BullMQ inline)
 * e imprime o snippet EventSource para colar no console do navegador.
 *
 * Pré-requisitos:
 *   1. docker compose up -d             (PostgreSQL, Redis, MinIO)
 *   2. npm run dev --workspace=apps/web  (em outro terminal — porta 3000)
 *   3. Estar logado em http://localhost:3000 no navegador (sessão ativa)
 *
 * Uso: npm run test:sse --workspace=apps/workers
 *
 * Fluxo:
 *   Terminal:   executa este script → cria job → inicia worker → processa exportação
 *   Navegador:  cole o snippet EventSource → acompanhe os eventos em tempo real
 */

import { Queue } from "bullmq";
import IORedis from "ioredis";
import { PrismaClient } from "@radar/db";
import { EXPORT_QUEUE_NAME } from "@radar/shared";
import type { ExportJobPayload } from "@radar/shared";
import { createExportWorker } from "../queues/export-queue-consumer.js";

const REDIS_URL    = process.env.REDIS_URL  ?? "redis://localhost:6379";
const DATABASE_URL = process.env.DATABASE_URL;
const WEB_URL      = process.env.WEB_URL    ?? "http://localhost:3000";

if (!DATABASE_URL) {
  console.error("DATABASE_URL não definida em apps/workers/.env");
  process.exit(1);
}

const prisma = new PrismaClient();

async function getTestUserId(): Promise<string> {
  const user = await prisma.user.findFirst();
  if (!user) {
    throw new Error(
      "Nenhum usuário encontrado. Execute: npm run seed --workspace=packages/db"
    );
  }
  return user.id;
}

async function main(): Promise<void> {
  console.log("=".repeat(60));
  console.log("Teste SSE — export-job stream em tempo real");
  console.log("=".repeat(60));

  // ── 1. Cria job no banco ─────────────────────────────────────────────────
  const testFilters = { situacao: "Ativa" };

  const dbJob = await prisma.cnpjExportJob.create({
    data: {
      usuario_id: await getTestUserId(),
      filtros:    testFilters,
      status:     "queued",
    },
  });
  console.log(`\n[1] CnpjExportJob criado → id=${dbJob.id}`);

  // ── 2. Enfileira no BullMQ ───────────────────────────────────────────────
  const qConn = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
  const queue  = new Queue<ExportJobPayload>(EXPORT_QUEUE_NAME, {
    connection: qConn,
  });

  await queue.add(
    "export-cnpj",
    { exportJobId: dbJob.id, usuarioId: dbJob.usuario_id, filtros: testFilters },
    { jobId: dbJob.id }
  );
  console.log("[2] Job enfileirado no BullMQ");

  // ── 3. Inicia worker inline ──────────────────────────────────────────────
  const worker = createExportWorker();
  console.log("[3] Worker BullMQ iniciado — processará o job em background");

  // ── 4. Snippet para o navegador ──────────────────────────────────────────
  const sseUrl = `${WEB_URL}/api/cnpj/export-jobs/${dbJob.id}/stream`;

  console.log(`
${"─".repeat(60)}
Cole o trecho abaixo no console do navegador
(você precisa estar logado em ${WEB_URL}):
${"─".repeat(60)}

const es = new EventSource('${sseUrl}', { withCredentials: true });

es.onmessage = (e) => {
  const ev = JSON.parse(e.data);
  console.log('[SSE evento]', ev);
  if (ev.status === 'completed') {
    console.log('[SSE] ✓ concluído — download:', ev.downloadUrl);
    es.close();
  }
  if (ev.status === 'failed') {
    console.error('[SSE] ✗ falhou —', ev.erro);
    es.close();
  }
};
es.onerror = (e) => console.error('[SSE erro de conexão]', e);
console.log('[SSE] conectado — aguardando eventos...');

${"─".repeat(60)}
`);

  // ── 5. Aguarda conclusão via banco (verificação independente do SSE) ─────
  console.log("[5] Aguardando conclusão (timeout 60 s)...\n");

  const deadline  = Date.now() + 60_000;
  let finalStatus = "";

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2_000));

    const job = await prisma.cnpjExportJob.findUnique({ where: { id: dbJob.id } });
    if (!job) { console.log("  job não encontrado no banco"); break; }

    finalStatus = job.status;
    console.log(`  banco → status=${job.status}  progresso=${job.progresso_pct}%  linhas=${job.linhas ?? "?"}`);

    if (job.status === "completed" || job.status === "failed") {
      console.log("\n" + "─".repeat(60));
      console.log("Estado final:");
      console.log(`  status:       ${job.status}`);
      console.log(`  progresso:    ${job.progresso_pct}%`);
      console.log(`  linhas:       ${job.linhas ?? "null"}`);
      console.log(`  tamanho:      ${job.tamanho_bytes?.toString() ?? "null"} bytes`);
      console.log(`  storage_key:  ${job.storage_key ?? "null"}`);
      console.log(`  erro:         ${job.erro ?? "null"}`);
      console.log("─".repeat(60));
      break;
    }
  }

  const ok = finalStatus === "completed";
  console.log(`\nResultado worker: ${ok ? "✓ PASSOU" : "✗ FALHOU ou timeout"}`);
  console.log(
    ok
      ? "O stream SSE deve ter entregue todos os eventos ao navegador."
      : "Verifique se o worker e o MinIO estão rodando corretamente."
  );

  // ── Teardown ─────────────────────────────────────────────────────────────
  await queue.close();
  qConn.disconnect();
  await worker.close();
  await prisma.$disconnect();

  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
