---
tags: [historico, claude-code]
---

# Histórico — CLAUDE.md até 16/10/2026

> Cópia integral do CLAUDE.md anterior (308 linhas), guardada aqui quando ele foi enxugado.
> O checklist detalhado das Fases 0–5, a árvore de pastas e a tabela de variáveis saíram do CLAUDE.md:
> variáveis estão nos `.env.example`; status atual em [[Status-Atual]].

# CLAUDE.md — Radar Prospecção

Lido automaticamente pelo Claude Code no início de cada sessão. Mantenha denso e atualizado.

---

## Sobre o projeto

Sistema de prospecção geográfica de empresas para personal bankers. Cruza a base pública de CNPJs
da Receita Federal (~66 milhões de registros) com Google Places e busca por raio geoespacial,
permitindo que bankers identifiquem empresas-alvo dentro de uma área de cobertura. É um recomeço
do zero a partir de uma v1 que cresceu organicamente e acumulou problemas sérios de performance e
arquitetura (queries sem índice sobre tabela monolítica, processamento síncrono de exportações,
etc.). A v2 resolve isso com particionamento, filas e separação clara de camadas desde o dia 1.

---

## Regras arquiteturais inegociáveis

1. **`apps/web` e `apps/workers` NUNCA importam um do outro.** Código compartilhado vai sempre
   em `packages/`. O ESLint reforça isso via `no-restricted-imports`.

2. **Rotas de API nunca tocam o Prisma diretamente.** O fluxo é sempre:
   `route handler → server/services → server/repositories → Prisma`.
   Isso ainda não existe — quando for criado, seguir esse padrão.

3. **`company_cnpj` é particionada por LIST(uf) com 27 partições.** Qualquer `ALTER TABLE` nela
   exige migration SQL manual em `packages/db/prisma/migrations/`. Nunca usar
   `prisma migrate dev` para modificar essa tabela — ele gera DDL sem `PARTITION BY`.
   Após aplicar o SQL, rodar `npm run db:deploy --workspace=packages/db`.

4. **Jobs longos (exportação, geocodificação, enriquecimento Google Places) SEMPRE via fila
   BullMQ**, nunca processamento síncrono numa rota de API. Filas ainda não implementadas.

5. **Arquivos de exportação vão para Cloudflare R2**, nunca para disco local do container.
   R2 ainda não configurado.

6. **Queries de UI nunca agregam direto sobre `company_cnpj`.** Agregações e relatórios usam
   o schema `analytics` (a ser criado). Queries de listagem/paginação na tabela particionada
   devem sempre incluir o filtro `uf` para ativar partition pruning.

---

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend/BFF | Next.js 15 (App Router), React 19, TypeScript strict |
| Autenticação | Auth.js (next-auth v5) — JWT, Credentials provider, argon2 |
| ORM | Prisma 5 (schema + client) |
| Banco | PostgreSQL 16 + PostGIS 3.4 (via `postgis/postgis:16-3.4`) |
| Cache / Filas | Redis 7 + BullMQ (filas não implementadas ainda) |
| Storage | Cloudflare R2 (não configurado ainda) |
| Workers | Node.js standalone com tsx (sem framework web) |
| E-mail | Resend (fase futura) |
| Mapas | Google Maps JS API + Google Places API |
| Testes | Vitest |
| Infra local | Docker Compose |

---

## Estrutura do monorepo

