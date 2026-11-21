import { CnpjSearchFiltersSchema } from "@radar/shared";
import * as cnpjRepository from "@/server/repositories/cnpj.repository";
import * as emailCampaignRepository from "@/server/repositories/email-campaign.repository";
import { resolveSearchContext, buildRepositoryFilters } from "@/server/services/cnpj-search.service";
import type { EmailCampaign } from "@/server/repositories/email-campaign.repository";

export type { EmailCampaign };

export interface EmailRecipientCandidate {
  cnpj: string;
  uf: string;
  email: string;
  razao_social: string;
  nome_fantasia: string | null;
}

// ── API pública ───────────────────────────────────────────────────────────────

/**
 * Monta a lista de destinatários elegíveis para uma nova campanha.
 *
 * A exclusão de bounces e unsubscribes NÃO é opcional — é parte obrigatória
 * do fluxo. Não existe caminho para criar destinatários sem passar por ela.
 *
 * @param rawFilters — mesmos filtros de busca de CNPJ (validados com Zod)
 * @returns candidatos com e-mail válido, sem bounces e sem descadastros
 */
export async function buildRecipientList(
  rawFilters: unknown
): Promise<EmailRecipientCandidate[]> {
  const filters = CnpjSearchFiltersSchema.parse(rawFilters);
  const context = await resolveSearchContext(filters);
  const repoFilters = buildRepositoryFilters(filters, context);

  const [companies, bouncedEmails, unsubscribedEmails] = await Promise.all([
    cnpjRepository.findByFiltersWithEmail(repoFilters),
    emailCampaignRepository.findBouncedEmails(),
    emailCampaignRepository.findUnsubscribedEmails(),
  ]);

  const blocked = new Set([...bouncedEmails, ...unsubscribedEmails]);

  return companies.filter((c) => !blocked.has(c.email));
}

/** Cria campanha em status 'rascunho' com a lista de destinatários já filtrada. */
export async function createCampaign(
  userId: string,
  input: {
    nome: string;
    filtrosOrigem: unknown;
    assunto: string;
    corpoTemplate: string;
  }
): Promise<{ campaign: EmailCampaign; totalDestinatarios: number }> {
  const filters = CnpjSearchFiltersSchema.parse(input.filtrosOrigem);

  const recipients = await buildRecipientList(filters);

  const campaign = await emailCampaignRepository.createCampaign({
    nome: input.nome,
    usuario_id: userId,
    filtros_origem: filters as Record<string, unknown>,
    assunto: input.assunto,
    corpo_template: input.corpoTemplate,
  });

  // EmailRecipient só guarda cnpj+uf+email (snapshot mínimo, sem FK — ver
  // comentário no schema); razao_social/nome_fantasia do candidato existem
  // só pra esta função, não fazem parte do modelo — Prisma rejeita em
  // runtime se passados (TS não pega porque recipients não é um literal).
  const count = await emailCampaignRepository.createRecipients(
    campaign.id,
    recipients.map(({ cnpj, uf, email }) => ({ cnpj, uf, email }))
  );

  await emailCampaignRepository.updateCampaignStatus(
    campaign.id,
    "rascunho",
    { total_destinatarios: count }
  );

  return { campaign, totalDestinatarios: count };
}

export async function getCampaign(
  id: string,
  userId: string
): Promise<EmailCampaign> {
  const campaign = await emailCampaignRepository.findCampaignById(id);
  if (!campaign) throw new CampaignNotFoundError(id);
  if (campaign.usuario_id !== userId) throw new CampaignAccessDeniedError();
  return campaign;
}

export async function getUserCampaigns(
  userId: string
): Promise<EmailCampaign[]> {
  return emailCampaignRepository.findCampaignsByUserId(userId);
}

// ── Erros de domínio ──────────────────────────────────────────────────────────

export class CampaignNotFoundError extends Error {
  constructor(id: string) {
    super(`Campanha não encontrada: ${id}`);
    this.name = "CampaignNotFoundError";
  }
}

export class CampaignAccessDeniedError extends Error {
  constructor() {
    super("Acesso negado à campanha");
    this.name = "CampaignAccessDeniedError";
  }
}
