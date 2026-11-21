/**
 * GET /api/cnpj/count-jobs/[id]/stream
 *
 * Server-Sent Events — acompanha em tempo real um job de contagem exata.
 * Mesmo padrão de polling interno do export-jobs stream, mas consultando o
 * job direto no BullMQ (getCountJobStatus) em vez do banco — este job não
 * tem tabela própria, ver comentário em cnpj-count.service.ts.
 *
 * Formato dos eventos (JSON no campo `data`):
 *   Em andamento:  { "status": "queued"|"active" }
 *   Concluído:     { "status": "completed", "count": 12483 }
 *   Falha:         { "status": "failed", "erro": "mensagem" }
 */

import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { getCountJobStatus } from "@/server/services/cnpj-count.service";

// Job de contagem é bem mais rápido que exportação — poll mais frequente.
const POLL_INTERVAL_MS = 500;

export const dynamic = "force-dynamic";

function formatSse(payload: Record<string, unknown>): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const initial = await getCountJobStatus(id);
  if (initial.status === "not_found") {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      let closed = false;
      let lastStatus = "";

      const cleanup = (): void => {
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        closed = true;
      };

      request.signal.addEventListener("abort", cleanup, { once: true });

      const send = (payload: Record<string, unknown>): void => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(formatSse(payload)));
        } catch {
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

      const checkAndEmit = async (): Promise<boolean> => {
        if (closed) return true;

        const job = await getCountJobStatus(id);

        if (job.status === "not_found") {
          closeStream();
          return true;
        }

        if (job.status === "completed") {
          send({ status: "completed", count: job.count });
          closeStream();
          return true;
        }

        if (job.status === "failed") {
          send({ status: "failed", erro: job.erro });
          closeStream();
          return true;
        }

        // queued ou active — só emite quando muda de estado
        if (job.status !== lastStatus) {
          lastStatus = job.status;
          send({ status: job.status });
        }

        return false;
      };

      const schedulePoll = (): void => {
        if (closed) return;
        timeoutId = setTimeout(async () => {
          if (closed) return;
          const done = await checkAndEmit();
          if (!done) schedulePoll();
        }, POLL_INTERVAL_MS);
      };

      const done = await checkAndEmit();
      if (!done) schedulePoll();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":      "text/event-stream",
      "Cache-Control":     "no-cache, no-transform",
      "Connection":        "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
