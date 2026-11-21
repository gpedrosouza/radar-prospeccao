/**
 * GET /api/cnpj/export-jobs/[id]/download
 *
 * Para arquivos em R2/S3: redireciona para URL pré-assinada.
 * Para arquivos locais (storage_key "local:…"): faz streaming direto do disco.
 */

import { createReadStream, existsSync } from "fs";
import { Readable } from "stream";
import path from "path";
import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import * as exportService from "@/server/services/export.service";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const job = await exportService.getJob(id, session.user.id);

    if (!job.storage_key) {
      return Response.json({ error: "arquivo não disponível" }, { status: 404 });
    }

    if (job.storage_key.startsWith("local:")) {
      // EXPORT_LOCAL_DIR é relativo ao CWD do Next.js (apps/web/), default "../.."
      // aponta para a raiz do monorepo onde o volume Docker monta ./exports/.
      const exportBaseDir = path.resolve(process.env.EXPORT_LOCAL_DIR ?? "../..");
      const relPath = job.storage_key.slice("local:".length);
      const filePath = path.join(exportBaseDir, relPath);

      if (!existsSync(filePath)) {
        return Response.json({ error: "arquivo não encontrado no servidor" }, { status: 404 });
      }

      const filename = path.basename(filePath);
      const nodeStream = createReadStream(filePath);
      const webStream = Readable.toWeb(nodeStream) as ReadableStream;

      return new Response(webStream, {
        headers: {
          "Content-Type": "application/gzip",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const url = await exportService.getJobDownloadUrl(id, session.user.id);
    return Response.redirect(url, 302);
  } catch (err) {
    if (err instanceof exportService.JobNotFoundError) {
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    if (err instanceof exportService.JobAccessDeniedError) {
      return Response.json({ error: "forbidden" }, { status: 403 });
    }
    const msg = err instanceof Error ? err.message : "Erro interno";
    return Response.json({ error: msg }, { status: 500 });
  }
}
