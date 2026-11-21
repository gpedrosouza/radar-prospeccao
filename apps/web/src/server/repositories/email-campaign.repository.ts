import { prisma } from "@/lib/prisma";
import type {
  EmailCampaign,
  EmailRecipient,
  CampaignStatus,
  RecipientStatus,
  Prisma,
} from "@prisma/client";

export type { EmailCampaign, EmailRecipient, RecipientStatus };

export interface RecipientStats {
  abertos: number;
  clicados: number;
  respondidos: number;
}

export type CampaignWithStats = EmailCampaign & { stats: RecipientStats };

export interface CreateCampaignInput {
  nome: string;
  usuario_id: string;
  filtros_origem: Prisma.InputJsonValue;
  assunto: string;
  corpo_template: string;
}

// ── Campaigns ─────────────────────────────────────────────────────────────────

export async function createCampaign(
  data: CreateCampaignInput
): Promise<EmailCampaign> {
  return prisma.emailCampaign.create({ data });
}

export async function findCampaignById(
  id: string
): Promise<EmailCampaign | null> {
  return prisma.emailCampaign.findUnique({ where: { id } });
}

export async function findCampaignsByUserId(
  usuarioId: string
): Promise<EmailCampaign[]> {
  return prisma.emailCampaign.findMany({
    where: { usuario_id: usuarioId },
    orderBy: { criado_em: "desc" },
  });
}

export async function updateCampaignStatus(
  id: string,
  status: CampaignStatus,
  extra?: {
    total_destinatarios?: number;
    total_enviados?: number;
    total_bounces?: number;
    enviado_em?: Date;
  }
): Promise<EmailCampaign> {
  return prisma.emailCampaign.update({
    where: { id },
    data: { status, ...extra },
  });
}

// ── Recipients ────────────────────────────────────────────────────────────────

/**
 * Apaga todos os destinatários da campanha e recria com a lista atualizada.
 *
 * Chamado pelo POST /send para aplicar exclusões de bounce/unsubscribe
 * ocorridas após a criação da campanha.
 */
export async function replaceRecipients(
  campaignId: string,
  recipients: Array<{ cnpj: string; uf: string; email: string }>
): Promise<number> {
  await prisma.emailRecipient.deleteMany({ where: { campaign_id: campaignId } });
  const result = await prisma.emailRecipient.createMany({
    data: recipients.map((r) => ({ ...r, campaign_id: campaignId })),
  });
  return result.count;
}

/** Destinatários ainda pendentes de envio. Idempotente — seguro em retries do worker. */
export async function findPendingRecipients(
  campaignId: string
): Promise<EmailRecipient[]> {
  return prisma.emailRecipient.findMany({
    where: { campaign_id: campaignId, status: "pendente" },
    orderBy: { id: "asc" },
  });
}

/** Atualiza status e (opcionalmente) o message ID do Resend após tentativa de envio. */
export async function updateRecipientStatus(
  id: string,
  status: RecipientStatus,
  resendMessageId?: string
): Promise<void> {
  await prisma.emailRecipient.update({
    where: { id },
    data: {
      status,
      ...(status === "enviado" ? { enviado_em: new Date() } : {}),
      ...(resendMessageId ? { resend_message_id: resendMessageId } : {}),
    },
  });
}

export async function createRecipients(
  campaignId: string,
  recipients: Array<{ cnpj: string; uf: string; email: string }>
): Promise<number> {
  const result = await prisma.emailRecipient.createMany({
    data: recipients.map((r) => ({ ...r, campaign_id: campaignId })),
    skipDuplicates: true,
  });
  return result.count;
}

// ── Supressão — bounce + unsubscribe ─────────────────────────────────────────

/** Retorna todos os e-mails que sofreram bounce (hard ou soft). */
export async function findBouncedEmails(): Promise<string[]> {
  const rows = await prisma.emailBounce.findMany({ select: { email: true } });
  return rows.map((r) => r.email);
}

/** Retorna todos os e-mails descadastrados. */
export async function findUnsubscribedEmails(): Promise<string[]> {
  const rows = await prisma.emailUnsubscribe.findMany({
    select: { email: true },
  });
  return rows.map((r) => r.email);
}

/** Lookup por resend_message_id — chave de correlação com webhooks do Resend. */
export async function findRecipientByResendId(
  resendMessageId: string
): Promise<EmailRecipient | null> {
  return prisma.emailRecipient.findFirst({
    where: { resend_message_id: resendMessageId },
  });
}

/**
 * Para webhooks de resposta (email.received/inbound): tenta associar o remetente
 * ao destinatário mais recentemente enviado com aquele endereço de e-mail.
 * Best-effort — pode não encontrar ou encontrar o errado se várias campanhas
 * usaram o mesmo endereço.
 */
export async function findRecentRecipientByEmail(
  email: string
): Promise<EmailRecipient | null> {
  return prisma.emailRecipient.findFirst({
    where: {
      email,
      status: { notIn: ["pendente", "falhou"] },
    },
    orderBy: { enviado_em: "desc" },
  });
}

/** Incrementa total_bounces da campanha. Chamado via webhook a cada bounce/complaint. */
export async function incrementCampaignBounces(campaignId: string): Promise<void> {
  await prisma.emailCampaign.update({
    where: { id: campaignId },
    data: { total_bounces: { increment: 1 } },
  });
}

/** Registra bounce recebido via webhook do Resend. */
export async function upsertBounce(
  email: string,
  tipo: "hard" | "soft",
  motivo?: string
): Promise<void> {
  await prisma.emailBounce.upsert({
    where: { email },
    create: { email, tipo, motivo },
    update: { tipo, motivo },
  });
}

/** Atualiza campanha para 'concluida' com contadores de envio. */
export async function updateCampaignAfterSend(
  id: string,
  totalEnviados: number
): Promise<void> {
  await prisma.emailCampaign.update({
    where: { id },
    data: {
      status: "concluida",
      total_enviados: totalEnviados,
      enviado_em: new Date(),
    },
  });
}

/** Campanhas do usuário com contagem de engajamento por status de recipient. */
export async function findCampaignsWithStats(
  usuarioId: string
): Promise<CampaignWithStats[]> {
  const campaigns = await prisma.emailCampaign.findMany({
    where: { usuario_id: usuarioId },
    orderBy: { criado_em: "desc" },
  });

  if (campaigns.length === 0) return [];

  const campaignIds = campaigns.map((c) => c.id);
  const statRows = await prisma.emailRecipient.groupBy({
    by: ["campaign_id", "status"],
    where: { campaign_id: { in: campaignIds } },
    _count: { id: true },
  });

  const statsMap = new Map<string, RecipientStats>();
  for (const row of statRows) {
    const s = statsMap.get(row.campaign_id) ?? { abertos: 0, clicados: 0, respondidos: 0 };
    const n = row._count.id;
    if (row.status === "aberto" || row.status === "clicado" || row.status === "respondido") s.abertos += n;
    if (row.status === "clicado" || row.status === "respondido") s.clicados += n;
    if (row.status === "respondido") s.respondidos += n;
    statsMap.set(row.campaign_id, s);
  }

  return campaigns.map((c) => ({
    ...c,
    stats: statsMap.get(c.id) ?? { abertos: 0, clicados: 0, respondidos: 0 },
  }));
}

/** Registra pedido de descadastro. */
export async function upsertUnsubscribe(
  email: string,
  campaignIdOrigem?: string
): Promise<void> {
  await prisma.emailUnsubscribe.upsert({
    where: { email },
    create: { email, campaign_id_origem: campaignIdOrigem },
    update: {},
  });
}
