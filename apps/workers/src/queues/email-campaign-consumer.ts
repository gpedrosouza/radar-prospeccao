/**
 * Consumer BullMQ da fila "email-campaign".
 *
 * Responsabilidades:
 *   1. Buscar a campanha e seus destinatários 'pendente' no banco.
 *   2. Batch-carregar dados de CompanyCnpj por UF (partition pruning).
 *   3. Para cada destinatário:
 *        a. Renderizar o corpo do e-mail substituindo variáveis de template.
 *        b. Enviar via Resend SDK.
 *        c. Atualizar EmailRecipient (enviado/falhou + resend_message_id).
 *        d. Aguardar EMAIL_SEND_DELAY_MS antes do próximo envio.
 *   4. Ao final, atualizar a campanha para 'concluida' com total_enviados.
 *
 * Retry: 1 tentativa (sem retry automático). Falhas individuais de envio não
 * abortam a campanha — cada destinatário é marcado como 'falhou' e o worker
 * continua. Destinatários ainda 'pendente' indicam falhas não mapeadas.
 *
 * NÃO importar nada de apps/web (CLAUDE.md regra 1).
 */

import { Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { Resend } from "resend";
import { PrismaClient } from "@radar/db";
import { EMAIL_CAMPAIGN_QUEUE_NAME } from "@radar/shared";
import type { EmailCampaignJobPayload } from "@radar/shared";
import { generateUnsubscribeToken } from "@radar/shared/server";

const prisma = new PrismaClient();

function makeConnection(): IORedis {
  return new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: null,
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Template rendering ────────────────────────────────────────────────────────

interface TemplateVars {
  razao_social: string;
  nome_fantasia: string;
  cnpj: string;
  cnpj_formatado: string;
  municipio_nome: string;
  uf: string;
  cnae_principal: string;
  link_descadastro: string;
}

function formatCnpj(cnpj: string): string {
  return cnpj.replace(
    /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
    "$1.$2.$3/$4-$5"
  );
}

function renderTemplate(template: string, vars: TemplateVars): string {
  return template
    .replace(/\{\{razao_social\}\}/g,    vars.razao_social)
    .replace(/\{\{nome_fantasia\}\}/g,   vars.nome_fantasia)
    .replace(/\{\{cnpj\}\}/g,            vars.cnpj)
    .replace(/\{\{cnpj_formatado\}\}/g,  vars.cnpj_formatado)
    .replace(/\{\{municipio_nome\}\}/g,  vars.municipio_nome)
    .replace(/\{\{uf\}\}/g,              vars.uf)
    .replace(/\{\{cnae_principal\}\}/g,  vars.cnae_principal)
    .replace(/\{\{link_descadastro\}\}/g, vars.link_descadastro);
}

/**
 * Acrescenta o footer de descadastro (texto) ao final do corpo, caso o template
 * não tenha incluído {{link_descadastro}} manualmente.
 */
function appendUnsubscribeFooter(body: string, unsubscribeUrl: string): string {
  if (body.includes(unsubscribeUrl)) return body;
  return (
    body +
    `\n\n---\nPara se descadastrar e não receber mais mensagens, acesse:\n${unsubscribeUrl}`
  );
}

/**
 * Garante o link de descadastro no corpo HTML. Se o template já contém a URL
 * (via {{link_descadastro}}), não faz nada; senão anexa um footer HTML mínimo.
 */
function ensureHtmlUnsubscribe(html: string, unsubscribeUrl: string): string {
  if (html.includes(unsubscribeUrl)) return html;
  return (
    html +
    `\n<p style="font-size:11px;color:#8299a3;line-height:1.6;margin:16px 0 0 0;">` +
    `Para não receber mais mensagens, ` +
    `<a href="${unsubscribeUrl}" style="color:#8299a3;">descadastre-se aqui</a>.</p>`
  );
}

/** Detecta se o corpo é HTML (contém ao menos uma tag). */
function looksLikeHtml(body: string): boolean {
  return /<[a-z][\s\S]*?>/i.test(body);
}

/**
 * Converte o corpo HTML em texto puro legível, para a alternativa `text` do
 * e-mail (melhora entregabilidade e atende clientes sem HTML). Não substitui um
 * corpo de texto curado — é um fallback automático derivado do HTML.
 */
function htmlToPlainText(html: string): string {
  return html
    // remove comentários, incluindo blocos condicionais MSO e o preheader oculto
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<div[^>]*display:\s*none[\s\S]*?<\/div>/gi, "")
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, "")
    // links viram "texto (url)"
    .replace(
      /<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
      (_m, href: string, txt: string) =>
        `${txt.replace(/<[^>]+>/g, "").trim()} (${href})`
    )
    // quebras explícitas e fim de blocos viram nova linha
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|h1|h2|h3|div|tr|li)>/gi, "\n")
    // remove as tags restantes
    .replace(/<[^>]+>/g, "")
    // entidades usadas no template
    .replace(/&nbsp;/g, " ")
    .replace(/&zwnj;/g, "")
    // glifos dos ícones/tiles não fazem sentido em texto puro — removidos
    .replace(/&rarr;|&ne;|&#8635;|&#10003;/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    // normaliza espaços e linhas em branco
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ── Batch fetch de dados de empresa ──────────────────────────────────────────

interface CompanyData {
  cnpj: string;
  razao_social: string;
  nome_fantasia: string | null;
  municipio_nome: string;
  uf: string;
  cnae_principal: string;
}

async function fetchCompanyDataByUf(
  uf: string,
  cnpjs: string[]
): Promise<CompanyData[]> {
  return prisma.companyCnpj.findMany({
    where: { uf, cnpj: { in: cnpjs } },
    select: {
      cnpj: true,
      razao_social: true,
      nome_fantasia: true,
      municipio_nome: true,
      uf: true,
      cnae_principal: true,
    },
  });
}

// ── Processador ───────────────────────────────────────────────────────────────

async function processEmailCampaignJob(
  job: Job<EmailCampaignJobPayload>
): Promise<void> {
  const { campaignId } = job.data;
  const sendDelayMs = parseInt(process.env.EMAIL_SEND_DELAY_MS ?? "350", 10);
  const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const unsubscribeSecret = process.env.UNSUBSCRIBE_TOKEN_SECRET ?? "";
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  // Respostas do lead caem neste endereço, independentemente do From do domínio.
  const replyToEmail = process.env.RESEND_REPLY_TO?.trim() || undefined;

  if (!fromEmail) {
    throw new Error("RESEND_FROM_EMAIL não configurado");
  }
  if (!unsubscribeSecret) {
    throw new Error("UNSUBSCRIBE_TOKEN_SECRET não configurado");
  }

  console.log(`[email-campaign] iniciando job ${job.id} (campaignId=${campaignId})`);

  // 1. Buscar campanha
  const campaign = await prisma.emailCampaign.findUnique({
    where: { id: campaignId },
  });
  if (!campaign) {
    throw new Error(`Campanha ${campaignId} não encontrada`);
  }

  // 2. Buscar destinatários pendentes (idempotente em retries)
  const recipients = await prisma.emailRecipient.findMany({
    where: { campaign_id: campaignId, status: "pendente" },
    orderBy: { id: "asc" },
  });

  console.log(
    `[email-campaign] job ${job.id}: ${recipients.length} destinatários pendentes`
  );

  if (recipients.length === 0) {
    await prisma.emailCampaign.update({
      where: { id: campaignId },
      data: { status: "concluida", enviado_em: new Date() },
    });
    return;
  }

  // 3. Batch-fetch dados de empresa por UF (partition pruning)
  const companyMap = new Map<string, CompanyData>();
  const recipientsByUf = recipients.reduce<Record<string, string[]>>(
    (acc, r) => {
      (acc[r.uf.trim()] ??= []).push(r.cnpj.trim());
      return acc;
    },
    {}
  );

  for (const [uf, cnpjs] of Object.entries(recipientsByUf)) {
    const companies = await fetchCompanyDataByUf(uf, cnpjs);
    for (const c of companies) {
      companyMap.set(c.cnpj.trim(), c);
    }
  }

  // 4. Inicializar Resend
  const resend = new Resend(process.env.RESEND_API_KEY);

  let enviados = 0;

  for (const recipient of recipients) {
    const company = companyMap.get(recipient.cnpj.trim());

    const unsubscribeUrl =
      `${appUrl}/api/unsubscribe?token=` +
      generateUnsubscribeToken(recipient.email, campaignId, unsubscribeSecret);

    const templateVars: TemplateVars = {
      razao_social:    company?.razao_social   ?? recipient.cnpj,
      nome_fantasia:   company?.nome_fantasia  ?? "",
      cnpj:            recipient.cnpj.trim(),
      cnpj_formatado:  formatCnpj(recipient.cnpj.trim()),
      municipio_nome:  company?.municipio_nome ?? "",
      uf:              recipient.uf.trim(),
      cnae_principal:  company?.cnae_principal ?? "",
      link_descadastro: unsubscribeUrl,
    };

    const renderedSubject = renderTemplate(campaign.assunto, templateVars);
    const rendered = renderTemplate(campaign.corpo_template, templateVars);

    // Templates HTML são enviados como `html` + alternativa `text` derivada.
    // Templates de texto puro (legado) continuam indo apenas como `text`.
    let htmlBody: string | undefined;
    let textBody: string;
    if (looksLikeHtml(campaign.corpo_template)) {
      htmlBody = ensureHtmlUnsubscribe(rendered, unsubscribeUrl);
      textBody = htmlToPlainText(htmlBody);
    } else {
      htmlBody = undefined;
      textBody = appendUnsubscribeFooter(rendered, unsubscribeUrl);
    }

    try {
      const { data, error } = await resend.emails.send({
        from: fromEmail,
        to: recipient.email,
        ...(replyToEmail ? { replyTo: replyToEmail } : {}),
        subject: renderedSubject,
        ...(htmlBody ? { html: htmlBody } : {}),
        text: textBody,
        headers: {
          // RFC 8058 one-click unsubscribe (reconhecido pelo Gmail e Yahoo)
          "List-Unsubscribe": `<${unsubscribeUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      });

      if (error || !data) {
        console.error(
          `[email-campaign] falha ao enviar para ${recipient.email}:`,
          error?.message ?? "resposta vazia"
        );
        await prisma.emailRecipient.update({
          where: { id: recipient.id },
          data: { status: "falhou" },
        });
      } else {
        await prisma.emailRecipient.update({
          where: { id: recipient.id },
          data: {
            status: "enviado",
            enviado_em: new Date(),
            resend_message_id: data.id,
          },
        });
        enviados++;
      }
    } catch (sendErr) {
      const msg = sendErr instanceof Error ? sendErr.message : String(sendErr);
      console.error(
        `[email-campaign] erro inesperado ao enviar para ${recipient.email}:`,
        msg
      );
      await prisma.emailRecipient.update({
        where: { id: recipient.id },
        data: { status: "falhou" },
      });
    }

    // Delay entre envios — respeita rate limit e reputação do remetente
    await sleep(sendDelayMs);
  }

  // 5. Atualizar campanha para 'concluida'
  await prisma.emailCampaign.update({
    where: { id: campaignId },
    data: {
      status: "concluida",
      total_enviados: enviados,
      enviado_em: new Date(),
    },
  });

  console.log(
    `[email-campaign] job ${job.id} concluído: ${enviados}/${recipients.length} enviados`
  );
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createEmailCampaignWorker(): Worker<EmailCampaignJobPayload> {
  const worker = new Worker<EmailCampaignJobPayload>(
    EMAIL_CAMPAIGN_QUEUE_NAME,
    processEmailCampaignJob,
    {
      connection: makeConnection(),
      concurrency: 1, // campanhas rodam sequencialmente — um envio por vez
    }
  );

  worker.on("failed", async (job, err) => {
    console.error(
      `[email-campaign] job ${job?.id} falhou definitivamente:`,
      err.message
    );
    if (job?.data.campaignId) {
      await prisma.emailCampaign
        .update({
          where: { id: job.data.campaignId },
          data: { status: "falhou" },
        })
        .catch((dbErr: unknown) => {
          console.error(
            "[email-campaign] erro ao registrar falha no banco:",
            dbErr
          );
        });
    }
  });

  worker.on("error", (err) => {
    console.error("[email-campaign] worker error:", err.message);
  });

  async function shutdown() {
    console.log("[email-campaign] encerrando graciosamente...");
    await worker.close();
    await prisma.$disconnect();
  }

  process.on("SIGTERM", () => shutdown().then(() => process.exit(0)));
  process.on("SIGINT",  () => shutdown().then(() => process.exit(0)));

  return worker;
}
