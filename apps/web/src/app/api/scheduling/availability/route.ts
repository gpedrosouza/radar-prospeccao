/**
 * GET /api/scheduling/availability?date=YYYY-MM-DD
 *
 * Rota pública (sem sessão) — chamada por leads não autenticados na página
 * /agende. Ver exceção em middleware.ts.
 */

import type { NextRequest } from "next/server";
import { z } from "zod";
import { getAvailableSlots } from "@/server/services/scheduling.service";

export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato esperado: YYYY-MM-DD"),
});

export async function GET(request: NextRequest): Promise<Response> {
  const parsed = QuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams)
  );
  if (!parsed.success) {
    return Response.json(
      { error: "parametros_invalidos", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const slots = await getAvailableSlots(parsed.data.date);
    return Response.json({
      slots: slots.map((s) => ({
        inicio: s.inicio.toISOString(),
        fim: s.fim.toISOString(),
      })),
    });
  } catch (err) {
    console.error("[scheduling/availability] erro:", err);
    return Response.json({ error: "erro_interno" }, { status: 500 });
  }
}
