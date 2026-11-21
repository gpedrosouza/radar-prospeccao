# Radar de Prospecção

> **EN —** Geographic B2B prospecting platform built for a Brazilian financial advisory firm (GR Gestão Financeira). It searches the full Brazilian company registry (~66 million CNPJs from the Federal Revenue open data) by radius on a map, cross-matches it with Google Places, exports large lists through background jobs, and runs compliant e-mail campaigns and meeting scheduling. Built end to end with Claude Code through a documented, prompt-driven workflow: 31 implementation prompts and 5 ADRs live in [`radar-vault/`](radar-vault/).

Plataforma de prospecção geográfica de empresas, feita para os personal bankers da **GR Gestão Financeira**. Ela responde perguntas como *"quais empresas do setor X existem num raio de 50 km daqui, quais estão ativas e como falo com elas?"*.

A ferramenta cruza a base completa de **~66 milhões de CNPJs** dos Dados Abertos da Receita Federal com o Google Places e com uma busca por raio no PostGIS. Também cobre a exportação em lote, as campanhas de e-mail com descadastro e bounce tratados, e o agendamento de reuniões no Google Calendar.

## Funcionalidades

- **Mapa e busca por raio:** origem por endereço, empresa ou clique no mapa. Localiza as cidades no raio e as empresas com coordenadas (PostGIS, `GEOGRAPHY` + GIST).
- **Base CNPJ filtrável:** UF, cidade, CNAE e setor, situação, porte, matriz/filial, natureza jurídica, Simples/MEI e data de abertura. A paginação usa *partition pruning*.
- **Cruzamento com Google Places:** encontra o CNPJ oficial por trás de cada empresa do mapa, com cache por grid para controlar custo.
- **Exportações assíncronas:** fila BullMQ, CSV gerado em stream e enviado ao Cloudflare R2, com o progresso ao vivo na tela via SSE.
- **Geocodificação em cascata pelo custo:** CNEFE/IBGE local (grátis) → centroide de CEP via BrasilAPI (grátis) → Google Geocoding com teto por job. Geocodificar tudo no Google custaria dezenas de milhares de dólares.
- **Campanhas de e-mail:** templates, importação de listas, envio via Resend, webhooks de bounce e descadastro com token assinado, e aviso LGPD fixo na tela de disparo.
- **Landing e agendamento (`/agende`):** horários livres lidos do Google Calendar, com antecedência mínima e revalidação contra conflito.
- **Analytics:** views materializadas para as agregações e eventos de funil.

## Arquitetura

```
apps/web        Next.js 15 (App Router) · UI, rotas de API, Auth.js
apps/workers    Node standalone · consumidores BullMQ, importadores, backups
packages/db     Prisma · schema, migrations SQL manuais, seeds
packages/shared tipos e validadores Zod compartilhados
```

Regras que o ESLint e a revisão garantem:

1. `apps/web` e `apps/workers` nunca importam um do outro.
2. Rota de API → service → repository → Prisma. Nenhuma rota toca o banco direto.
3. `company_cnpj` é **particionada por UF** (27 partições), e toda listagem filtra `uf`.
4. Todo job longo vai para a fila e nunca roda síncrono numa requisição.
5. Arquivos vão para storage S3-compatível (MinIO local, R2 em produção), nunca para o disco do container.

As decisões e o porquê de cada uma estão nos ADRs: [monorepo](radar-vault/05-Decisoes-ADR/ADR-001-Monorepo-Separado.md), [particionamento](radar-vault/05-Decisoes-ADR/ADR-002-Particionamento-Postgres.md), [BullMQ vs. tabela de jobs](radar-vault/05-Decisoes-ADR/ADR-003-BullMQ-vs-Tabela-Jobs.md) e [storage externo](radar-vault/05-Decisoes-ADR/ADR-004-Storage-Externo-R2.md).

## Stack

TypeScript strict · Next.js 15 · React 19 · Auth.js v5 (argon2) · Prisma · PostgreSQL 16 + PostGIS 3.4 · Redis 7 + BullMQ · Cloudflare R2 · Resend · Google Maps/Places/Calendar · Vitest · Docker Compose + Caddy · GitHub Actions

## Desenvolvimento com IA

O projeto foi construído com o **Claude Code** como ferramenta principal, num fluxo documentado:

- [`radar-vault/04-Prompts-ClaudeCode/`](radar-vault/04-Prompts-ClaudeCode/) guarda os **31 prompts de implementação**, em ordem, do setup do monorepo ao analytics de funil. Cada prompt traz o contexto, as restrições e o critério de pronto.
- O [`CLAUDE.md`](CLAUDE.md) define as regras inegociáveis, os comandos de verificação e as armadilhas conhecidas. Assim cada sessão começa com o contexto certo, sem depender do histórico da conversa.
- O vault no Obsidian (`radar-vault/`) registra as fases, os ADRs e o glossário do domínio.

## Rodando localmente

```bash
docker compose up -d                              # Postgres/PostGIS + Redis + MinIO
npm install
npm run db:deploy   --workspace=packages/db
npm run db:generate --workspace=packages/db
npm run seed        --workspace=packages/db
npm run dev --workspace=apps/web                  # http://localhost:3000
npm run dev --workspace=apps/workers
```

As variáveis estão documentadas em `.env.example`, `apps/web/.env.local.example` e `packages/db/.env.example`. A carga da Receita Federal (`import:*` em `apps/workers`) exige baixar os ZIPs públicos e algumas dezenas de GB de disco.

```bash
npm run lint
npm test --workspace=apps/web
```

## Sobre

Desenvolvido por **Guilherme Oliveira** ([github.com/gpedrosouza](https://github.com/gpedrosouza)) para a GR Gestão Financeira. Este repositório é a versão pública da v2. O histórico de desenvolvimento, a infraestrutura de produção e as bases de leads ficam no repositório privado.
