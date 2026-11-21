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
    return Response.json({
      ...job,
      tamanho_bytes: job.tamanho_bytes !== null ? job.tamanho_bytes.toString() : null,
    });
  } catch (err) {
    if (err instanceof exportService.JobNotFoundError) {
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    if (err instanceof exportService.JobAccessDeniedError) {
      return Response.json({ error: "forbidden" }, { status: 403 });
    }
    throw err;
  }
}
