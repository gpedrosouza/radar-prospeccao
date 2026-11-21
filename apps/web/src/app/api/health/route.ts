/**
 * GET /api/health — probe de disponibilidade pública.
 *
 * Usada pelo Docker healthcheck, load balancer e monitores externos (UptimeRobot).
 * NÃO exige autenticação — excluída no middleware.ts.
 *
 * 200 → { status: "ok",       checks: { database: "ok",    redis: "ok"    } }
 * 503 → { status: "degraded", checks: { database: "error", redis: "ok"    } }
 *         (ou qualquer combinação de falhas)
 */

import { prisma } from "@/lib/prisma";
import { redis } from "@/server/lib/redis-client";

export const dynamic = "force-dynamic";

type CheckStatus = "ok" | "error";

interface HealthResponse {
  status: "ok" | "degraded";
  checks: { database: CheckStatus; redis: CheckStatus };
}

export async function GET(): Promise<Response> {
  const checks: { database: CheckStatus; redis: CheckStatus } = {
    database: "error",
    redis: "error",
  };

  await Promise.allSettled([
    prisma.$queryRaw`SELECT 1`.then(() => {
      checks.database = "ok";
    }),
    redis.ping().then(() => {
      checks.redis = "ok";
    }),
  ]);

  const allOk = checks.database === "ok" && checks.redis === "ok";
  const body: HealthResponse = {
    status: allOk ? "ok" : "degraded",
    checks,
  };

  return Response.json(body, { status: allOk ? 200 : 503 });
}
