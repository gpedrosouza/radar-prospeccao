# Prompt 16 — Layout Shell, Sidebar e Navegação

> Fase: 3 — UI
> Pré-requisito: Fase 2 completa

---

## Prompt

```
Leia o CLAUDE.md na raiz do projeto. Leia também docs/design/radar-gr-ui.html — este é o
blueprint visual DEFINITIVO do produto, com a identidade visual da GR Assessoria Financeira
(cliente/operador do sistema) já aplicada. Extraia as variáveis CSS definidas no :root do
arquivo (paleta navy + teal, light theme) e use-as como fonte de verdade — não invente cores
novas, replique exatamente o que está nesse arquivo.

Vamos construir a UI seguindo esse design: light theme profissional, sidebar navy fixa à
esquerda com navegação entre Mapa / CNPJs / Exportações / Campanhas / Analytics, item ativo
em teal, topbar branca com título da página e ações contextuais. Tipografia: Montserrat
(conforme manual de marca da GR), com Inter como fallback.

Crie:

1. apps/web/src/app/(app)/layout.tsx — layout compartilhado com sidebar fixa (232px) e área
   de conteúdo principal, usando Server Component onde possível

2. Componente Sidebar (apps/web/src/components/layout/Sidebar.tsx):
   - Replique a estrutura do <nav class="sidebar"> do blueprint: logo GR no topo (o SVG do
     monograma está inline no HTML, reaproveite o mesmo path), itens de navegação com os
     mesmos ícones e rótulos, item ativo em fundo teal, seção de configurações separada por
     divisor, rodapé com avatar/nome do usuário autenticado (use a sessão do NextAuth) e
     botão de logout
   - Itens: 🗺 Mapa, 🏢 CNPJs, 📤 Exportações, ✉ Campanhas, 📊 Analytics

3. Componente Topbar (apps/web/src/components/layout/Topbar.tsx):
   - Replique a .topbar do blueprint: fundo branco, título em navy bold, slot de ações à
     direita

4. Configure Tailwind com as variáveis do blueprint como tokens nomeados (gr-teal, gr-navy,
   bg, surface, border, success, warning, danger, etc. — use os mesmos nomes de variável do
   HTML para facilitar a correspondência) — não cole hex direto nos componentes, use os tokens

5. Crie as páginas vazias (só com o layout, sem conteúdo ainda) em:
   - app/(app)/mapa/page.tsx
   - app/(app)/cnpjs/page.tsx
   - app/(app)/exportacoes/page.tsx
   - app/(app)/campanhas/page.tsx

Garanta que a navegação entre as páginas funciona e o item ativo na sidebar reflete a rota atual.
Ao final, compare visualmente o resultado com o blueprint HTML (abra os dois lado a lado) e
ajuste qualquer divergência de espaçamento, cor ou tipografia antes de prosseguir.
```

## Após rodar este prompt
- Navegue manualmente entre as páginas e confirme visual e funcionalmente
- Avance para `17-tela-mapa.md`
