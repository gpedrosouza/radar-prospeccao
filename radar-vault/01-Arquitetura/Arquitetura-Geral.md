---
tags: [arquitetura, core]
---

# Arquitetura Geral

## Princípio estrutural

Três processos que **nunca compartilham runtime**, mesmo rodando na mesma VPS no MVP:

```
┌─────────────────────────────────────────────────────────────┐
│                      VPS (Docker Compose)                    │
│                                                                │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐    │
│  │   web         │   │  worker-export│   │ worker-enrich │    │
│  │  (Next.js)    │   │  (Node)       │   │  (Node)       │    │
│  │  UI + API fina│   │  Fila BullMQ  │   │  Fila BullMQ  │    │
│  └──────┬───────┘   └──────┬───────┘   └──────┬───────┘    │
│         │                   │                   │             │
│         └───────────┬───────┴───────────────────┘             │
│                      │                                         │
│         ┌────────────┴────────────┐                          │
│         │                          │                          │
│    ┌────▼─────┐              ┌────▼─────┐                    │
│    │ Postgres  │              │  Redis    │                    │
│    │ +PostGIS  │              │  (fila)   │                    │
│    └──────────┘              └──────────┘                    │
└─────────────────────────────────────────────────────────────┘
                      │
              ┌───────┴────────┐
              │  Cloudflare R2  │  ← arquivos de export (.csv.gz)
              └────────────────┘
```

## Por que essa separação (não é over-engineering)

A v1 misturava tudo num processo Next.js. O problema real observado: um job de exportação de milhões de linhas competia por CPU/memória com requisições da UI no mesmo processo. Com workers em containers separados desde o dia 1:
- Um job pesado nunca trava a UI
- Cada worker escala/reinicia independente
- Migrar de "uma VPS" para "serviços gerenciados separados" no futuro é trocar `docker-compose.yml` por configuração de deploy — **não é reescrever código**

## Monorepo

```
radar/
├── apps/
│   ├── web/              ← Next.js 15 (App Router). UI + rotas /api/* finas.
│   └── workers/          ← Node standalone. Nunca importa nada de apps/web.
├── packages/
│   ├── db/               ← schema Prisma + client gerado + seeds
│   └── shared/            ← tipos TS, validadores Zod, constantes compartilhadas
├── docker-compose.yml
├── docker-compose.prod.yml
└── CLAUDE.md              ← contexto raiz para o Claude Code (ver Fase 0)
```

Regra inegociável: **`apps/workers` nunca importa de `apps/web`**, e vice-versa. Tudo que os dois precisam (tipos, client do Prisma, validação de filtros) vive em `packages/`.

## Camadas dentro de `apps/web`

```
apps/web/src/
├── app/
│   ├── (auth)/             ← login
│   ├── (app)/
│   │   ├── mapa/
│   │   ├── cnpjs/
│   │   ├── exportacoes/
│   │   └── campanhas/
│   └── api/
│       ├── cities/radius/
│       ├── places/companies/
│       ├── cnpj/companies/
│       ├── cnpj/export-jobs/
│       └── auth/
├── server/
│   ├── services/           ← lógica de negócio pura, testável, sem Prisma direto
│   └── repositories/        ← único lugar que toca Prisma
└── components/
```

**Regra de camadas:** rota de API → service → repository → Prisma. Uma rota de API nunca importa Prisma diretamente. Isso é o que torna a lógica testável sem banco real.

## Fluxo de uma exportação (ponta a ponta)

1. UI chama `POST /api/cnpj/export-jobs` com os filtros atuais
2. API valida (Zod) e enfileira job no BullMQ (Redis) — responde imediatamente com `jobId`
3. UI abre conexão SSE em `/api/cnpj/export-jobs/:id/stream`
4. `worker-export` (processo separado) consome a fila, pagina a tabela `CompanyCnpj` por cursor, escreve `.csv.gz` direto no Cloudflare R2 via stream
5. Worker atualiza progresso no Postgres a cada N linhas
6. SSE empurra o progresso pro frontend em tempo real
7. Ao concluir, worker grava a URL pré-assinada do R2; UI mostra botão de download

Nenhum CSV passa pela memória do processo `web`. Nenhum dado pesado é lido fora do worker.

## Decisões-chave (ver ADRs para detalhes)
- [[05-Decisoes-ADR/ADR-001-Monorepo-Separado]]
- [[05-Decisoes-ADR/ADR-002-Particionamento-Postgres]]
- [[05-Decisoes-ADR/ADR-003-BullMQ-vs-Tabela-Jobs]]
- [[05-Decisoes-ADR/ADR-004-Storage-Externo-R2]]

## Links relacionados
- [[01-Arquitetura/Modelo-de-Dados]]
- [[01-Arquitetura/Stack-Tecnica]]
- [[01-Arquitetura/Infraestrutura-e-Deploy]]
