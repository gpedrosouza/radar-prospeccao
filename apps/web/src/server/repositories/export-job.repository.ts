import { prisma } from "@/lib/prisma";
import type { CnpjExportJob, ExportJobStatus, Prisma } from "@prisma/client";

// ── Tipos públicos ────────────────────────────────────────────────────────────

export type { CnpjExportJob };

export interface CreateJobInput {
  usuario_id: string;
  filtros: Prisma.InputJsonValue;
}

export interface UpdateJobInput {
  status?: ExportJobStatus;
  linhas?: number;
  tamanho_bytes?: bigint;
  storage_key?: string;
  progresso_pct?: number;
  erro?: string;
  concluido_em?: Date;
}

// ── Implementação ─────────────────────────────────────────────────────────────

export async function create(data: CreateJobInput): Promise<CnpjExportJob> {
  return prisma.cnpjExportJob.create({ data });
}

export async function findById(id: string): Promise<CnpjExportJob | null> {
  return prisma.cnpjExportJob.findUnique({ where: { id } });
}

export async function findByUserId(usuarioId: string): Promise<CnpjExportJob[]> {
  return prisma.cnpjExportJob.findMany({
    where: { usuario_id: usuarioId },
    orderBy: { criado_em: "desc" },
  });
}

export async function update(
  id: string,
  data: UpdateJobInput
): Promise<CnpjExportJob> {
  return prisma.cnpjExportJob.update({ where: { id }, data });
}

/** Conta jobs ativos (queued + running) do usuário. Usado para rate limiting. */
export async function countActiveByUserId(usuarioId: string): Promise<number> {
  return prisma.cnpjExportJob.count({
    where: {
      usuario_id: usuarioId,
      status: { in: ["queued", "running"] },
    },
  });
}

/** Retorna jobs com status 'queued', em ordem FIFO de criação. Usado pelo worker. */
export async function findPending(): Promise<CnpjExportJob[]> {
  return prisma.cnpjExportJob.findMany({
    where: { status: "queued" },
    orderBy: { criado_em: "asc" },
  });
}
