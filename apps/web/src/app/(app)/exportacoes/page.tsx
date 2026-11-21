import { auth } from "@/auth";
import { getUserJobs } from "@/server/services/export.service";
import { ExportacoesClient } from "./_components/ExportacoesClient";
import type { SerializedExportJob } from "./_components/types";

export default async function ExportacoesPage() {
  const session = await auth();
  // AppLayout já redireciona para /login se não autenticado — session é válida aqui
  const rawJobs = await getUserJobs(session!.user!.id!);

  const jobs: SerializedExportJob[] = rawJobs.map((job) => ({
    id: job.id,
    status: job.status as SerializedExportJob["status"],
    filtros: job.filtros as Record<string, unknown>,
    linhas: job.linhas,
    tamanho_bytes: job.tamanho_bytes !== null ? job.tamanho_bytes.toString() : null,
    storage_key: job.storage_key,
    progresso_pct: job.progresso_pct,
    erro: job.erro,
    criado_em: job.criado_em.toISOString(),
    concluido_em: job.concluido_em?.toISOString() ?? null,
  }));

  return <ExportacoesClient jobs={jobs} />;
}
