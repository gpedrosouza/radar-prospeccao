/**
 * POST /api/webhooks/resend
 *
 * Recebe eventos do Resend (entregue por SVIX) e mantém as tabelas de rastreamento
 * atualizadas em tempo real, sem depender de polling ou scraping de logs.
 *
 * Eventos tratados:
 *   email.bounced    → EmailBounce (hard) + EmailRecipient.status = 'bounced'
 *   email.complained → EmailBounce (hard) + EmailUnsubscribe + status = 'bounced'
 *   email.delivered  → status = 'enviado' (se ainda 'pendente')
 *   email.opened     → status = 'aberto'
 *   email.clicked    → status = 'clicado'
 *   email.received   → status = 'respondido' (Resend Inbound, best-effort)
 *
 * Segurança: NUNCA processa sem validar a assinatura SVIX. Retorna 400 para
 * assinaturas inválidas (Resend registrará falha; não reprocessa com token ruim).
 *
 * Performance: todas as atualizações são queries simples (< 10ms). Sem fila.
 * O Resend tem timeout de 30s — estamos muito abaixo disso.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import * as emailCampaignRepo from "@/server/repositories/email-campaign.repository";

export const dynamic = "force-dynamic";

// ── Tipos de evento do Resend ─────────────────────────────────────────────────

type ResendEventType =
  | "email.sent"
  | "email.delivered"
  | "email.delivery_delayed"
  | "email.bounced"
  | "email.complained"
  | "email.opened"
  | "email.clicked"
  | "email.received";

interface ResendWebhookEvent {
  type: ResendEventType;
  created_at: string;
  data: {
    created_at: string;
    email_id: string;
    from: string;
    to: string[];
    subject: string;
    bounce?: {
      message?: string;
      type?: string;
    };
    click?: {
      link?: string;
    };
    reply_to?: string[];
  };
}

// ── Prioridade de status — só "sobe", nunca desce o funil de engajamento ──────
//
// bounced é exceção: sempre sobrescreve (é supressão, não engajamento).

const STATUS_PRIORITY: Record<string, number> = {
  pendente:   0,
  falhou:     1,
  enviado:    2,
  aberto:     3,
  clicado:    4,
  respondido: 5,
  bounced:    99,
};

function shouldUpdateStatus(current: string, incoming: string): boolean {
  if (incoming === "bounced") return true;
  return (STATUS_PRIORITY[incoming] ?? 0) > (STATUS_PRIORITY[current] ?? 0);
}

// ── Verificação de assinatura SVIX ────────────────────────────────────────────
//
// Algoritmo:
//   to_sign   = "{svix-id}.{svix-timestamp}.{rawBody}"
//   secret    = base64_decode(RESEND_WEBHOOK_SECRET.replace("whsec_", ""))
//   expected  = "v1," + base64_encode(HMAC-SHA256(secret, to_sign))
//   valid     = expected ∈ split(svix-signature, " ")
//
// Proteção anti-replay: rejeita timestamps com diferença > 5 minutos.

const TOLERANCE_SECONDS = 300;

function verifySvixSignature(
  rawBody: string,
  svixId: string | null,
  svixTimestamp: string | null,
  svixSignature: string | null,
  secret: string
): boolean {
  if (!svixId || !svixTimestamp || !svixSignature) return false;

  const ts = parseInt(svixTimestamp, 10);
  if (isNaN(ts)) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - ts) > TOLERANCE_SECONDS) {
    return false;
  }

  const toSign = `${svixId}.${svixTimestamp}.${rawBody}`;
  const secretBytes = Buffer.from(secret.replace("whsec_", ""), "base64");
  const computedHmac = createHmac("sha256", secretBytes)
    .update(toSign, "utf-8")
    .digest("base64");
  const expected = `v1,${computedHmac}`;
  const expBuf = Buffer.from(expected);

  for (const sig of svixSignature.split(" ")) {
    const sigBuf = Buffer.from(sig);
    if (sigBuf.length === expBuf.length && timingSafeEqual(sigBuf, expBuf)) {
      return true;
    }
  }

  return false;
}

// ── Handlers por tipo de evento ───────────────────────────────────────────────

async function handleBounce(
  event: ResendWebhookEvent,
  tipo: "hard" | "soft",
  alsoUnsubscribe: boolean
): Promise<void> {
  const emailId = event.data.email_id;
  const toAddresses = event.data.to;
  const motivo = event.data.bounce?.message;

  const recipient = await emailCampaignRepo.findRecipientByResendId(emailId);

  if (recipient) {
    if (shouldUpdateStatus(recipient.status, "bounced")) {
      await emailCampaignRepo.updateRecipientStatus(recipient.id, "bounced");
    }
    await emailCampaignRepo.incrementCampaignBounces(recipient.campaign_id);
  }

  // Registra bounce para todos os endereços do evento (normalmente é só um)
  for (const email of toAddresses) {
    await emailCampaignRepo.upsertBounce(email, tipo, motivo);
    if (alsoUnsubscribe) {
      // Spam complaint → unsubscribe permanente, mesmo sem ID de campanha
      await emailCampaignRepo.upsertUnsubscribe(
        email,
        recipient?.campaign_id
      );
    }
  }
}

async function handleDelivered(event: ResendWebhookEvent): Promise<void> {
  const recipient = await emailCampaignRepo.findRecipientByResendId(
    event.data.email_id
  );
  if (!recipient) return;

  // 'enviado' só sobe se ainda estava 'pendente' — não retroage estados de engajamento
  if (shouldUpdateStatus(recipient.status, "enviado")) {
    await emailCampaignRepo.updateRecipientStatus(recipient.id, "enviado");
  }
}

async function handleEngagement(
  emailId: string,
  newStatus: "aberto" | "clicado"
): Promise<void> {
  const recipient = await emailCampaignRepo.findRecipientByResendId(emailId);
  if (!recipient) return;

  if (shouldUpdateStatus(recipient.status, newStatus)) {
    await emailCampaignRepo.updateRecipientStatus(recipient.id, newStatus);
  }
}

async function handleReceived(event: ResendWebhookEvent): Promise<void> {
  // Inbound: `from` é o remetente (= o destinatário original da campanha)
  const senderEmail = event.data.from.replace(/^.*<(.+)>$/, "$1").trim();

  const recipient =
    await emailCampaignRepo.findRecentRecipientByEmail(senderEmail);
  if (!recipient) return;

  if (shouldUpdateStatus(recipient.status, "respondido")) {
    await emailCampaignRepo.updateRecipientStatus(recipient.id, "respondido");
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<Response> {
  // 1. Lê o corpo como texto antes de qualquer coisa (necessário para HMAC)
  const rawBody = await request.text();

  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[webhook/resend] RESEND_WEBHOOK_SECRET não configurado");
    return Response.json({ error: "server_misconfigured" }, { status: 500 });
  }

  // 2. Valida assinatura — NUNCA prossegue sem isso
  const valid = verifySvixSignature(
    rawBody,
    request.headers.get("svix-id"),
    request.headers.get("svix-timestamp"),
    request.headers.get("svix-signature"),
    secret
  );

  if (!valid) {
    console.warn("[webhook/resend] assinatura inválida rejeitada");
    return Response.json({ error: "invalid_signature" }, { status: 400 });
  }

  // 3. Parseia o evento
  let event: ResendWebhookEvent;
  try {
    event = JSON.parse(rawBody) as ResendWebhookEvent;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  // 4. Despacha para o handler correto
  try {
    switch (event.type) {
      case "email.bounced":
        await handleBounce(event, "hard", false);
        break;

      case "email.complained":
        // Spam complaint → bounce permanente + unsubscribe obrigatório
        await handleBounce(event, "hard", true);
        break;

      case "email.delivered":
        await handleDelivered(event);
        break;

      case "email.opened":
        await handleEngagement(event.data.email_id, "aberto");
        break;

      case "email.clicked":
        await handleEngagement(event.data.email_id, "clicado");
        break;

      case "email.received":
        // Requer Resend Inbound configurado — best-effort
        await handleReceived(event);
        break;

      default:
        // Ignora silenciosamente eventos não tratados (delivery_delayed, sent, etc.)
        break;
    }
  } catch (err) {
    // Não deixa erro interno converter-se em non-2xx (Resend reprocessaria)
    console.error("[webhook/resend] erro ao processar evento:", err);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }

  // 5. Retorna 200 imediatamente — Resend não reprocessa em 2xx
  return Response.json({ ok: true });
}
