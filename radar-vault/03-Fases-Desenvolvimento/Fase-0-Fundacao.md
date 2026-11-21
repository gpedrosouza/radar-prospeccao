---
tags: [fase, fundacao]
status: nao-iniciada
---

# Fase 0 — Fundação

**Objetivo:** ter o esqueleto do projeto rodando localmente — monorepo, banco particionado, Docker Compose, autenticação básica — antes de qualquer feature de produto.

## Entregáveis

1. Monorepo criado (`apps/web`, `apps/workers`, `packages/db`, `packages/shared`)
2. `docker-compose.yml` com Postgres+PostGIS, Redis, web, placeholders de workers
3. Schema Prisma inicial com `CompanyCnpj` **já particionada por UF** e tabelas de suporte (`User`, `CnpjExportJob`)
4. Migration aplicada localmente com sucesso
5. Autenticação funcionando (login simples, sessão protegendo `/api/*`)
6. `CLAUDE.md` na raiz do repositório com contexto do projeto para o Claude Code
7. CI básico no GitHub Actions (lint + typecheck + testes vazios passando)

## Critério de saída (quando a Fase 0 está "pronta")

- [ ] `docker compose up` sobe tudo sem erro
- [ ] `npm run db:migrate` aplica a migration com as 27 partições de UF
- [ ] Login funciona e bloqueia rota de API sem sessão
- [ ] CI verde no primeiro PR

## Prompts relacionados (em ordem)
1. `04-Prompts-ClaudeCode/01-setup-monorepo.md`
2. `04-Prompts-ClaudeCode/02-docker-compose-postgres.md`
3. `04-Prompts-ClaudeCode/03-schema-prisma-particionado.md`
4. `04-Prompts-ClaudeCode/04-auth-basica.md`
5. `04-Prompts-ClaudeCode/05-claude-md-raiz.md`

## Links relacionados
- [[01-Arquitetura/Arquitetura-Geral]]
- [[01-Arquitetura/Modelo-de-Dados]]
- [[01-Arquitetura/Infraestrutura-e-Deploy]]
