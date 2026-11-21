# Documentação de Arquitetura — Modelo C4 + Visão 4+1
## Radar de Prospecção Geográfica — v2.0

> **Classificação:** Interno · **Versão:** 1.0 · **Data:** Junho/2026

---

## PARTE I — MODELO C4

O Modelo C4 organiza a arquitetura em quatro níveis de abstração progressiva: Contexto → Contêiner → Componente → Código. Cada nível é destinado a uma audiência diferente.

---

## Nível 1 — Diagrama de Contexto

*Audiência: Qualquer stakeholder, técnico ou não.*

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Contexto do Sistema                             │
│                                                                          │
│   ┌──────────────────┐                                                   │
│   │  Personal Banker  │                                                   │
│   │  (Usuário Primário│                                                   │
│   │  sem perfil técn.)│                                                   │
│   └────────┬─────────┘                                                   │
│            │ Usa via browser (web)                                        │
│            ▼                                                             │
│   ┌─────────────────────────────────────────────────────┐               │
│   │                                                      │               │
│   │        RADAR DE PROSPECÇÃO GEOGRÁFICA               │               │
│   │                                                      │               │
│   │  Plataforma interna que permite prospectar           │               │
│   │  empresas (CNPJs) por área geográfica,               │               │
│   │  exportar listas e disparar e-mails.                 │               │
│   │                                                      │               │
│   └────┬───────────┬──────────────┬────────────┬────────┘               │
│        │           │              │            │                          │
│        ▼           ▼              ▼            ▼                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐                   │
│  │ Receita   │ │  Google  │ │Cloudflare│ │  Resend  │                   │
│  │ Federal   │ │  Maps /  │ │    R2    │ │  (E-mail)│                   │
│  │ (CNPJs,   │ │  Places  │ │(Storage  │ │          │                   │
│  │ 66M reg.) │ │   API    │ │ de CSV)  │ │          │                   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘                   │
│                                                                          │
│   ┌──────────────────┐                                                   │
│   │  Gestor Regional  │                                                   │
│   │  (Usuário Secund.)│                                                   │
│   └──────────────────┘                                                   │
└─────────────────────────────────────────────────────────────────────────┘
```

**Descrição das relações:**

| Relação | Descrição |
|---|---|
| Banker → Sistema | Acessa via browser: mapa, filtros, exportação, campanhas |
| Gestor → Sistema | Acessa histórico de campanhas e métricas da equipe |
| Sistema → Receita Federal | Importa base de CNPJs (batch mensal via download ZIP) |
| Sistema → Google Maps/Places | Geocodificação, mapa interativo, busca de estabelecimentos |
| Sistema → Cloudflare R2 | Upload de CSVs exportados; download pré-assinado |
| Sistema → Resend | Envio de e-mails de campanhas; recebe webhooks de eventos |

---

## Nível 2 — Diagrama de Contêineres

*Audiência: Desenvolvedores e arquitetos.*

```
┌──────────────────────────────────────────────────────────────────────┐
│                       VPS (Docker Compose)                            │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │                    Rede Docker Interna                           │ │
│  │                                                                  │ │
│  │  ┌──────────────────────┐  ┌─────────────────────────────────┐  │ │
│  │  │     Caddy (Proxy)    │  │       apps/web (Next.js 15)      │  │ │
│  │  │  - TLS/HTTPS auto    │  │  - App Router + React 19         │  │ │
│  │  │  - Reverse proxy     │  │  - UI (Mapa, CNPJs, Export,      │  │ │
│  │  │    p/ Next.js        │  │    Campanhas)                    │  │ │
│  │  │  - Porta 80/443      │  │  - API Routes (/api/*)           │  │ │
│  │  └──────────┬───────────┘  │  - Auth.js v5 (JWT + argon2)     │  │ │
│  │             │ proxy         │  - Services + Repositories       │  │ │
│  │             └──────────────►│  - Porta 3000 (interna)          │  │ │
│  │                             └──────────────┬────────────────────┘  │ │
│  │                                            │                       │ │
│  │  ┌──────────────────────┐                 │ BullMQ (fila)          │ │
│  │  │  apps/workers (Node) │◄────────────────┘                       │ │
│  │  │  - Worker Exportação │                                          │ │
│  │  │    (consumer fila    │                                          │ │
│  │  │     cnpj-export)     │                                          │ │
│  │  │  - Worker E-mail     │                                          │ │
│  │  │    (consumer fila    │                                          │ │
│  │  │     email-campaign)  │                                          │ │
│  │  │  - Scripts (import,  │                                          │ │
│  │  │    geocode, backup)  │                                          │ │
│  │  └───────────┬──────────┘                                          │ │
│  │              │                                                      │ │
│  │  ┌───────────▼──────────┐  ┌──────────────────────┐               │ │
│  │  │  PostgreSQL 16       │  │    Redis 7            │               │ │
│  │  │  + PostGIS 3.4       │  │  - Filas BullMQ       │               │ │
│  │  │  - company_cnpj      │  │  - Rate limiting      │               │ │
│  │  │    (27 partições)    │  │  - Cache de sessão    │               │ │
│  │  │  - users             │  │  - Pub/sub (futuro)   │               │ │
│  │  │  - cities            │  │                       │               │ │
│  │  │  - email_*           │  │                       │               │ │
│  │  │  - analytics.*       │  │                       │               │ │
│  │  └──────────────────────┘  └──────────────────────┘               │ │
│  │                                                                     │ │
│  │  ┌──────────────────────┐                                           │ │
│  │  │  MinIO (dev) /       │                                           │ │
│  │  │  Cloudflare R2 (prod)│ ← CSV exports (.csv.gz)                  │ │
│  │  │  - bucket: radar-    │   Backups pg_dump (.sql.gz)              │ │
│  │  │    exports           │                                           │ │
│  │  │  - bucket: radar-    │                                           │ │
│  │  │    backups           │                                           │ │
│  │  └──────────────────────┘                                           │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘

Serviços externos:
  Google Maps JS API   → Frontend (restrita por HTTP referrer)
  Google Places API    → Backend  (restrita por IP)
  Google Geocoding API → Worker de geocodificação (batch)
  Resend               → Worker de e-mail (envio) + Webhooks → Web API
```

**Tecnologias por contêiner:**

| Contêiner | Tecnologia | Porta | Escala |
|---|---|---|---|
| Caddy | caddy:2 | 80, 443 (ext) | 1 instância (LB ext. no futuro) |
| apps/web | Next.js 15, Node.js 22 | 3000 (int) | Horizontal (stateless) |
| apps/workers | Node.js 22 + tsx | — | Horizontal (BullMQ concorrency) |
| PostgreSQL | postgis/postgis:16-3.4 | 5432 (int) | Vertical / Read replica |
| Redis | redis:7-alpine | 6379 (int) | Sentinel / Cluster |
| MinIO/R2 | minio/minio ou Cloudflare R2 | 9000 (int) | Gerenciado |

---

## Nível 3 — Diagrama de Componentes (apps/web)

*Audiência: Desenvolvedores do time.*

```
apps/web/src/
│
├── app/                                  ← Next.js App Router
│   ├── (app)/                            ← Layout protegido (autenticado)
│   │   ├── mapa/
│   │   │   └── _components/
│   │   │       ├── MapaClient.tsx        ← Orquestrador client-side
│   │   │       ├── MapView.tsx           ← Google Maps + marcadores
│   │   │       ├── FilterPanel.tsx       ← Painel de filtros lateral
│   │   │       └── PlaceAutocomplete.tsx ← Input de busca de local
│   │   ├── cnpjs/
│   │   │   └── _components/
│   │   │       ├── CnpjsClient.tsx       ← Orquestrador client-side
│   │   │       ├── CnpjTable.tsx         ← Tabela paginada cursor-based
│   │   │       ├── FilterBar.tsx         ← Filtros horizontais
│   │   │       └── StatsBar.tsx          ← Contagem com cap
│   │   ├── exportacoes/
│   │   │   └── _components/
│   │   │       ├── ExportacoesClient.tsx ← Lista de jobs com SSE
│   │   │       └── ExportJobCard.tsx     ← Card individual com progresso
│   │   └── campanhas/
│   │       └── _components/
│   │           └── CampanhasClient.tsx   ← CRUD de campanhas
│   │
│   └── api/                              ← Route Handlers (BFF fino)
│       ├── health/route.ts               ← Health check público
│       ├── cities/radius/route.ts        ← Cidades no raio (PostGIS)
│       ├── places/companies/route.ts     ← Google Places com cache
│       ├── cnpj/
│       │   ├── companies/route.ts        ← Busca paginada de CNPJs
│       │   └── export-jobs/
│       │       ├── route.ts              ← CRUD de export jobs
│       │       └── [id]/
│       │           ├── route.ts          ← Detalhe do job
│       │           ├── download/route.ts ← URL pré-assinada
│       │           └── stream/route.ts   ← SSE de progresso
│       ├── campaigns/
│       │   ├── route.ts                  ← Criar/listar campanhas
│       │   └── [id]/send/route.ts        ← Disparar campanha
│       ├── unsubscribe/route.ts          ← Descadastro (HMAC token)
│       └── webhooks/resend/route.ts      ← Eventos Resend (SVIX)
│
├── server/                               ← Lógica de servidor (Node.js puro)
│   ├── services/                         ← Casos de uso / lógica de negócio
│   │   ├── cnpj-search.service.ts        ← Busca + resolução geográfica
│   │   ├── export.service.ts             ← Criação/gestão de jobs + S3
│   │   ├── email-campaign.service.ts     ← Criação/disparo de campanhas
│   │   ├── places-search.service.ts      ← Cache de Places por grid
│   │   └── radius-search.service.ts      ← PostGIS ST_DWithin
│   │
│   ├── repositories/                     ← Acesso ao Prisma (único ponto)
│   │   ├── cnpj.repository.ts            ← CRUD + paginação company_cnpj
│   │   ├── city.repository.ts            ← Busca de cidades
│   │   ├── export-job.repository.ts      ← CRUD cnpj_export_jobs
│   │   ├── email-campaign.repository.ts  ← CRUD campanhas + destinatários
│   │   └── places-cache.repository.ts    ← Cache places_cache
│   │
│   ├── queue/
│   │   ├── export-queue.ts               ← Producer BullMQ (cnpj-export)
│   │   └── email-campaign-queue.ts       ← Producer BullMQ (email-campaign)
│   │
│   └── lib/
│       ├── redis-client.ts               ← Singleton IORedis
│       └── s3-client.ts                  ← Singleton S3Client (R2/MinIO)
│
├── components/
│   ├── filters/FilterChips.tsx           ← Chips de filtros removíveis
│   └── layout/
│       ├── Sidebar.tsx                   ← Navegação lateral
│       ├── Topbar.tsx                    ← Barra superior (injeção via ctx)
│       └── TopbarActionsProvider.tsx     ← Context de ações do Topbar
│
└── hooks/
    └── useCnpjFilters.ts                 ← Hook: URL ↔ filtros (Zod)
```

**Regra de camadas (invariante):**

```
Route Handler
    │ (valida com Zod; não toca Prisma)
    ▼
Service
    │ (lógica de negócio; não toca Prisma diretamente)
    ▼
Repository
    │ (único ponto de acesso ao Prisma)
    ▼
Prisma Client → PostgreSQL
```

---

## Nível 4 — Código: Fluxo de Exportação (ponta a ponta)

*Audiência: Desenvolvedores com necessidade de entender um fluxo específico.*

```
Frontend (ExportJobCard.tsx)
    │
    │ [1] POST /api/cnpj/export-jobs { filtros }
    ▼
export-jobs/route.ts (POST handler)
    │ auth() → session.user.id
    │ ZodError → 400
    │
    ├─[2]─► exportService.createExportJob(userId, rawFilters)
    │           │
    │           ├─ CnpjSearchFiltersSchema.parse(rawFilters)
    │           ├─ exportJobRepository.countActiveByUserId(userId)
    │           │     → ExportConcurrentLimitError → 429 se ≥ 5
    │           ├─ redis.incr(hourKey) + expire
    │           │     → ExportHourlyLimitError → 429 se > 10
    │           ├─ exportJobRepository.create({ usuario_id, filtros })
    │           │     → INSERT cnpj_export_jobs (status: 'queued')
    │           └─ exportQueue.add("export-cnpj", payload, { jobId: dbJob.id })
    │                 → RPUSH Redis queue
    │
    │ [3] Response 201 { id, status: "queued", criado_em }
    ▼
Frontend abre SSE:
    GET /api/cnpj/export-jobs/{id}/stream
    │
    │ [4] Polling interno a cada 1.5s:
    │     exportService.getJob(id, userId)
    │       → SELECT cnpj_export_jobs WHERE id = ?
    │     Emite evento SSE apenas se status/progresso mudou
    ▼
Worker (export-queue-consumer.ts) ← consome fila BullMQ
    │
    │ [5] processExportJob(job)
    │     ├─ UPDATE cnpj_export_jobs SET status = 'running'
    │     ├─ resolveMunicipioCodigos(filtros)
    │     │     → ST_DWithin em cities (PostGIS)
    │     │
    │     └─ exportToCsv(prisma, filters, storageKey, onProgress)
    │           ├─ Paginação cursor-based em company_cnpj
    │           │   (findMany com cursor, take, WHERE uf = ?)
    │           ├─ csv-stringify → PassThrough → gzip → S3 multipart
    │           ├─ onProgress(rows) → UPDATE progresso_pct
    │           └─ Retorna { storageKey, totalRows, sizeBytes }
    │
    │     └─ UPDATE cnpj_export_jobs SET
    │           status = 'completed',
    │           storage_key, tamanho_bytes, linhas,
    │           progresso_pct = 100, concluido_em
    │
    │ [6] SSE detecta status = 'completed'
    │     → getSignedUrl(s3, GetObjectCommand, { expiresIn: 4h })
    │     → Emite { status: "completed", downloadUrl, linhas }
    │
    │ [7] Frontend exibe botão de download
    │     Banker clica → browser faz GET na URL pré-assinada → CSV

Retry (3 tentativas, backoff 5s):
    Se job falhar → UPDATE status = 'failed', erro = err.message
    SSE emite { status: "failed", erro }
```

---

## PARTE II — VISÃO 4+1

A Visão 4+1 organiza a documentação em cinco perspectivas, cada uma atendendo necessidades distintas de stakeholders.

---

## Visão 1 — Lógica

*Descreve a estrutura estática do sistema: pacotes, módulos, classes.*

### Pacotes principais

```
@radar/shared (packages/shared)
  ├── CnpjSearchFiltersSchema (Zod)
  ├── CnpjSearchFilters (type)
  ├── ExportJobPayload (interface)
  ├── EmailCampaignJobPayload (interface)
  ├── EXPORT_QUEUE_NAME (const)
  └── EMAIL_CAMPAIGN_QUEUE_NAME (const)
  └── /server: generateUnsubscribeToken (Node crypto — não edge-safe)

@radar/db (packages/db)
  ├── PrismaClient (re-exportado)
  ├── FindByFiltersInput (type)
  └── Modelos Prisma: User, CompanyCnpj, City, CnpjExportJob,
      EmailCampaign, EmailRecipient, EmailBounce, EmailUnsubscribe, PlacesCache

apps/web/server/services
  ├── cnpj-search.service: searchCnpjs, countCnpjs
  ├── export.service: createExportJob, getJob, getUserJobs, getJobDownloadUrl
  ├── email-campaign.service: buildRecipientList, createCampaign, getCampaign, getUserCampaigns
  ├── places-search.service: searchPlaces
  └── radius-search.service: getRadiusCities
```

### Relacionamentos entre modelos de dados

```
User ──┬──< CnpjExportJob (1:N, usuario_id → users.id)
       └──< EmailCampaign (1:N, usuario_id → users.id)

EmailCampaign ──┬──< EmailRecipient (1:N, campaign_id → email_campaigns.id, CASCADE DELETE)
                └──< EmailUnsubscribe (1:N, campaign_id_origem → email_campaigns.id, SET NULL)

EmailBounce     ── entidade independente (email UNIQUE, sem FK)
EmailUnsubscribe── entidade independente (email UNIQUE, sem FK externa)

City ──< City (autoreferência: municipio_sede_id, distritos de um município)

PlacesCache     ── entidade independente (unique: grid_cell_key + keyword)
```

---

## Visão 2 — Processos

*Descreve os processos em execução, comunicação e concorrência.*

### Processos em execução (runtime)

```
┌─────────────────────────────────────────────────────────┐
│                  Sistema em produção                      │
│                                                          │
│  Processo 1: Next.js (radar_web)                        │
│  ├─ Node.js (single process, I/O async)                 │
│  ├─ Lida com: HTTP, SSE, Auth, validação Zod            │
│  ├─ Nunca bloqueia: toda I/O pesada vai para fila        │
│  └─ Healthcheck: GET /api/health                         │
│                                                          │
│  Processo 2: Worker Export (radar_worker_export)         │
│  ├─ Node.js standalone                                   │
│  ├─ BullMQ Worker: concurrency = 2                      │
│  │  (2 exports simultâneos por container)               │
│  ├─ I/O intensiva: PostgreSQL → S3                      │
│  └─ Graceful shutdown em SIGTERM                         │
│                                                          │
│  Processo 3: Worker E-mail (parte de apps/workers)      │
│  ├─ Node.js standalone                                   │
│  ├─ BullMQ Worker: concurrency = 1                      │
│  │  (1 campanha de cada vez — controle de rate)         │
│  ├─ Delay configurável entre envios (EMAIL_SEND_DELAY_MS)│
│  └─ Graceful shutdown em SIGTERM                         │
│                                                          │
│  Processo 4: Cron de Backup (scripts/backup-postgres.ts) │
│  └─ Executado às 03:00 UTC diariamente                  │
│                                                          │
│  Processo 5: PostgreSQL (radar_postgres)                 │
│  ├─ max_parallel_workers_per_gather = 4                  │
│  ├─ shared_buffers = 2GB                                 │
│  └─ PostGIS: índices GIST para buscas geoespaciais       │
│                                                          │
│  Processo 6: Redis (radar_redis)                         │
│  ├─ Filas BullMQ (listas Redis)                         │
│  ├─ Rate limiting (INCR + EXPIRE)                       │
│  └─ AOF persistência                                     │
└─────────────────────────────────────────────────────────┘
```

### Comunicação entre processos

| De | Para | Mecanismo |
|---|---|---|
| apps/web | PostgreSQL | Prisma TCP/IP (pool de conexões) |
| apps/web | Redis | IORedis TCP (producer BullMQ) |
| apps/workers | PostgreSQL | Prisma TCP/IP |
| apps/workers | Redis | IORedis TCP (consumer BullMQ) |
| apps/workers | R2/MinIO | S3 SDK HTTPS multipart upload |
| apps/workers | Resend | HTTPS REST API |
| Resend | apps/web | HTTPS Webhook (SVIX signed) |
| Caddy | apps/web | HTTP/1.1 proxy (rede Docker interna) |

---

## Visão 3 — Implementação

*Descreve a organização dos módulos no repositório e como são construídos.*

### Estrutura do monorepo

```
radar-prospeccao/
├── apps/
│   ├── web/
│   │   ├── src/                  ← Todo código TypeScript da UI/API
│   │   ├── Dockerfile            ← Multi-stage: build Next.js → imagem mínima
│   │   ├── package.json          ← deps Next.js, Auth.js, etc.
│   │   ├── next.config.ts        ← serverExternalPackages: ['@node-rs/argon2']
│   │   ├── tailwind.config.ts    ← Design tokens Tailwind
│   │   └── vitest.config.ts      ← Config de testes
│   │
│   └── workers/
│       ├── src/
│       │   ├── index.ts          ← Entry point: inicia todos os workers
│       │   ├── queues/           ← Consumers BullMQ
│       │   ├── lib/              ← CSV exporter, S3 client
│       │   └── scripts/          ← Scripts standalone (import, geocode, backup)
│       ├── Dockerfile            ← Multi-stage: tsx → imagem mínima
│       └── Dockerfile.prod       ← Build otimizado para produção
│
├── packages/
│   ├── db/
│   │   ├── prisma/
│   │   │   ├── schema.prisma     ← Fonte da verdade dos modelos
│   │   │   └── migrations/       ← SQL manual + migrations Prisma
│   │   ├── seeds/                ← Script de seed de usuário admin
│   │   └── src/index.ts          ← Re-exporta PrismaClient + types
│   │
│   └── shared/
│       ├── src/index.ts          ← Schemas Zod + types + constantes (browser-safe)
│       └── src/server.ts         ← Utilitários Node.js (crypto, não edge-safe)
│
├── docker-compose.yml            ← Dev: postgres, redis, minio, worker-export
├── docker-compose.prod.yml       ← Prod: todos os serviços + caddy + backup cron
├── Caddyfile                     ← Config do reverse proxy (TLS automático)
├── .github/workflows/            ← CI/CD: test → build → push GHCR → deploy SSH
├── docs/                         ← Esta documentação
└── radar-vault/                  ← Vault Obsidian com decisões e contexto de produto
```

### Pipeline de build

```
[Source] GitHub repo
    │
    │ [CI — PR] lint + typecheck + vitest
    ▼
[CI — merge main] 
    ├─ docker build apps/web → ghcr.io/org/radar-web:sha
    └─ docker build apps/workers → ghcr.io/org/radar-workers:sha
    │
    │ docker push → GHCR
    ▼
[Deploy — SSH na VPS]
    docker compose pull
    docker compose up -d --no-deps web worker-export
    (migrator: prisma migrate deploy)
```

---

## Visão 4 — Implantação

*Descreve o mapeamento de processos para hardware/infraestrutura.*

### Topologia de produção (MVP — VPS única)

```
Internet
    │ HTTPS :443
    ▼
┌─────────────────────────────────────────────────────────┐
│  VPS (Ubuntu 24.04 LTS)                                  │
│  4–8 vCPU / 16–32 GB RAM / 200 GB NVMe SSD              │
│  Provider: DigitalOcean CPU-Optimized                    │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Docker Compose (rede bridge radar_network)       │   │
│  │                                                   │   │
│  │  radar_caddy      ←→  80, 443 (publicadas)       │   │
│  │  radar_web        ←→  3000 (interna)             │   │
│  │  radar_worker_exp ←→  (sem porta exposta)        │   │
│  │  radar_postgres   ←→  5432 (interna apenas)      │   │
│  │  radar_redis      ←→  6379 (interna apenas)      │   │
│  │  radar_minio*     ←→  9000, 9001 (interna)       │   │
│  │  radar_backup_cron←→  cron (sem porta)           │   │
│  │                                                   │   │
│  │  * Em produção: Cloudflare R2 substitui MinIO    │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  Firewall UFW:                                           │
│  ├─ 22/tcp  SSH (restrito por IP de origem)             │
│  ├─ 80/tcp  HTTP → Caddy (redireciona para HTTPS)       │
│  └─ 443/tcp HTTPS → Caddy → Next.js                     │
│                                                          │
│  Volumes Docker:                                         │
│  ├─ postgres_data: /var/lib/postgresql/data (~120GB)    │
│  ├─ redis_data: /data (AOF persistence)                  │
│  └─ caddy_data: certificados TLS Let's Encrypt          │
└─────────────────────────────────────────────────────────┘
           │                              │
           ▼                              ▼
  Cloudflare R2                     DNS Provider
  (radar-exports,                   (A record: domínio → IP VPS)
   radar-backups)
```

### Topologia futura (escala horizontal)

```
Internet → CDN/Load Balancer
    │
    ├─ N × radar_web (Read replicas Postgres)
    ├─ M × radar_workers (pool de workers BullMQ)
    │
    ├─ PostgreSQL Gerenciado (ex: DO Managed Postgres)
    │   └─ Read replica para queries analíticas
    ├─ Redis Gerenciado (ex: DO Managed Redis / Upstash)
    └─ R2 (permanece — sem alteração de código)
```

---

## Visão 5 — Casos de Uso (Cenários)

*Descreve os cenários que exercitam as quatro visões anteriores.*

### Cenário 1: Banker Busca Empresas em Campo

1. **Lógica:** `useCnpjFilters` lê URL e alimenta `FilterPanel`; `MapView` recebe cidades do raio via `radius-search.service`.
2. **Processos:** `apps/web` processa GET /api/cities/radius → PostGIS `ST_DWithin` em `cities`.
3. **Implementação:** `CityRepository.getWithinRadius()` → Prisma `$queryRaw`.
4. **Implantação:** Query executada no container `radar_postgres` via rede interna.

### Cenário 2: Banker Exporta 500k CNPJs

1. **Lógica:** `export.service.createExportJob()` valida filtros, persiste job, enfileira.
2. **Processos:** `radar_web` enfileira job BullMQ → `radar_worker_export` consome → streaming para R2.
3. **Implementação:** `exportToCsv()` usa cursor-based `findMany`, `csv-stringify`, `zlib.createGzip()`, S3 multipart upload.
4. **Implantação:** Worker consome do Redis interno; upload para R2 externo.

### Cenário 3: Banker Envia Campanha de E-mail

1. **Lógica:** `buildRecipientList()` exclui bounces/unsubscribes; `email-campaign-consumer` renderiza template por empresa.
2. **Processos:** `radar_web` enfileira job → `radar_worker_export` (worker de e-mail) consome; Resend entrega; webhooks atualizam status.
3. **Implementação:** Batch-fetch por UF (partition pruning), `renderTemplate()`, Resend SDK, `emailCampaignRepo.updateRecipientStatus()`.
4. **Implantação:** Worker → Resend API (HTTPS externo); Resend → `/api/webhooks/resend` (HTTPS externo com SVIX signature).

### Cenário 4: Backup Diário do Banco

1. **Lógica:** `backup-postgres.ts` executa `pg_dump -Fc`.
2. **Processos:** Cron container às 03:00 UTC → `pg_dump` pipe → gzip → S3 upload.
3. **Implementação:** Script standalone em `apps/workers/src/scripts/backup-postgres.ts`.
4. **Implantação:** Cron container conecta ao `radar_postgres` via rede Docker; upload para bucket `radar-backups` no R2.

---

*Fim da documentação C4 + 4+1.*
