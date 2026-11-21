/**
 * Middleware Edge-compatible: usa auth.config.ts (sem argon2/Prisma).
 * Verifica apenas o JWT de sessão — nenhum módulo nativo é necessário aqui.
 */
import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // /api/auth/* é gerenciado internamente pelo next-auth — sempre passa
  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  // /api/health é uma probe pública (Docker, UptimeRobot) — sem auth
  if (pathname === "/api/health") {
    return NextResponse.next();
  }

  // /api/unsubscribe processa links de descadastro de e-mail enviados para não-usuários
  if (pathname === "/api/unsubscribe") {
    return NextResponse.next();
  }

  // /api/webhooks/resend recebe eventos do Resend (assinatura própria via SVIX)
  if (pathname === "/api/webhooks/resend") {
    return NextResponse.next();
  }

  // /api/scheduling/* é chamado por leads não autenticados na página pública /agende
  if (pathname === "/api/scheduling/availability" || pathname === "/api/scheduling/book") {
    return NextResponse.next();
  }

  // Qualquer outra rota /api/* sem sessão válida → 401 JSON
  if (!req.auth) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/api/:path*"],
};
