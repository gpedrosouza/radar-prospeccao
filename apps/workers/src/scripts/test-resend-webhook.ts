/**
 * Simula chamadas do Resend para POST /api/webhooks/resend com assinaturas
 * SVIX válidas, cobrindo os 6 tipos de evento tratados pelo endpoint.
 *
 * O script cria um recipient de teste no banco, dispara cada evento
 * e verifica as respostas HTTP e o estado final do recipient.
 *
 * Pré-requisitos:
 *   - PostgreSQL e Redis rodando (docker compose up -d)
 *   - App Next.js rodando em APP_URL (padrão: http://localhost:3000)
 *   - RESEND_WEBHOOK_SECRET definido no ambiente (mesmo valor do .env.local)
 *   - Pelo menos uma campanha e um recipient de teste no banco, OU
 *     o script cria os dados automaticamente.
 *
 * Uso:
 *   npx tsx apps/workers/src/scripts/test-resend-webhook.ts
 */

import { createHmac } from "node:crypto";
import { PrismaClient } from "@radar/db";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET;

if (!WEBHOOK_SECRET) {
  console.error("RESEND_WEBHOOK_SECRET não definido — defina no ambiente antes de rodar o script.");
  process.exit(1);
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL não definida");
  process.exit(1);
}

const prisma = new PrismaClient();

// ── Geração de assinatura SVIX ────────────────────────────────────────────────

function generateSvixSignature(
  msgId: string,
  timestamp: number,
  rawBody: string,
  secret: string
): string {
  const toSign = `${msgId}.${timestamp}.${rawBody}`;
  const secretBytes = Buffer.from(secret.replace("whsec_", ""), "base64");
  const hmac = createHmac("sha256", secretBytes)
    .update(toSign, "utf-8")
    .digest("base64");
  return `v1,${hmac}`;
}

// ── POST para o webhook ───────────────────────────────────────────────────────

