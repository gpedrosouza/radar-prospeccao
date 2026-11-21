/**
 * POST /api/scheduling/book
 *
 * Rota pública (sem sessão) — chamada por leads não autenticados na página
 * /agende. Ver exceção em middleware.ts.
 */

import type { NextRequest } from "next/server";
import { z } from "zod";
import {
  bookMeeting,
  SlotIndisponivelError,
  SlotInvalidoError,
} from "@/server/services/scheduling.service";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  nome: z.string().trim().min(2, "Informe seu nome completo"),
  email: z.string().trim().email("E-mail inválido"),
  telefone: z.string().trim().min(1).optional(),
  inicio: z.string().datetime({ message: "inicio deve ser uma data ISO 8601 válida" }),
  origem: z.enum(["landing", "email"]),
  campaign_id_origem: z.string().uuid().optional(),
  session_id: z.string().trim().min(1).optional(),
});

export async function POST(request: NextRequest): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "campos_invalidos", details: parsed.error.flatten() },
      { status: 422 }
    );
  }

  const { nome, email, telefone, inicio, origem, campaign_id_origem, session_id } =
    parsed.data;

  try {
    const meeting = await bookMeeting({
      nome,
      email,
      telefone,
      inicio: new Date(inicio),
      origem,
      campaignIdOrigem: campaign_id_origem,
      sessionId: session_id,
    });

    return Response.json(
      {
        id: meeting.id,
        inicio: meeting.inicio.toISOString(),
        fim: meeting.fim.toISOString(),
        google_meet_link: meeting.google_meet_link,
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof SlotIndisponivelError) {
      return Response.json({ error: "slot_indisponivel", detail: err.message }, { status: 409 });
    }
    if (err instanceof SlotInvalidoError) {
      return Response.json({ error: "slot_invalido", detail: err.message }, { status: 422 });
    }
    console.error("[scheduling/book] erro:", err);
    return Response.json({ error: "erro_interno" }, { status: 500 });
  }
}