```
radar-prospeccao/
├── apps/
│   ├── web/                        ← Next.js 15, App Router
│   │   └── src/
│   │       ├── app/
│   │       │   ├── api/
│   │       │   │   ├── auth/[...nextauth]/route.ts
│   │       │   │   └── health/route.ts
│   │       │   ├── login/
│   │       │   │   ├── actions.ts  ← Server Action de login
│   │       │   │   └── page.tsx
│   │       │   ├── layout.tsx
│   │       │   └── page.tsx
│   │       ├── auth.config.ts      ← Config edge-safe (middleware)
│   │       ├── auth.ts             ← Config completa (Node.js, argon2)
│   │       ├── middleware.ts       ← Protege /api/* com 401 JSON
│   │       ├── lib/prisma.ts       ← Singleton PrismaClient
│   │       └── types/next-auth.d.ts
│   └── workers/                    ← Node standalone, sem framework web
│       └── src/index.ts
│
├── packages/
│   ├── db/                         ← Prisma schema + client + seeds
│   │   ├── prisma/
│   │   │   ├── schema.prisma       ← User, CompanyCnpj, City, CnpjExportJob
│   │   │   └── migrations/
│   │   │       └── 20260626000001_init/migration.sql  ← DDL manual (partições)
│   │   ├── seeds/create-admin.ts   ← npm run seed --workspace=packages/db
│   │   └── src/index.ts            ← Exporta PrismaClient e Prisma types
│   └── shared/                     ← Tipos TypeScript e validadores Zod
│       └── src/index.ts
│
├── docker-compose.yml              ← postgres (postgis:16-3.4) + redis
├── .env.example                    ← Template com todas as variáveis documentadas
├── package.json                    ← npm workspaces raiz
└── tsconfig.base.json
```

---

## Como rodar localmente

```bash
# 1. Clonar e instalar
npm install

# 2. Variáveis de ambiente
cp .env.example .env                                # docker-compose + seed
cp apps/web/.env.local.example apps/web/.env.local  # Next.js
# apps/web/.env.local precisa de: DATABASE_URL, AUTH_SECRET, AUTH_URL, SEED_ADMIN_*

# 3. Subir infraestrutura
docker compose up -d

# 4. Aplicar migration (cria tabelas, partições, índices)
npm run db:deploy --workspace=packages/db

# 5. Gerar Prisma Client
npm run db:generate --workspace=packages/db

# 6. Criar usuário admin de teste
npm run seed --workspace=packages/db

# 7. Rodar o app
npm run dev --workspace=apps/web
```

**Verificar que o banco está OK:**
```bash
docker exec radar_postgres psql -U radar -d radar_db -c "SHOW shared_buffers;"
# deve retornar 2GB
docker exec radar_postgres psql -U radar -d radar_db -c "SELECT PostGIS_Version();"
# deve retornar 3.4 USE_GEOS=1 ...
```

---

## Convenções de código

- **TypeScript strict**: sem `any` não justificado; use `unknown` + type guards quando necessário.
- **Nomes**: modelos Prisma em PascalCase (`CompanyCnpj`), tabelas SQL em snake_case
  (`company_cnpj`), partições com sufixo UF (`company_cnpj_sp`).
- **Commits**: Conventional Commits — `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`.
- **Testes**: toda função de service/repository tem teste Vitest correspondente.
  Rodar com `npm test --workspace=apps/web`.
- **Sem comentários óbvios**: só comentar WHY, nunca WHAT.
- **Server Actions** sempre em arquivos separados `actions.ts` com `"use server"` no topo.

---

## Detalhes críticos do banco

- **Particionamento**: `company_cnpj` usa `PARTITION BY LIST (uf)`, PK composta `(id, uf)`.
  Sequence global `company_cnpj_id_seq` (não bigserial por partição).
- **Índice CNAE**: usa `bpchar_pattern_ops` (não `text_pattern_ops` — `CHAR` não aceita este).
- **PostGIS**: coluna `geom GEOGRAPHY(POINT, 4326)` em `company_cnpj`, ainda sem dados
  (populada na fase de geocodificação). Índice GIST já criado.
- **Partition pruning**: queries na UI DEVEM incluir `WHERE uf = ?` para o planner usar
  só a partição correta em vez de full scan nas 27.
- `@node-rs/argon2` é nativo — requer `serverExternalPackages` no `next.config.ts` e
  o split config (auth.config.ts vs auth.ts) para compatibilidade com Edge runtime.

---

## Estratégia de geocodificação / enriquecimento externo

