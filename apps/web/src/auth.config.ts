/**
 * Configuração "edge-safe" do Auth.js — sem imports de módulos nativos Node.js.
 * Usada pelo middleware (Edge runtime) para verificar JWTs.
 *
 * A configuração completa (com o provider Credentials + argon2) fica em auth.ts
 * e roda apenas no Node.js runtime (route handlers, Server Components).
 */
import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  providers: [],

  session: { strategy: "jwt" },

  pages: {
    signIn: "/login",
  },

  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id!;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id as string;
      session.user.role = token.role as "banker" | "admin";
      return session;
    },
  },
} satisfies NextAuthConfig;
