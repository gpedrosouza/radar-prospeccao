---
tags: [fase, core, backend]
status: nao-iniciada
---

# Fase 2 — Core (Backend e Fila)

**Objetivo:** ter a lógica de negócio, fila de jobs e storage funcionando — antes de qualquer tela bonita. Esta fase é o "motor" que a Fase 3 (UI) vai consumir.

## Entregáveis

1. Camada `server/services/` e `server/repositories/` em `apps/web` (rotas de API nunca tocam Prisma direto)
2. Redis + BullMQ configurados; fila de exportação e fila de enriquecimento
3. `apps/workers` consumindo as filas (worker-export e worker-enrichment como processos distintos)
4. Integração com Cloudflare R2 (upload via stream, URL pré-assinada para download)
5. Endpoint SSE para progresso de jobs (`/api/cnpj/export-jobs/:id/stream`)
6. Rotas de API: `/api/cities/radius`, `/api/places/companies` (com cache), `/api/cnpj/companies`, `/api/cnpj/export-jobs`
7. Validação de filtros com Zod compartilhada entre web e workers (`packages/shared`)

## Critério de saída

- [ ] Criar um job de exportação via API enfileira no BullMQ e responde imediatamente
- [ ] Worker processa o job, gera `.csv.gz`, envia para R2, atualiza status
- [ ] SSE entrega progresso em tempo real no terminal/teste (antes mesmo de ter UI)
- [ ] Cache de Places por grid territorial funcionando (TTL configurável)
- [ ] Testes Vitest cobrindo os services principais (sem precisar de banco real — usar mocks de repository)

## Prompts relacionados (em ordem)
1. `04-Prompts-ClaudeCode/10-camada-services-repositories.md`
2. `04-Prompts-ClaudeCode/11-bullmq-redis-setup.md`
3. `04-Prompts-ClaudeCode/12-worker-export-r2.md`
4. `04-Prompts-ClaudeCode/13-sse-progresso.md`
5. `04-Prompts-ClaudeCode/14-cache-places-grid.md`
6. `04-Prompts-ClaudeCode/15-rotas-api-cnpj-cities.md`

## Links relacionados
- [[01-Arquitetura/Arquitetura-Geral]]
- [[03-Fases-Desenvolvimento/Fase-1-Dados]]
