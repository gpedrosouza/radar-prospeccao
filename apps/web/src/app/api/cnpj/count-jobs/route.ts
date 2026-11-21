/**
 * POST /api/cnpj/count-jobs — enfileira uma contagem exata (sem o teto de
 * 10.000 usado pela busca síncrona). Retorna o ID do job imediatamente — o
 * cliente acompanha via GET /api/cnpj/count-jobs/[id]/stream (SSE).
 *
 * Filtros: mesmo formato de query params de GET /api/cnpj/companies, mas
 * recebidos no corpo (POST) — é uma criação de job, não uma busca.
 */

import type { NextRequest } from "next/server";
import { ZodError } from "zod";
import { auth } from "@/auth";
import { enqueueCountJob } from "@/server/services/cnpj-count.service";

export const dynamic = "force-dynamic";

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
    const jobId = await enqueueCountJob(body);
    return Response.json({ jobId }, { status: 201 });
  } catch (err) {
    if (err instanceof ZodError) {
      return Response.json(
        { error: "filtros_inválidos", details: err.flatten() },
        { status: 400 }
      );
    }
    throw err;
  }
}