Geocodificar os ~15-20M de CNPJs ativos via Google Geocoding API sem controle custaria dezenas
de milhares de dólares (ver comentário em `apps/workers/src/scripts/geocode-cnpj.ts`). Decisão:
usar uma **cascata de fontes**, do mais barato para o mais caro, e persistir o resultado
permanentemente em `company_cnpj.latitude/longitude/geom` (nunca reconsultar um CNPJ já
geocodificado — `WHERE latitude IS NULL` já garante isso).

Ordem da cascata (implementar nessa prioridade):
1. **CNEFE/IBGE** (Censo 2022, `ftp.ibge.gov.br/Censos/Censo_Demografico_2022/`) — dataset público,
   gratuito, já 100% georreferenciado, importado uma vez para uma tabela de lookup local
   (`cnefe_enderecos` ou equivalente). Zero custo por consulta depois de importado.
2. **CEP-centroide** via BrasilAPI (`https://brasilapi.com.br/api/cep/v2/{cep}`) — gratuito, sem
   chave, quando o CEP não bate com nada no CNEFE local. Precisão de bairro/CEP é suficiente para
   busca por raio de vários km (não precisa de precisão de porta de rua).
3. **Google Geocoding API** (`GOOGLE_MAPS_API_KEY`, já existe em `geocode-cnpj.ts`) — só como
   fallback final, quando as duas fontes acima não resolverem. É a única etapa paga.

Geocodificação hoje é **sob demanda / incremental**, nunca em lote irrestrito:
- Script manual `apps/workers/src/scripts/geocode-cnpj.ts` para backfill controlado (`--dry-run`,
  `LIMIT`, `UF`).
- Evoluir para fila BullMQ de enriquecimento (`enrichment-queue`, mencionada como planejada no
  vault mas nunca implementada) que geocodifica sob demanda os CNPJs retornados por uma busca no
  Mapa sem coordenada, respeitando a mesma cascata acima.

---

## Variáveis de ambiente necessárias

| Variável | Onde | Para quê |
|---|---|---|
| `DATABASE_URL` | `packages/db/.env`, `apps/web/.env.local` | Prisma |
| `AUTH_SECRET` | `apps/web/.env.local` | Assinar JWTs (next-auth) |
| `AUTH_URL` | `apps/web/.env.local` | URL base do app Next.js |
| `SEED_ADMIN_EMAIL` | `packages/db/.env` | Seed do usuário admin |
| `SEED_ADMIN_PASSWORD` | `packages/db/.env` | Seed do usuário admin |
| `POSTGRES_*` | `.env` (raiz) | docker-compose |
| `REDIS_URL` | `.env` (raiz) | Workers + web (futuro) |
| `GOOGLE_MAPS_API_KEY` | `apps/workers/.env` | Geocoding API — etapa paga da cascata (`geocode-cnpj.ts` + consumer `geocode-enrichment`) |
| `CNEFE_IMPORTED_UFS` | `apps/workers/.env` | Informativo — UFs já importadas via `import:cnefe` (idempotência real é verificada no banco) |
| `GEOCODE_ENRICHMENT_GOOGLE_CAP_PER_JOB` | `apps/workers/.env` | Teto de chamadas Google por job da fila `geocode-enrichment` (default 20) |
| `GOOGLE_SCHEDULING_SA_EMAIL` / `GOOGLE_SCHEDULING_SA_PRIVATE_KEY` | `apps/web/.env.local` | Service account com domain-wide delegation — autentica a Calendar API para `/agende` |
| `GOOGLE_SCHEDULING_CALENDAR_ID` | `apps/web/.env.local` | Calendário onde os eventos de reunião são criados |
| `GOOGLE_SCHEDULING_IMPERSONATE_EMAIL` | `apps/web/.env.local` | Usuário do Workspace impersonado via domain-wide delegation (`subject` do JWT) |
| `SCHEDULING_MEETING_DURATION_MINUTES` / `SCHEDULING_BUFFER_MINUTES` / `SCHEDULING_MIN_NOTICE_HOURS` / `SCHEDULING_BUSINESS_HOURS_START` / `SCHEDULING_BUSINESS_HOURS_END` | `apps/web/.env.local` | Regras de negócio do agendamento (não vêm da API do Google) |

