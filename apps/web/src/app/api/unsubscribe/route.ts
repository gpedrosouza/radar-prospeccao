/**
 * GET  /api/unsubscribe?token=X  — link clicável no corpo do e-mail
 * POST /api/unsubscribe?token=X  — one-click unsubscribe (RFC 8058, Gmail/Yahoo)
 *
 * Ambos verificam o token HMAC-SHA256, registram o descadastro em EmailUnsubscribe
 * e retornam confirmação. Rota pública (excluída do middleware de auth).
 *
 * O token é gerado no worker ao compor cada e-mail:
 *   generateUnsubscribeToken(email, campaignId, UNSUBSCRIBE_TOKEN_SECRET)
 */

import { NextResponse } from "next/server";
import { verifyUnsubscribeToken } from "@radar/shared/server";
import { upsertUnsubscribe } from "@/server/repositories/email-campaign.repository";

export const dynamic = "force-dynamic";

const PAGE_OK = (email: string) => `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Descadastro confirmado</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #f5f5f5; display: flex;
           justify-content: center; align-items: center; min-height: 100vh; }
    .card { background: #fff; border-radius: 8px; padding: 48px 40px; max-width: 480px;
            width: 90%; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,.08); }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h1 { font-size: 22px; color: #111; margin-bottom: 12px; }
    p  { font-size: 15px; color: #555; line-height: 1.6; }
    .email { font-weight: 600; color: #111; word-break: break-all; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✓</div>
    <h1>Descadastro realizado</h1>
    <p>O endereço <span class="email">${email}</span> foi removido da nossa lista.<br>
    Você não receberá mais comunicações desta conta.</p>
  </div>
</body>
</html>`;

const PAGE_ERR = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Link inválido</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #f5f5f5; display: flex;
           justify-content: center; align-items: center; min-height: 100vh; }
    .card { background: #fff; border-radius: 8px; padding: 48px 40px; max-width: 480px;
            width: 90%; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,.08); }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h1 { font-size: 22px; color: #c00; margin-bottom: 12px; }
    p  { font-size: 15px; color: #555; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✗</div>
    <h1>Link inválido ou expirado</h1>
    <p>Este link de descadastro não é válido. Se você deseja se descadastrar,
    entre em contato respondendo ao e-mail recebido.</p>
  </div>
</body>
</html>`;

async function handleUnsubscribe(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return new NextResponse(PAGE_ERR, {
      status: 400,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const secret = process.env.UNSUBSCRIBE_TOKEN_SECRET;
  if (!secret) {
    console.error("[unsubscribe] UNSUBSCRIBE_TOKEN_SECRET não configurado");
    return new NextResponse(PAGE_ERR, {
      status: 500,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const payload = verifyUnsubscribeToken(token, secret);
  if (!payload) {
    return new NextResponse(PAGE_ERR, {
      status: 400,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  await upsertUnsubscribe(payload.email, payload.campaignId);

  return new NextResponse(PAGE_OK(payload.email), {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

/** Link clicável no corpo do e-mail — exibe página de confirmação. */
export async function GET(request: Request): Promise<Response> {
  return handleUnsubscribe(request);
}

/**
 * One-click unsubscribe (RFC 8058).
 *
 * Gmail e Yahoo enviam um POST automaticamente quando o usuário clica no botão
 * "Cancelar inscrição" da interface de e-mail. O corpo é `List-Unsubscribe=One-Click`.
 * Retorna 200 JSON (não HTML) pois é uma chamada de máquina, não do usuário.
 */
export async function POST(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return Response.json({ error: "token_required" }, { status: 400 });
  }

  const secret = process.env.UNSUBSCRIBE_TOKEN_SECRET;
  if (!secret) {
    return Response.json({ error: "server_misconfigured" }, { status: 500 });
  }

  const payload = verifyUnsubscribeToken(token, secret);
  if (!payload) {
    return Response.json({ error: "invalid_token" }, { status: 400 });
  }

  await upsertUnsubscribe(payload.email, payload.campaignId);

  return Response.json({ ok: true }, { status: 200 });
}
