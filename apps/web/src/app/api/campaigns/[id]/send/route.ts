/**
 * POST /api/campaigns/[id]/send
 *
 * Inicia o envio assíncrono de uma campanha de e-mail via BullMQ.
 *
 * Fluxo:
 *   1. Verifica autenticação e propriedade da campanha.
 *   2. Valida que o status permite envio (rascunho ou agendada).
 *   3. Reconstrói a lista de destinatários com exclusões atualizadas
 *      (bounce/unsubscribe ocorridos após criação da campanha).
 *   4. Substitui destinatários no banco (snapshot fresco).
 *   5. Atualiza campanha para 'enviando' + total_destinatarios.
 *   6. Enfileira UM job — o worker itera pelos destinatários com delay.
 *   7. Retorna 202 imediatamente.
 */

import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import * as emailCampaignService from "@/server/services/email-campaign.service";
import * as emailCampaignRepository from "@/server/repositories/email-campaign.repository";
import { emailCampaignQueue } from "@/server/queue/email-campaign-queue";
import { CampaignNotFoundError, CampaignAccessDeniedError } from "@/server/services/email-campaign.service";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const campaign = await emailCampaignService.getCampaign(id, session.user.id);

    if (campaign.status !== "rascunho" && campaign.status !== "agendada") {
      return Response.json(
        {
          error: "status_invalido",
          detail: `Campanha em status '${campaign.status}' não pode ser enviada. Apenas 'rascunho' ou 'agendada'.`,
        },
        { status: 422 }
      );
    }

    // Reconstrói lista com exclusões frescas (bounce/unsubscribe adicionados após criação)
    const recipients = await emailCampaignService.buildRecipientList(
      campaign.filtros_origem
    );

    if (recipients.length === 0) {
      return Response.json(
        {
          error: "sem_destinatarios",
          detail:
            "Nenhum destinatário elegível após exclusão de bounces/unsubscribes.",
        },
        { status: 422 }
      );
    }

    // Substitui snapshot de destinatários e atualiza status.
    // EmailRecipient só guarda cnpj+uf+email (ver schema) — razao_social/
    // nome_fantasia de buildRecipientList são só pro caller, não fazem
    // parte do modelo (mesmo bug corrigido em createCampaign).
    const total = await emailCampaignRepository.replaceRecipients(
      id,
      recipients.map(({ cnpj, uf, email }) => ({ cnpj, uf, email }))
    );

    await emailCampaignRepository.updateCampaignStatus(id, "enviando", {
      total_destinatarios: total,
    });

    // Um único job por campanha — jobId = campaignId (idempotência)
    await emailCampaignQueue.add(
      "send-campaign",
      { campaignId: id },
      { jobId: id }
    );

    return Response.json({ ok: true, total_destinatarios: total }, { status: 202 });
  } catch (err) {
    if (err instanceof CampaignNotFoundError) {
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    if (err instanceof CampaignAccessDeniedError) {
      return Response.json({ error: "forbidden" }, { status: 403 });
    }
    throw err;
  }
}
