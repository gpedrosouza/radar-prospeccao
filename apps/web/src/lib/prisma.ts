import { PrismaClient } from "@radar/db";

// Singleton para evitar múltiplas conexões em hot-reload do Next.js dev server
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
