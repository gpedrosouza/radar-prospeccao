import { randomUUID } from "node:crypto";
import { CnpjSearchFiltersSchema } from "@radar/shared";
import { cnpjCountQueue } from "@/server/queue/cnpj-count-queue";

/**
 * Enfileira um job de contagem exata (sem o teto de 10.000 de
 * countByFiltersCapped). Valida os filtros com o mesmo schema da busca —
 * inclui a restrição de escopo geográfico, então uma busca sem uf/município/
 * raio nunca chega a enfileirar um job que varreria a base inteira.
 */
export async function enqueueCountJob(rawFilters: unknown): Promise<string> {
  const filtros = CnpjSearchFiltersSchema.parse(rawFilters);
  const jobId = randomUUID();
  await cnpjCountQueue.add("count", { filtros }, { jobId });
  return jobId;
}

export type CountJobStatus =
  | { status: "not_found" }
  | { status: "queued" | "active" }
  | { status: "completed"; count: number }
  | { status: "failed"; erro: string };

/** Consulta o estado do job direto no BullMQ — sem tabela própria no banco. */
export async function getCountJobStatus(jobId: string): Promise<CountJobStatus> {
  const job = await cnpjCountQueue.getJob(jobId);
  if (!job) return { status: "not_found" };

  const state = await job.getState();

  if (state === "completed") {
    return { status: "completed", count: job.returnvalue?.count ?? 0 };
  }
  if (state === "failed") {
    return { status: "failed", erro: job.failedReason ?? "Erro desconhecido ao contar" };
  }
  if (state === "active") return { status: "active" };

  return { status: "queued" };
}