---

## Onde encontrar mais contexto

O vault Obsidian está em `radar-vault/` na raiz do repositório. Documentos relevantes:

| Caminho | Conteúdo |
|---|---|
| `radar-vault/00-Visao/` | Escopo do MVP, personas, jornada do usuário |
| `radar-vault/01-Arquitetura/` | Modelo de dados, stack, infra, segurança |
| `radar-vault/03-Fases-Desenvolvimento/` | Status por fase e `Status-Atual.md` |
| `radar-vault/04-Prompts-ClaudeCode/` | Prompts planejados para cada sessão de desenvolvimento |
| `radar-vault/05-Decisoes-ADR/` | ADR-001 a ADR-005 — o "porquê" de cada decisão estrutural |

Quando o usuário mencionar "veja o ADR-00X" ou "veja Status Atual", leia o arquivo correspondente
em `radar-vault/`. Se o arquivo não estiver acessível, peça para o usuário colar o conteúdo.

---

## Fase atual

**MVP completo** — todas as fases do plano inicial implementadas. Próximos passos: ver roadmap pós-MVP no vault Obsidian.

### Fase 0 — Fundação ✅
- [x] Monorepo com npm workspaces (`apps/web`, `apps/workers`, `packages/db`, `packages/shared`)
- [x] Docker Compose: PostgreSQL 16 + PostGIS 3.4 com tuning para 66M registros, Redis 7 + MinIO
- [x] Schema Prisma completo: `User`, `CompanyCnpj`, `City`, `CnpjExportJob`, `PlacesCache`
- [x] Migration SQL manual com `company_cnpj` particionada (27 partições), índices e PostGIS
- [x] Autenticação: Auth.js v5, Credentials + argon2, JWT, middleware protegendo `/api/*`
- [x] Seed: usuário admin de teste via variáveis de ambiente
- [x] Testes Vitest: autenticação, services e integração com banco

### Fase 1 — Backend/Workers ✅
- [x] BullMQ: fila `cnpj-export` com producer em `apps/web` e consumer em `apps/workers`
- [x] Exportação CSV: cursor-based pagination → csv-stringify → gzip → S3 multipart (MinIO local)
- [x] SSE: `GET /api/cnpj/export-jobs/[id]/stream` com polling interno e URL pré-assinada on-demand
- [x] Importador da Receita Federal: COPY streaming, staging tables, ordem correta de tabelas
- [x] Geocodificação de CNPJs via script worker
- [x] Analytics: schema separado com views materializadas

### Fase 2 — API ✅
- [x] `GET /api/cities/radius` — cidades no raio via PostGIS
- [x] `GET /api/places/companies` — Google Places com cache por grid geográfico (células 0,1°)
- [x] `GET /api/cnpj/companies` — busca paginada por cursor, count com teto (10.000)
- [x] `POST /api/cnpj/export-jobs` — cria job + enfileira no BullMQ
- [x] `GET /api/cnpj/export-jobs` — histórico de jobs do usuário
- [x] `GET /api/cnpj/export-jobs/[id]` — detalhe de job
- [x] `GET /api/cnpj/export-jobs/[id]/stream` — SSE de progresso (feito na Fase 1)
- [x] Testes de integração (Vitest + banco real) para rotas de export-jobs e cnpj/companies
- [x] Cache Places: `PlacesCache` com TTL configurável + cleanup script no worker

