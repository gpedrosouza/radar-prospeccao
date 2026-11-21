# Prompt 17 — Tela do Mapa

> Fase: 3 — UI
> Pré-requisito: `16-layout-shell-sidebar.md` concluído

---

## Prompt

```
Leia o CLAUDE.md na raiz do projeto. Consulte também docs/design/radar-gr-ui.html (tela "01
Mapa") para a estrutura exata do painel de filtros e da área de mapa — replique espaçamento,
cores (variáveis CSS do arquivo) e hierarquia visual.

Vamos construir a tela de Mapa (app/(app)/mapa/page.tsx), que é a tela principal do produto.
Layout: painel de filtros fixo à esquerda (296px) + mapa ocupando o restante da largura.

Painel de filtros, de cima para baixo:
1. Campo de busca de origem (cidade, endereço ou empresa) — use a Places Autocomplete API do
   Google (componente client-side)
2. Slider de raio em km (10-200km, default 40km)
3. Divisor
4. Selects de filtro: Situação Cadastral, CNAE (input de texto com prefixo), Porte, Tipo
   (Matriz/Filial/Ambos)
5. Checkboxes: Simples Nacional, MEI
6. Range de datas: período de abertura (de/até)
7. Divisor
8. Chips de filtros ativos, cada um removível individualmente (clicar no X remove aquele
   filtro específico e atualiza a busca)
9. Botões "Buscar" (primário) e "Limpar filtros" (secundário)
10. Card de resumo: "X CNPJs encontrados · Y Places"

Área do mapa:
1. Google Maps JavaScript API renderizando o mapa
2. Círculo desenhado representando o raio atual a partir da origem
3. Pin de origem destacado no centro
4. Pins de CNPJs geocodificados, coloridos por situação (verde=ativa, amarelo=inapta,
   vermelho=baixada) — busque os dados via /api/cnpj/companies (a versão de amostra, não a
   exportação completa)
5. Ao passar o mouse ou clicar num pin, mostra um card com razão social, CNPJ formatado,
   CNAE, porte, situação
6. Controles de zoom no canto superior direito

Requisitos técnicos importantes:
- TODOS os filtros devem estar refletidos na URL via query params (useSearchParams +
  router.push com { scroll: false }), para serem compartilháveis e sobreviverem a refresh
- A busca não deve disparar uma chamada de API a cada tecla digitada — debounce de pelo menos
  400ms nos campos de texto, e a busca "de verdade" só dispara ao clicar em "Buscar" ou ao
  carregar a página com filtros já na URL
- Trate o estado de loading (skeleton ou spinner discreto) e o estado de erro (mensagem clara,
  não travar a tela)

Use os tipos/schemas Zod de packages/shared para garantir que os filtros enviados pro backend
são exatamente os esperados pela API.
```

## Após rodar este prompt
- Teste o fluxo completo: buscar origem → ajustar raio → filtrar → ver pins no mapa
- Confirme que copiar a URL e abrir em nova aba restaura os mesmos filtros
- Avance para `18-tela-cnpjs-tabela.md`
