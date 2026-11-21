/**
 * Configuração completa do Auth.js — roda apenas no Node.js runtime.
 * Importa argon2 (nativo) e Prisma. NÃO importar em middleware.ts.
 */
import NextAuth, { type NextAuthResult } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { verify } from "@node-rs/argon2";
import { prisma } from "@/lib/prisma";
import { authConfig } from "./auth.config";

export const { handlers, auth, signIn, signOut }: NextAuthResult = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "E-mail", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(rawCredentials) {
        const email = String(rawCredentials?.email ?? "").trim();
        const password = String(rawCredentials?.password ?? "");

        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;

        const validPassword = await verify(user.senha_hash, password);
        if (!validPassword) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.nome,
          role: user.papel,
        };
      },
    }),
  ],
});
