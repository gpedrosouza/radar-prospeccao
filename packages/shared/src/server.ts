/**
 * Utilitários server-only do pacote shared.
 *
 * Este arquivo usa node:crypto e só pode ser importado em contextos Node.js
 * (rotas de API, workers, scripts). NUNCA importar em hooks ou componentes
 * client-side — use "@radar/shared" para código compartilhado com o browser.
 *
 * Import: import { ... } from "@radar/shared/server"
 */

import { createHmac, timingSafeEqual } from "node:crypto";

// Sem extensão de propósito: o webpack do Next resolve o caminho literalmente
// (transpilePackages compila o fonte TS direto) e "./geocoding.js" não existe
// no disco. O pacote não é ESM, então NodeNext aceita o import extensionless.
export * from "./geocoding";

/**
 * Gera um token assinado com HMAC-SHA256 para o link de descadastro.
 *
 * Formato: base64url(payload).base64url(HMAC-SHA256(secret, payload))
 * Payload: JSON.stringify({ e: email, c: campaignId })
 */
export function generateUnsubscribeToken(
  email: string,
  campaignId: string,
  secret: string
): string {
  const payload = Buffer.from(
    JSON.stringify({ e: email, c: campaignId })
  ).toString("base64url");
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

/**
 * Verifica e decodifica um token de descadastro.
 *
 * @returns { email, campaignId } se válido, null se inválido ou adulterado.
 */
export function verifyUnsubscribeToken(
  token: string,
  secret: string
): { email: string; campaignId: string } | null {
  const dotIdx = token.lastIndexOf(".");
  if (dotIdx < 0) return null;

  const payload = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);

  const expected = createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");

  const sigBuf = Buffer.from(sig,      "base64url");
  const expBuf = Buffer.from(expected, "base64url");
  if (sigBuf.length !== expBuf.length) return null;
  if (!timingSafeEqual(sigBuf, expBuf)) return null;

  try {
    const data = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf-8")
    ) as { e: unknown; c: unknown };
    if (typeof data.e !== "string" || typeof data.c !== "string") return null;
    return { email: data.e, campaignId: data.c };
  } catch {
    return null;
  }
}
