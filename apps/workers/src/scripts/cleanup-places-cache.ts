/**
 * Limpeza de entradas expiradas do cache do Google Places.
 *
 * Execução recomendada: cron diário fora do horário de pico.
 *
 * Uso: npm run cleanup:places-cache --workspace=apps/workers
 *
 * Pré-requisitos:
 *   - DATABASE_URL definida no ambiente (ou em apps/workers/.env)
 *   - Tabela places_cache existente (migration 20260627000002_places_cache)
 */

import { PrismaClient } from "@radar/db";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log("[cleanup-places-cache] iniciando...");

  const deleted = await prisma.placesCache.deleteMany({
    where: { expira_em: { lt: new Date() } },
  });

  console.log(
    `[cleanup-places-cache] ${deleted.count} entrada(s) expirada(s) removida(s).`
  );
}

main()
  .catch((err: unknown) => {
    console.error("[cleanup-places-cache] ERRO:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