async function sendWebhookEvent(
  event: Record<string, unknown>
): Promise<{ status: number; body: unknown }> {
  const msgId = `msg_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const timestamp = Math.floor(Date.now() / 1000);
  const rawBody = JSON.stringify(event);
  const sig = generateSvixSignature(msgId, timestamp, rawBody, WEBHOOK_SECRET!);

  const resp = await fetch(`${APP_URL}/api/webhooks/resend`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "svix-id": msgId,
      "svix-timestamp": String(timestamp),
      "svix-signature": sig,
    },
    body: rawBody,
  });

  const body = await resp.json();
  return { status: resp.status, body };
}

// ── Fixtures de evento ────────────────────────────────────────────────────────

function makeEvent(type: string, emailId: string, to: string[], extra: Record<string, unknown> = {}) {
  return {
    type,
    created_at: new Date().toISOString(),
    data: {
      created_at: new Date().toISOString(),
      email_id: emailId,
      from: "Radar Prospecção <noreply@radar.dev>",
      to,
      subject: "Teste de campanha",
      ...extra,
    },
  };
}

// ── Helpers de setup de banco ─────────────────────────────────────────────────

async function getOrCreateTestUser(): Promise<string> {
  const user = await prisma.user.findFirst();
  if (!user) {
    throw new Error(
      "Nenhum usuário encontrado. Execute: npm run seed --workspace=packages/db"
    );
  }
  return user.id;
}

async function getOrCreateTestCampaign(usuarioId: string): Promise<string> {
  let campaign = await prisma.emailCampaign.findFirst({
    where: { nome: "[TESTE] webhook script" },
  });

  if (!campaign) {
    campaign = await prisma.emailCampaign.create({
      data: {
        nome: "[TESTE] webhook script",
        usuario_id: usuarioId,
        filtros_origem: { uf: "SP" },
        assunto: "Teste",
        corpo_template: "Olá {{razao_social}}",
        status: "enviando",
        total_destinatarios: 5,
      },
    });
    console.log(`  [setup] Campanha de teste criada → ${campaign.id}`);
  }

  return campaign.id;
}

async function getOrCreateTestRecipient(
  campaignId: string,
  email: string,
  resendMessageId: string
): Promise<string> {
  let recipient = await prisma.emailRecipient.findFirst({
    where: { campaign_id: campaignId, email },
  });

  if (!recipient) {
    recipient = await prisma.emailRecipient.create({
      data: {
        campaign_id: campaignId,
        cnpj: "00000000000191",
        uf: "SP",
        email,
        status: "pendente",
        resend_message_id: resendMessageId,
      },
    });
    console.log(`  [setup] Recipient criado → ${recipient.id}`);
  } else if (!recipient.resend_message_id) {
    await prisma.emailRecipient.update({
      where: { id: recipient.id },
      data: { resend_message_id: resendMessageId },
    });
    console.log(`  [setup] Recipient atualizado com resend_message_id`);
  }

  return recipient.id;
}

async function getRecipientStatus(id: string): Promise<string> {
  const r = await prisma.emailRecipient.findUnique({ where: { id } });
  return r?.status ?? "not_found";
}

// ── Runner de casos ───────────────────────────────────────────────────────────

interface TestCase {
  label: string;
  event: Record<string, unknown>;
  expectedStatus: number;
  expectedRecipientStatus?: string;
}

async function runCase(
  tc: TestCase,
  recipientId: string
): Promise<boolean> {
  const { status, body } = await sendWebhookEvent(tc.event);
  const recipStatus = await getRecipientStatus(recipientId);

  const httpOk = status === tc.expectedStatus;
  const recipOk =
    !tc.expectedRecipientStatus || recipStatus === tc.expectedRecipientStatus;

  const icon = httpOk && recipOk ? "✓" : "✗";
  console.log(`  ${icon} ${tc.label}`);
  console.log(`      HTTP ${status} (esperado ${tc.expectedStatus}) ${httpOk ? "✓" : "✗"}`);
  if (tc.expectedRecipientStatus) {
    console.log(
      `      Recipient.status = "${recipStatus}" (esperado "${tc.expectedRecipientStatus}") ${recipOk ? "✓" : "✗"}`
    );
  }
  if (!httpOk || !recipOk) {
    console.log(`      Body: ${JSON.stringify(body)}`);
  }

  return httpOk && recipOk;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("=".repeat(60));
  console.log("Teste de webhook Resend — POST /api/webhooks/resend");
  console.log(`App URL: ${APP_URL}`);
  console.log("=".repeat(60));

  // ── Setup ─────────────────────────────────────────────────────────────────
  console.log("\n[setup] Preparando dados de teste...");
  const userId = await getOrCreateTestUser();
  const campaignId = await getOrCreateTestCampaign(userId);

  const resendMsgId = `smtp_test_${Date.now()}`;
  const testEmail = "test-webhook@radar-test.dev";
  const recipientId = await getOrCreateTestRecipient(
    campaignId,
    testEmail,
    resendMsgId
  );

  console.log(`  campaignId:     ${campaignId}`);
  console.log(`  recipientId:    ${recipientId}`);
  console.log(`  resendMsgId:    ${resendMsgId}`);
  console.log(`  email:          ${testEmail}`);

  // ── Casos de teste ────────────────────────────────────────────────────────
  const results: boolean[] = [];

  console.log("\n[1] Assinatura inválida deve retornar 400");
  {
    const resp = await fetch(`${APP_URL}/api/webhooks/resend`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "svix-id": "msg_bad",
        "svix-timestamp": String(Math.floor(Date.now() / 1000)),
        "svix-signature": "v1,invalida",
      },
      body: JSON.stringify({ type: "email.delivered" }),
    });
    const ok = resp.status === 400;
    console.log(`  ${ok ? "✓" : "✗"} HTTP ${resp.status} (esperado 400)`);
    results.push(ok);
  }

  // Reseta status para pendente antes de testar eventos de status
  await prisma.emailRecipient.update({
    where: { id: recipientId },
    data: { status: "pendente" },
  });

  console.log("\n[2] email.delivered → recipient.status = 'enviado'");
  results.push(
    await runCase(
      {
        label: "email.delivered",
        event: makeEvent("email.delivered", resendMsgId, [testEmail]),
        expectedStatus: 200,
        expectedRecipientStatus: "enviado",
      },
      recipientId
    )
  );

  console.log("\n[3] email.opened → recipient.status = 'aberto'");
  results.push(
    await runCase(
      {
        label: "email.opened",
        event: makeEvent("email.opened", resendMsgId, [testEmail]),
        expectedStatus: 200,
        expectedRecipientStatus: "aberto",
      },
      recipientId
    )
  );

  console.log("\n[4] email.clicked → recipient.status = 'clicado'");
  results.push(
    await runCase(
      {
        label: "email.clicked",
        event: makeEvent("email.clicked", resendMsgId, [testEmail], {
          click: { link: "https://seu-dominio.com.br" },
        }),
        expectedStatus: 200,
        expectedRecipientStatus: "clicado",
      },
      recipientId
    )
  );

  // Status não deve regredir: 'clicado' → 'enviado' deve ser ignorado
  console.log("\n[5] email.delivered após email.clicked (não deve regredir status)");
  {
    const { status } = await sendWebhookEvent(
      makeEvent("email.delivered", resendMsgId, [testEmail])
    );
    const recipStatus = await getRecipientStatus(recipientId);
    const ok = status === 200 && recipStatus === "clicado";
    console.log(`  ${ok ? "✓" : "✗"} HTTP ${status}, status="${recipStatus}" (deve permanecer "clicado")`);
    results.push(ok);
  }

  // Limpa bounce/unsubscribe de teste antes de testar
  await prisma.emailBounce.deleteMany({ where: { email: testEmail } });
  await prisma.emailUnsubscribe.deleteMany({ where: { email: testEmail } });

  console.log("\n[6] email.bounced → EmailBounce criado + status = 'bounced'");
  {
    const { status } = await sendWebhookEvent(
      makeEvent("email.bounced", resendMsgId, [testEmail], {
        bounce: { message: "5.1.1 User unknown" },
      })
    );
    const recipStatus = await getRecipientStatus(recipientId);
    const bounce = await prisma.emailBounce.findUnique({ where: { email: testEmail } });
    const ok = status === 200 && recipStatus === "bounced" && bounce !== null;
    console.log(`  ${ok ? "✓" : "✗"} HTTP ${status}, status="${recipStatus}", EmailBounce=${bounce ? "criado" : "AUSENTE"}`);
    results.push(ok);
  }

  // Limpa para testar spam complaint
  await prisma.emailBounce.deleteMany({ where: { email: testEmail } });
  await prisma.emailUnsubscribe.deleteMany({ where: { email: testEmail } });
  await prisma.emailRecipient.update({
    where: { id: recipientId },
    data: { status: "enviado" },
  });

  console.log("\n[7] email.complained → EmailBounce + EmailUnsubscribe + status = 'bounced'");
  {
    const { status } = await sendWebhookEvent(
      makeEvent("email.complained", resendMsgId, [testEmail])
    );
    const recipStatus = await getRecipientStatus(recipientId);
    const bounce = await prisma.emailBounce.findUnique({ where: { email: testEmail } });
    const unsub = await prisma.emailUnsubscribe.findUnique({ where: { email: testEmail } });
    const ok =
      status === 200 &&
      recipStatus === "bounced" &&
      bounce !== null &&
      unsub !== null;
    console.log(
      `  ${ok ? "✓" : "✗"} HTTP ${status}, status="${recipStatus}", EmailBounce=${bounce ? "ok" : "AUSENTE"}, EmailUnsubscribe=${unsub ? "ok" : "AUSENTE"}`
    );
    results.push(ok);
  }

  console.log("\n[8] email.received → status = 'respondido' (best-effort)");
  {
    // Garante que o recipient tem status adequado para subir para 'respondido'
    await prisma.emailRecipient.update({
      where: { id: recipientId },
      data: { status: "enviado" },
    });
    const { status } = await sendWebhookEvent(
      makeEvent("email.received", resendMsgId, ["noreply@radar.dev"], {
        from: `${testEmail}`,
        subject: "Re: Teste de campanha",
      })
    );
    const recipStatus = await getRecipientStatus(recipientId);
    const ok = status === 200 && recipStatus === "respondido";
    console.log(`  ${ok ? "✓" : "✗"} HTTP ${status}, status="${recipStatus}"`);
    results.push(ok);
  }

  // ── Resultado final ───────────────────────────────────────────────────────
  const passed = results.filter(Boolean).length;
  const total = results.length;

  console.log("\n" + "=".repeat(60));
  console.log(`Resultado: ${passed}/${total} casos passaram`);
  console.log(passed === total ? "✓ TODOS OS CASOS PASSARAM" : "✗ ALGUNS CASOS FALHARAM");
  console.log("=".repeat(60));

  await prisma.$disconnect();
  process.exit(passed === total ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
