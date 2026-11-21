FROM node:20-alpine

# postgresql16-client provê pg_dump e pg_restore — necessários para backup/restore
RUN apk add --no-cache postgresql16-client openssl

WORKDIR /app

# ── Layer 1: manifests (invalida cache só quando dependências mudam) ──────────
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/db/package.json      ./packages/db/
COPY packages/shared/package.json  ./packages/shared/
COPY apps/workers/package.json     ./apps/workers/
# apps/web precisa existir no workspace para npm ci não falhar
COPY apps/web/package.json         ./apps/web/

RUN npm ci

# ── Layer 2: código-fonte ─────────────────────────────────────────────────────
COPY packages/ ./packages/
COPY apps/workers/ ./apps/workers/

# Gera Prisma Client com base no schema da migration já aplicada
RUN npm run db:generate --workspace=packages/db

# tsx executa TypeScript diretamente — sem step de compilação necessário
CMD ["npm", "run", "dev", "--workspace=apps/workers"]
