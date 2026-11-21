/**
 * Testes de autenticação:
 *   - argon2: hash + verify (unit, sem banco)
 *   - Fluxo de login real contra o banco (requer `npm run seed --workspace=packages/db` antes)
 *
 * Rode com: npm test --workspace=apps/web
 * Variáveis lidas de apps/web/.env.local: DATABASE_URL, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD
 */

import { describe, it, expect, afterAll } from "vitest";
import { hash, verify } from "@node-rs/argon2";
import { PrismaClient } from "@prisma/client";

// ─── Unit: argon2 ─────────────────────────────────────────────────────────────

describe("argon2 password hashing", () => {
  it("hash + verify do mesmo password → true", async () => {
    const pwd = "Senha_De_Teste_123!";
    const hashed = await hash(pwd);
    await expect(verify(hashed, pwd)).resolves.toBe(true);
  });

  it("verify com password errado → false", async () => {
    const hashed = await hash("senha_correta");
    await expect(verify(hashed, "senha_errada")).resolves.toBe(false);
  });

  it("dois hashes do mesmo password são diferentes (salt aleatório)", async () => {
    const pwd = "mesmo_password";
    const [h1, h2] = await Promise.all([hash(pwd), hash(pwd)]);
    expect(h1).not.toBe(h2);
    // mas ambos verificam corretamente
    await expect(verify(h1, pwd)).resolves.toBe(true);
    await expect(verify(h2, pwd)).resolves.toBe(true);
  });
});

// ─── Integration: banco real ───────────────────────────────────────────────────

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@radar.dev";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "admin_dev_password_2024";

const prisma = new PrismaClient();

afterAll(async () => {
  await prisma.$disconnect();
});

describe("fluxo de login contra o banco (requer seed)", () => {
  it("(a) usuário admin existe e tem papel correto", async () => {
    const user = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
    expect(user, "Admin não encontrado — execute: npm run seed --workspace=packages/db").not.toBeNull();
    expect(user?.papel).toBe("admin");
  });

  it("(a) credenciais corretas → verify retorna true", async () => {
    const user = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
    if (!user) throw new Error("Admin não encontrado — execute o seed primeiro");
    await expect(verify(user.senha_hash, ADMIN_PASSWORD)).resolves.toBe(true);
  });

  it("(b) password errado → verify retorna false (credenciais rejeitadas)", async () => {
    const user = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
    if (!user) throw new Error("Admin não encontrado — execute o seed primeiro");
    await expect(verify(user.senha_hash, "senha_definitivamente_errada")).resolves.toBe(false);
  });

  it("(b) email inexistente → findUnique retorna null (login rejeitado)", async () => {
    const user = await prisma.user.findUnique({ where: { email: "nao_existe@test.com" } });
    expect(user).toBeNull();
  });
});
