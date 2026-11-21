import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import * as emailCampaignRepo from "@/server/repositories/email-campaign.repository";
import * as emailCampaignService from "@/server/services/email-campaign.service";

export const dynamic = "force-dynamic";

// ── GET /api/campaigns ────────────────────────────────────────────────────────

export async function GET(): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const campaigns = await emailCampaignRepo.findCampaignsWithStats(session.user.id);

  const serialized = campaigns.map((c) => ({
    id: c.id,
    nome: c.nome,
    status: c.status,
    total_destinatarios: c.total_destinatarios,
    total_enviados: c.total_enviados,
    total_bounces: c.total_bounces,
    criado_em: c.criado_em.toISOString(),
    enviado_em: c.enviado_em?.toISOString() ?? null,
    stats: c.stats,
  }));

  return Response.json(serialized);
}

// ── POST /api/campaigns ───────────────────────────────────────────────────────

interface CreateCampaignBody {
  nome: string;
  filtros_origem: unknown;
  assunto: string;
  corpo_template: string;
}

export async function POST(request: NextRequest): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: CreateCampaignBody;
  try {
    body = (await request.json()) as CreateCampaignBody;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const { nome, filtros_origem, assunto, corpo_template } = body;

  if (!nome?.trim() || !assunto?.trim() || !corpo_template?.trim()) {
    return Response.json(
      { error: "campos_obrigatorios", detail: "nome, assunto e corpo_template são obrigatórios" },
      { status: 422 }
    );
  }

  try {
    const { campaign, totalDestinatarios } = await emailCampaignService.createCampaign(
      session.user.id,
      {
        nome: nome.trim(),
        filtrosOrigem: filtros_origem,
        assunto: assunto.trim(),
        corpoTemplate: corpo_template.trim(),
      }
    );

    return Response.json(
      {
        id: campaign.id,
        nome: campaign.nome,
        status: campaign.status,
        total_destinatarios: totalDestinatarios,
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") {
      return Response.json({ error: "filtros_invalidos", detail: err.message }, { status: 422 });
    }
    throw err;
  }
}
