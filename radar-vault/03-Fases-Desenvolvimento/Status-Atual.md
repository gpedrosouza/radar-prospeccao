---
tags: [status, hub]
---

# ⭐ Status Atual — Atualize Isto Toda Sessão

> **Este é o arquivo mais importante do vault.** Antes de abrir o Claude Code, leia isto. Depois de cada sessão, atualize isto. Se você só vai manter um arquivo sincronizado com a realidade, é este.

## Fase atual
**Fase 0 — Fundação** (não iniciada)

## Última sessão de trabalho
*(preencher após a primeira sessão real)*

- Data:
- O que foi feito:
- O que ficou pendente:
- Decisões tomadas nesta sessão:
- Próximo passo concreto:

## Checklist de progresso macro

- [x] **Fase 0 — Fundação**: monorepo, Docker Compose, banco particionado, auth básica
- [x] **Fase 1 — Dados**: importação Receita, índices, geocodificação em lote, schema analytics
- [x] **Fase 2 — Core**: services/repositories, fila BullMQ, storage R2, rotas de API
- [x] **Fase 3 — UI**: mapa, filtros, tabela, exportação com SSE
- [x] **Fase 4 — Workers e Escala**: containers separados, monitoramento, backups testados
- [ ] **Fase 5 — E-mail**: domínio, DNS, Resend, campanhas (após validação jurídica)

## Decisões já fechadas (não rediscutir sem motivo novo)

1. Recomeço do zero, repositório novo — não migrar código da v1
2. Claude Code como ferramenta principal de desenvolvimento
3. VPS única + Docker Compose no MVP (não serviços gerenciados separados)
4. Monorepo com `apps/web` e `apps/workers` totalmente isolados
5. PostgreSQL particionado por UF desde a primeira migration
6. BullMQ + Redis para filas (não tabela com polling)
7. Cloudflare R2 para storage de exports
8. Domínio próprio com SPF/DKIM/DMARC; envio via Resend; resposta no e-mail corporativo do banker
9. **Identidade visual definitiva: GR Assessoria Financeira** (navy `#003650` + teal
   `#00B3A9`, Montserrat, light theme). Substitui integralmente a primeira versão em dark
   theme. Blueprint congelado em `docs/design/radar-gr-ui.html` no repositório de código —
   ver [[01-Arquitetura/Stack-Tecnica]] para a paleta completa em variáveis CSS

## Bloqueios / pendências externas (não dependem de código)

- [ ] Validação jurídica/LGPD do uso do e-mail da Receita para campanhas (necessário antes da Fase 5)
- [ ] Decisão de qual VPS/provedor efetivamente contratar (recomendação: DigitalOcean, ver [[01-Arquitetura/Infraestrutura-e-Deploy]])
- [ ] Registro do domínio `.com.br` escolhido

## Como atualizar este arquivo

Ao final de cada sessão com o Claude Code, peça a ele:
> "Resuma o que fizemos nesta sessão em 5 linhas, no formato do arquivo Status-Atual.md do vault, para eu colar lá."

Cole o resultado na seção "Última sessão de trabalho" acima e mova o checklist conforme necessário.

## Links relacionados
- [[00-INDEX]]
- [[03-Fases-Desenvolvimento/Fase-0-Fundacao]]
