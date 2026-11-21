/**
 * Cria (ou atualiza) o usuário admin de teste.
 * Variáveis lidas do .env (packages/db/.env):
 *   SEED_ADMIN_EMAIL    — e-mail do admin
 *   SEED_ADMIN_PASSWORD — senha em texto plano (será hasheada com argon2)
 *
 * Uso: npm run seed --workspace=packages/db
 */

import { hash } from "@node-rs/argon2";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD devem estar definidos em packages/db/.env",
    );
  }

  const senha_hash = await hash(password);

  const user = await prisma.user.upsert({
    where: { email },
    update: { senha_hash, papel: "admin" },
    create: {
      email,
      nome: "Admin",
      senha_hash,
      papel: "admin",
    },
  });

  console.log(`✓ Usuário admin criado/atualizado: ${user.email} (id: ${user.id})`);
}

main()
  .catch((err) => {
    console.error("Seed falhou:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
