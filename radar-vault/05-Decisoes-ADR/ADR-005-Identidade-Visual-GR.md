---
tags: [adr]
---

# ADR-005: Identidade visual da GR Assessoria Financeira aplicada à UI do Radar

**Status:** aceito
**Data:** 2026-06

## Contexto
O Radar de Prospecção Geográfica é a ferramenta interna desenvolvida para a GR Assessoria
Financeira (escritório de Alexander Ciarlo) prospectar clientes pessoa jurídica. A primeira
versão do design (dark theme, paleta azul genérica `#2980FE`) foi construída antes de existir
um manual de marca formal da GR. Esse manual foi posteriormente compartilhado, especificando:
paleta navy (`#003650`) + teal (`#00B3A9`), tipografia Montserrat, e um monograma "GR" com
seta integrada simbolizando crescimento.

## Decisão
Substituir integralmente a identidade visual do Radar pela identidade da GR Assessoria
Financeira: light theme profissional, sidebar navy com item ativo em teal, Montserrat como
tipografia principal, e o monograma GR na sidebar. O resultado foi congelado como protótipo
HTML estático (`docs/design/radar-gr-ui.html`) e se torna o blueprint visual definitivo para
toda a Fase 3 (UI) e Fase 5 (telas de campanha de e-mail).

## Alternativas consideradas
1. **Manter o dark theme genérico e aplicar só as cores GR por cima** — rejeitado: dark theme
   não está no manual de marca da GR e os mockups de aplicação (cartão de visita, papelaria)
   no manual são todos sobre fundo claro/navy solto, não dark mode. Manter dark theme criaria
   uma ferramenta com identidade visual desconectada da marca que ela representa.
2. **Pedir um novo manual de marca específico para o produto digital** — rejeitado por ora:
   custo e tempo desnecessários quando a marca-mãe já fornece paleta, tipografia e logotipo
   suficientes para uma aplicação interna B2B.

## Consequências
- Todo prompt da Fase 3 e Fase 5 (UI) precisa referenciar `docs/design/radar-gr-ui.html`
  como fonte de verdade visual, não descrever cores soltas no texto do prompt — isso evita
  divergência se a paleta precisar de ajuste fino no futuro (edita-se um arquivo, não N prompts)
- A cópia de exemplo nos templates de e-mail (Fase 5) já assume a voz da GR ("Sou Alexander
  Ciarlo, da GR Assessoria Financeira...") — ao generalizar para outros usuários/assessores
  da GR no futuro, essa variável precisa ser parametrizada, não hardcoded
- Se a GR atualizar o manual de marca, o blueprint HTML precisa ser atualizado primeiro, e só
  então as telas já implementadas devem ser ajustadas para acompanhar

## Links relacionados
- [[01-Arquitetura/Stack-Tecnica]]
- [[03-Fases-Desenvolvimento/Fase-3-UI]]
- [[03-Fases-Desenvolvimento/Status-Atual]]