### Fase 3 — UI ✅
- [x] Layout base do dashboard (sidebar com navegação, topbar com injeção de ações via contexto)
- [x] Tela Mapa: Google Maps JS API com círculo de raio, marcadores de CNPJs, painel de filtros lateral
- [x] Tela CNPJs: filtros horizontais, barra de stats, tabela com paginação cursor-based, chips removíveis
- [x] Tela Exportações: cards de jobs com SSE, progress bar, download/retry
- [x] Fluxo de exportação: botão CSV Completo → POST job → SSE progress → download pré-assinado
- [x] Compartilhamento de filtros por URL entre Mapa e CNPJs (mesmas query params)
- [x] `useCnpjFilters` hook: lê URL, valida com Zod, expõe `removeFilter`/`clearFilters`/`updateFilter`
- [x] `FilterChips` componente compartilhado usado em Mapa e CNPJs
- [x] Sidebar preserva filtros ao navegar entre `/mapa` ↔ `/cnpjs`
- [x] `computeRemovedParams` com testes Vitest

### Fase 4 — Workers e Escala ✅
- [x] Backup automático do PostgreSQL: pg_dump -Fc → R2 (bucket separado `radar-backups`) com cron container às 03:00 UTC; retenção 7 dias diários / 30 dias semanais; restore testado e validado
- [x] CI/CD com GitHub Actions: pipeline test → build-and-push (GHCR) → deploy via SSH; migrator service com `profiles: [migrate]`
- [x] `GET /api/health` público: verifica Postgres (`SELECT 1`) e Redis (`PING`) em paralelo; retorna 200/503; excluído do middleware de autenticação
- [x] Rate limiting em `POST /api/cnpj/export-jobs`: 5 jobs simultâneos (DB-based, sem side effect) + 10 jobs/hora (Redis INCR com TTL); erros de domínio `ExportConcurrentLimitError` / `ExportHourlyLimitError` → 429 com mensagem clara
- [x] Monitoramento externo documentado em `docs/deploy.md` (UptimeRobot apontando para `/api/health`)

### Fase 5 — E-mail ✅
- [x] Schema: `EmailCampaign`, `EmailRecipient`, `EmailBounce`, `EmailUnsubscribe` + enums `CampaignStatus`, `RecipientStatus`, `BounceType`
- [x] `buildRecipientList`: exclusão obrigatória de bounces/unsubscribes na montagem da lista
- [x] Fila BullMQ `email-campaign`: consumer com batch-fetch por UF (partition pruning), renderTemplate, delay configurável, headers RFC 8058
- [x] `POST /api/campaigns` + `GET /api/campaigns` — criação e listagem com stats de engajamento
- [x] `POST /api/campaigns/[id]/send` — disparo via BullMQ (idempotente por jobId = campaignId)
- [x] `GET /api/unsubscribe` + `POST /api/unsubscribe` — token HMAC-SHA256, RFC 8058 one-click
- [x] `POST /api/webhooks/resend` — verificação SVIX, 6 tipos de evento, lógica de prioridade de status
- [x] Tela Campanhas: formulário com chips de variáveis, seletor de base, pré-visualização, modal de confirmação, painel de histórico com mini-métricas (taxa abertura/clique/resposta)
- [x] Aviso LGPD fixo (não dismissable) em todas as superfícies de disparo
- [x] Variáveis de ambiente documentadas: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_REPLY_TO` (opcional — Reply-To das campanhas), `RESEND_WEBHOOK_SECRET`, `UNSUBSCRIBE_TOKEN_SECRET`, `EMAIL_SEND_DELAY_MS`, `APP_URL`

### Decisões técnicas registradas nesta fase

**COUNT com teto (`countByFiltersCapped`):**
Usa `findMany({ take: cap+1, select: { id, uf } })` para reutilizar `buildWhere` do Prisma
(incluindo partition pruning por `uf`) sem duplicar SQL raw. Custo: lê no máximo `cap+1`
IDs em vez de `COUNT(*)` ilimitado. Padrão EXPLAIN-based descartado por baixa confiabilidade
com múltiplos filtros AND e sem ANALYZE recente.

**Mocking em testes de integração com Next.js:**
`vi.mock("@/auth")` sem factory force-carrega `next-auth` → `next/server` → erro em Node.js.
Solução: sempre usar factory `vi.mock("@/auth", () => ({ auth: vi.fn() }))`. Requisições
criadas com `new Request(url) + .nextUrl patchado` em vez de `new NextRequest`.
