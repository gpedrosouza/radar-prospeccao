# =============================================================================
# Radar Prospecção — Dockerfile de produção para apps/web (Next.js)
# Build context: raiz do monorepo
#   docker build -f apps/web/Dockerfile -t radar-web:prod .
# =============================================================================

# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 — deps: instala todas as dependências (cache-friendly)
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps

# libc6-compat: necessário para bindings nativos (argon2, Prisma) em Alpine
RUN apk add --no-cache libc6-compat

WORKDIR /app

# Copia apenas os manifests — a camada é invalidada só quando deps mudam
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/db/package.json     packages/db/
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json        apps/web/
# apps/workers precisa existir no workspace para o npm ci não reclamar
COPY apps/workers/package.json    apps/workers/

RUN npm ci

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 — builder: compila tudo
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

RUN apk add --no-cache libc6-compat

WORKDIR /app

# Reutiliza node_modules do stage anterior
COPY --from=deps /app/node_modules ./node_modules

# Copia todo o código-fonte
COPY . .

# Regenera Prisma Client para a plataforma correta (linux-musl-openssl-3.0.x)
RUN npm run db:generate --workspace=packages/db

# Compila packages compartilhados (shared antes de db, db antes de web)
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=packages/db

# Build do Next.js
# output: 'standalone' em next.config.ts produz imagem final mínima
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build --workspace=apps/web

# ─────────────────────────────────────────────────────────────────────────────
# Stage 3 — runner: imagem final mínima
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

RUN apk add --no-cache libc6-compat

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Usuário não-root para segurança
RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

# O standalone output é auto-suficiente: inclui server.js + node_modules mínimos.
# A estrutura gerada reflete o layout do monorepo:
#   apps/web/.next/standalone/
#   └── apps/web/server.js   ← ponto de entrada
#       node_modules/        ← deps de runtime (sem devDeps)
COPY --from=builder --chown=nextjs:nodejs \
    /app/apps/web/.next/standalone ./

# Assets estáticos e public precisam ser copiados para dentro do standalone dir
COPY --from=builder --chown=nextjs:nodejs \
    /app/apps/web/.next/static  ./apps/web/.next/static

COPY --from=builder --chown=nextjs:nodejs \
    /app/apps/web/public        ./apps/web/public

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# server.js fica em apps/web/ dentro do diretório standalone (espelha o monorepo)
CMD ["node", "apps/web/server.js"]
