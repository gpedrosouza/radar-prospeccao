import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export interface PlacesCacheEntry {
  id: string;
  grid_cell_key: string;
  keyword: string;
  resultado: Prisma.JsonValue;
  criado_em: Date;
  expira_em: Date;
}

/** Retorna todas as entradas válidas (não expiradas) para as células + keyword informadas. */
export async function findByCells(
  cellKeys: string[],
  keyword: string
): Promise<PlacesCacheEntry[]> {
  if (cellKeys.length === 0) return [];
  return prisma.placesCache.findMany({
    where: {
      grid_cell_key: { in: cellKeys },
      keyword,
      expira_em: { gt: new Date() },
    },
  });
}

/** Insere ou atualiza a entrada de cache para uma (célula, keyword). */
export async function upsert(
  gridCellKey: string,
  keyword: string,
  resultado: unknown,
  expiraEm: Date
): Promise<void> {
  await prisma.placesCache.upsert({
    where: { cell_keyword: { grid_cell_key: gridCellKey, keyword } },
    create: {
      grid_cell_key: gridCellKey,
      keyword,
      resultado: resultado as Prisma.InputJsonValue,
      expira_em: expiraEm,
    },
    update: {
      resultado: resultado as Prisma.InputJsonValue,
      expira_em: expiraEm,
      criado_em: new Date(),
    },
  });
}

/** Remove entradas expiradas. Chamado pelo script de limpeza do worker. */
export async function deleteExpired(): Promise<number> {
  const result = await prisma.placesCache.deleteMany({
    where: { expira_em: { lt: new Date() } },
  });
  return result.count;
}
