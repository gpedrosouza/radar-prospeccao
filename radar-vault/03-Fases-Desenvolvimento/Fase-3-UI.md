---
tags: [fase, ui, frontend]
status: nao-iniciada
---

# Fase 3 — UI/UX

**Objetivo:** construir as telas consumindo o backend já funcional da Fase 2. Seguir o design já validado (ver artifact HTML compartilhado na conversa anterior — 4 telas: Mapa, CNPJs, Exportações, Campanhas).

## Entregáveis

1. Tela de Mapa: origem, raio, filtros, pins de CNPJs geocodificados, hover card
2. Tela de CNPJs: stats bar, filtro bar, tabela paginada, paginação
3. Tela de Exportações: lista de jobs com progresso em tempo real (consumindo SSE da Fase 2)
4. Filtros refletidos na URL (`useSearchParams`/`router.push` com shallow routing)
5. Chips de filtro ativo removíveis individualmente
6. Componentização seguindo Tailwind, mobile-aware (breakpoints testados)

## Critério de saída

- [ ] Fluxo completo manual: buscar origem → ajustar raio → filtrar → ver resultado → exportar → acompanhar progresso → baixar
- [ ] Filtros sobrevivem a refresh de página (estão na URL)
- [ ] Nenhuma tela trava ou demora mais que ~2s para responder com a base completa carregada
- [ ] Responsivo até a largura de um notebook pequeno (não precisa ser mobile nativo no MVP, mas não pode quebrar)

## Prompts relacionados (em ordem)
1. `04-Prompts-ClaudeCode/16-layout-shell-sidebar.md`
2. `04-Prompts-ClaudeCode/17-tela-mapa.md`
3. `04-Prompts-ClaudeCode/18-tela-cnpjs-tabela.md`
4. `04-Prompts-ClaudeCode/19-tela-exportacoes-sse.md`
5. `04-Prompts-ClaudeCode/20-filtros-url-state.md`

## Referência visual

O design foi validado como protótipo HTML estático com a identidade visual da **GR Assessoria
Financeira** (cliente/operador do sistema) aplicada — paleta navy + teal, tipografia
Montserrat, light theme. Este arquivo é o **blueprint definitivo**, substituindo qualquer
versão anterior em dark theme.

**Localização no repositório de código:** `docs/design/radar-gr-ui.html`

Ao escrever qualquer prompt desta fase para o Claude Code, inclua a instrução explícita:
> "Use o arquivo docs/design/radar-gr-ui.html como referência visual definitiva — replique
> exatamente a paleta de cores (variáveis CSS no topo do arquivo), tipografia (Montserrat),
> espaçamento e estrutura de componentes (sidebar, topbar, cards, badges de situação
> cadastral) das 4 telas nele contidas."

A paleta completa em variáveis CSS está documentada em [[01-Arquitetura/Stack-Tecnica]] para
consulta rápida sem precisar abrir o HTML.

## Links relacionados
- [[00-Visao/Personas-e-Jornada]]
- [[03-Fases-Desenvolvimento/Fase-2-Core]]
