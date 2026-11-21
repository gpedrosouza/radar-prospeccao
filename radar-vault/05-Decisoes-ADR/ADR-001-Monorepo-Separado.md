---
tags: [adr]
---

# ADR-001: Monorepo com apps/web e apps/workers totalmente separados

**Status:** aceito
**Data:** 2026-06

## Contexto
Na v1 (repositório `radar-prospeccao-geografica`), tudo rodava num único processo Next.js: UI, rotas de API, scripts de importação e até lógica de exportação assíncrona via `CNPJ_EXPORT_AUTO_RUN`. Isso causava jobs pesados competindo por CPU/memória com requisições da UI no mesmo processo.

## Decisão
Recomeçar com um monorepo onde `apps/web` (Next.js) e `apps/workers` (Node standalone) nunca importam um do outro. Tudo que precisam compartilhar (tipos, client Prisma, validação) vive em `packages/`.

## Alternativas consideradas
1. **Manter tudo num processo, só configurar melhor o auto-run** — rejeitado: não resolve o problema de fundo de contenção de recursos.
2. **Microsserviços de verdade (deploy independente, repositórios separados)** — rejeitado para o MVP: complexidade operacional desnecessária nesse estágio: o ganho de isolamento de processo já é suficiente sem pagar o custo de microsserviços reais.

## Consequências
- Web e workers podem escalar/reiniciar independentemente, mesmo rodando na mesma VPS via Docker Compose
- Migrar workers para máquina própria no futuro é mudança de infraestrutura, não de código
- Custo: precisa manter disciplina de não criar imports cruzados (`apps/workers` importando algo de `apps/web`) — vale configurar lint/CI para detectar isso

## Links relacionados
- [[01-Arquitetura/Arquitetura-Geral]]
