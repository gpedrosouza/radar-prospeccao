/**
 * GET /api/cnpj/export-jobs/[id]/stream
 *
 * Server-Sent Events — acompanha em tempo real o progresso de um job de exportação.
 *
 * Estratégia de polling interno:
 *   A rota mantém uma conexão SSE aberta e consulta o banco a cada POLL_INTERVAL_MS.
 *   Só emite eventos quando status ou progresso_pct mudam — sem flood de eventos
 *   sem mudança real. Isso é diferente de polling no frontend: uma única conexão
 *   SSE por job substitui N requisições periódicas do cliente.
 *
 * Formato dos eventos (JSON no campo `data`):
 *   Em andamento:  { "status": "queued"|"running", "progresso_pct": 42, "linhas": null }
 *   Concluído:     { "status": "completed", "progresso_pct": 100, "linhas": 41892, "downloadUrl": "…" }
 *   Falha:         { "status": "failed", "erro": "mensagem" }
 *
 * TODO — evolução para múltiplas instâncias de apps/web (horizontal scaling):
 *   O polling interno funciona bem com uma única instância. Para escalar, substituir
 *   por pub/sub Redis: o worker publica eventos de progresso em um canal
 *   (ex: `export:progress:{jobId}`) e cada instância do web subscreve para push
 *   imediato ao cliente SSE, sem precisar de poll. BullMQ já usa Redis — a mudança
 *   seria adicionar um `redis.publish()` no processador do job e um `redis.subscribe()`
 *   aqui no lugar do setTimeout recursivo.
 */

import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import * as exportService from "@/server/services/export.service";

// Intervalo entre consultas ao banco por conexão SSE ativa.
// 1,5 s cobre bem exports de 10 s a ~10 min sem sobrecarregar o banco.
const POLL_INTERVAL_MS = 1_500;

// Sem cache — esta rota é sempre dinâmica por natureza.
export const dynamic = "force-dynamic";

function formatSse(payload: Record<string, unknown>): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Obtém a sessão do JWT presente no cookie — auth() lê os headers da request
  // atual sem precisar de argon2 (que só é usado no authorize do sign-in).
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  // Valida existência e acesso ANTES de abrir o stream — retorna HTTP 404/403
  // correto sem o overhead de criar a conexão SSE primeiro.
  try {
    await exportService.getJob(id, userId);
  } catch (err) {
    if (err instanceof exportService.JobNotFoundError) {
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    if (err instanceof exportService.JobAccessDeniedError) {
      return Response.json({ error: "forbidden" }, { status: 403 });
    }
    throw err;
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      let closed = false;

      // Compara com o estado anterior para só emitir quando há mudança real.
      let lastStatus = "";
      let lastProgressPct = -1;

      const cleanup = (): void => {
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        closed = true;
      };

      // Cliente desconectou → para o polling imediatamente.
      request.signal.addEventListener("abort", cleanup, { once: true });

      const send = (payload: Record<string, unknown>): void => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(formatSse(payload)));
        } catch {
          // Stream já fechado pelo runtime antes do cleanup — ignora silenciosamente.
          cleanup();
        }
      };

      const closeStream = (): void => {
        if (closed) return;
        cleanup();
        try {
          controller.close();
        } catch {
          // já fechado
        }
      };

      /**
       * Consulta o banco, compara com o estado anterior e emite evento SSE
       * apenas se algo mudou. Retorna true quando o stream deve ser encerrado.
       */
      const checkAndEmit = async (): Promise<boolean> => {
        if (closed) return true;

        let job: Awaited<ReturnType<typeof exportService.getJob>>;
        try {
          job = await exportService.getJob(id, userId);
        } catch {
          // Job desapareceu ou perda de acesso após abertura — encerra silenciosamente.
          closeStream();
          return true;
        }

        const hasChanged =
          job.status !== lastStatus || job.progresso_pct !== lastProgressPct;

        if (!hasChanged) return false;

        lastStatus        = job.status;
        lastProgressPct   = job.progresso_pct;

        if (job.status === "completed") {
          let downloadUrl: string | undefined;
          try {
            downloadUrl = await exportService.getJobDownloadUrl(id, userId);
          } catch {
            // Falha na URL pré-assinada não aborta o evento de conclusão.
            // O cliente pode requisitar a URL via outro endpoint se necessário.
          }

          send({
            status:        "completed",
            progresso_pct: job.progresso_pct,
            linhas:        job.linhas,
            downloadUrl,
          });
          closeStream();
          return true;
        }

        if (job.status === "failed") {
          send({ status: "failed", erro: job.erro });
          closeStream();
          return true;
        }

        // queued ou running
        send({
          status:        job.status,
          progresso_pct: job.progresso_pct,
          linhas:        job.linhas,
        });

        return false;
      };

      // setTimeout recursivo em vez de setInterval: garante que só há uma
      // query em voo por vez — sem sobreposição se a resposta do banco demorar.
      const schedulePoll = (): void => {
        if (closed) return;
        timeoutId = setTimeout(async () => {
          if (closed) return;
          const done = await checkAndEmit();
          if (!done) schedulePoll();
        }, POLL_INTERVAL_MS);
      };

      // Primeiro evento imediato — cliente recebe feedback ao conectar, sem
      // esperar o primeiro tick do poll.
      const done = await checkAndEmit();
      if (!done) schedulePoll();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":      "text/event-stream",
      "Cache-Control":     "no-cache, no-transform",
      "Connection":        "keep-alive",
      // Desativa buffering em proxies nginx e na CDN da Vercel — necessário
      // para que os eventos SSE cheguem ao cliente imediatamente.
      "X-Accel-Buffering": "no",
    },
  });
}
