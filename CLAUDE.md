# CLAUDE.md — Radar Prospecção

Prospecção geográfica de empresas para personal bankers: cruza ~66 milhões de CNPJs da Receita Federal
com Google Places e busca por raio (PostGIS). Inclui campanhas de e-mail (Resend) e agendamento (`/agende`).
MVP completo (Fases 0–5); próximos passos e histórico de fases no vault.

## Antes de qualquer tarefa
- Vault em `radar-vault/` — entrada `00-INDEX.md`; fase e próximo passo em `03-Fases-Desenvolvimento/Status-Atual.md`.
- O "porquê" das decisões estruturais: `05-Decisoes-ADR/` (ADR-001 a 005). Abra só o que a tarefa exige.

## Regras arquiteturais inegociáveis
1. `apps/web` e `apps/workers` NUNCA importam um do outro. Código comum vai em `packages/` (o ESLint barra).
2. Rotas de API nunca tocam o Prisma: `route handler → server/services → server/repositories → Prisma`
   (`apps/web/src/server/`). Única exceção: `api/health`.
3. IMPORTANTE: `company_cnpj` é particionada por `LIST(uf)` (27 partições). Qualquer `ALTER TABLE` nela é migration
   SQL manual em `packages/db/prisma/migrations/` — nunca `prisma migrate dev` (gera DDL sem `PARTITION BY`).
   Depois: `npm run db:deploy --workspace=packages/db`.
4. Jobs longos (exportação, geocodificação, enriquecimento, campanhas) sempre via fila BullMQ, nunca síncronos numa rota.
5. Arquivos de exportação e backups vão para storage S3-compatível (MinIO local, Cloudflare R2 em produção —
   `apps/workers/src/lib/s3-client.ts`), nunca para disco do container.
6. Queries de UI nunca agregam direto sobre `company_cnpj`: agregações usam o schema `analytics` (views materializadas).
   Listagem/paginação na tabela particionada sempre filtra `uf` (partition pruning).

## Stack
Next.js 15 (App Router) + React 19 + TypeScript strict · Auth.js v5 (JWT, Credentials, argon2) · Prisma 5 ·
PostgreSQL 16 + PostGIS 3.4 · Redis 7 + BullMQ · Workers Node com tsx · Resend · Google Maps/Places/Calendar · Vitest.

Workspaces: `apps/web`, `apps/workers`, `packages/db` (`@radar/db`: schema, migrations, seeds), `packages/shared` (tipos e Zod).

## Ambiente local
- `docker compose up -d` (Postgres + Redis + MinIO). Docker Desktop precisa de 4–6 GB de RAM (`shared_buffers=2GB`).
- Variáveis: todas documentadas em `.env.example` (raiz), `apps/web/.env.local.example` e `packages/db/.env.example`.
- Primeira vez: `npm install` → `db:deploy` → `db:generate` → `seed` (todos com `--workspace=packages/db`).
- Dev: `npm run dev --workspace=apps/web` e `npm run dev --workspace=apps/workers`.

## Comandos de verificação
- Lint: `npm run lint` (raiz) · Formatação: `npm run format:check`
- Testes: `npm test --workspace=apps/web` · `npm test --workspace=packages/db`
- Build/typecheck: `npm run build --workspace=<pacote>`

## Convenções
- TypeScript strict: sem `any` não justificado; `unknown` + type guards.
- Prisma em PascalCase (`CompanyCnpj`); SQL em snake_case (`company_cnpj`); partições com sufixo UF (`company_cnpj_sp`).
- Toda função de service/repository tem teste Vitest.
- Server Actions em arquivos `actions.ts` com `"use server"` no topo.
- Comentários só explicam o porquê, nunca o quê.

## Banco — detalhes que quebram fácil
- `company_cnpj`: PK composta `(id, uf)`, sequence global `company_cnpj_id_seq` (não bigserial por partição).
- Índice CNAE usa `bpchar_pattern_ops` (`CHAR` não aceita `text_pattern_ops`).
- `geom GEOGRAPHY(POINT, 4326)` com índice GIST.
- `@node-rs/argon2` é nativo: exige `serverExternalPackages` no `next.config.ts` e o split `auth.config.ts` (edge) / `auth.ts` (Node).
- Contagens na UI usam `countByFiltersCapped` (teto de 10.000, reaproveita `buildWhere` com pruning) — não trocar por `COUNT(*)`.
- Views materializadas (ex.: `grupo_economico`) precisam de refresh: `npm run analytics:refresh --workspace=apps/workers`.

## Geocodificação — custo
Geocodificar 15–20M de CNPJs no Google custaria dezenas de milhares de dólares. Cascata obrigatória, da mais barata para a paga:
1. CNEFE/IBGE (Censo 2022) importado localmente — custo zero por consulta.
2. Centroide de CEP via BrasilAPI — gratuito.
3. Google Geocoding — só como último recurso, com teto por job (`GEOCODE_ENRICHMENT_GOOGLE_CAP_PER_JOB`).
Resultado persistido para sempre (`WHERE latitude IS NULL` evita reconsulta). Nunca geocodificar em lote irrestrito:
o script `geocode-cnpj.ts` tem `--dry-run`, `LIMIT` e `UF`.

## Testes — armadilha conhecida
`vi.mock("@/auth")` sem factory carrega `next-auth` → `next/server` e quebra no Node. Sempre:
`vi.mock("@/auth", () => ({ auth: vi.fn() }))`. Requests de teste: `new Request(url)` com `.nextUrl` ajustado, não `new NextRequest`.

## Cuidados — pergunte antes de rodar
- Scripts de `apps/workers` que mexem em dados reais ou custam dinheiro: `enviar:teste` e `reconciliar:resend` (enviam e-mail),
  `restore`, `import:*`, `reenrich:*`, `backfill:*`, `geocode:cnpj` sem `--dry-run`.
- Planilhas `*.xlsx` da raiz são bases de leads com dados de empresas e sócios: nunca versionar nem usar em testes.
- Campanhas de e-mail: o aviso LGPD nas telas de disparo é fixo e não pode ser removido; listas sempre excluem bounces e descadastros.

## Pronto =
`npm run lint` e os testes do pacote alterado passando, com a saída mostrada. Mudança de schema: migration criada e `db:generate` rodado.

## Fim de sessão
- Atualizar `radar-vault/03-Fases-Desenvolvimento/Status-Atual.md` (última sessão + próximo passo).
- Decisão estrutural nova: ADR em `05-Decisoes-ADR/` (use `ADR-Template.md`).
