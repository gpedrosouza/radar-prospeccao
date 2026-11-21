/**
 * GET  /api/cnpj/export-jobs  — lista os jobs do usuário autenticado
 * POST /api/cnpj/export-jobs  — cria um novo job de exportação
 *
 * Jobs longos são processados de forma assíncrona via BullMQ (apps/workers).
 * O POST retorna imediatamente com o ID do job — o cliente acompanha o progresso
 * via GET /api/cnpj/export-jobs/[id] ou o stream SSE em /[id]/stream.
 */

import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { ZodError } from "zod";
import * as exportService from "@/server/services/export.service";

export const dynamic = "force-dynamic";

// ── GET — histórico de jobs do usuário ────────────────────────────────────────

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const jobs = await exportService.getUserJobs(session.user.id);

  return Response.json({
    jobs: jobs.map((job) => ({
      ...job,
      // BigInt não é JSON-serializable
      tamanho_bytes: job.tamanho_bytes !== null ? job.tamanho_bytes.toString() : null,
    })),
    total: jobs.length,
  });
}

// ── POST — cria job e enfileira no BullMQ ────────────────────────────────────

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "body_inválido", detail: "JSON mal-formado" }, { status: 400 });
  }

  try {
    const job = await exportService.createExportJob(session.user.id, body);
    return Response.json(
      {
        id: job.id,
        status: job.status,
        criado_em: job.criado_em,
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof ZodError) {
      return Response.json(
        { error: "filtros_inválidos", details: err.flatten() },
        { status: 400 }
      );
    }
    if (
      err instanceof exportService.ExportConcurrentLimitError ||
      err instanceof exportService.ExportHourlyLimitError
    ) {
      return Response.json(
        { error: "rate_limit_excedido", detail: (err as Error).message },
        { status: 429 }
      );
    }
    throw err;
  }
}
