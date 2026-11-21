# Prompt 18 — Tela de CNPJs (Tabela e Stats)

> Fase: 3 — UI
> Pré-requisito: `17-tela-mapa.md` concluído

---

## Prompt

```
Leia o CLAUDE.md na raiz do projeto. Consulte também docs/design/radar-gr-ui.html (tela "02
CNPJs") para a estrutura exata da barra de estatísticas, filtros e tabela — replique
espaçamento, cores (variáveis CSS do arquivo) e os badges de situação cadastral (Ativa/
Inapta/Baixada com as cores success/warning/danger do blueprint).

Vamos construir a tela de CNPJs (app/(app)/cnpjs/page.tsx), que mostra os resultados em
formato tabular com mais detalhe que o mapa.

Topo da página:
1. Barra de estatísticas (5 cards horizontais): Total no Filtro, Com E-mail (e %), Simples
   Nacional (e %), Capital Médio, Match Places — cada card com uma barra de cor lateral
   indicando a categoria (use as cores definidas no prompt 16)
2. Barra de filtros compacta: busca por texto livre (razão social/CNPJ), selects de UF/
   Situação/CNAE/Porte, chips de filtros ativos
3. Botões de ação no topbar: "Exportar XLSX" (usa os dados já carregados na tela), "Campanha"
   (leva para a tela de campanhas com a base atual pré-selecionada), "CSV Completo" (botão
   primário — dispara o job assíncrono de exportação)

Tabela:
- Colunas: CNPJ, Razão Social, Município, UF, CNAE, Situação (badge colorido), Porte, E-mail
  (✓/–), Score (se houver match com Places)
- Paginação por cursor (não OFFSET) — ao avançar página, atualiza a URL com o cursor atual
- Estado vazio bem desenhado (não só "nenhum resultado", mas uma sugestão: "tente ampliar o
  raio ou remover algum filtro")
- Linha de rodapé: "Mostrando X de Y registros" + controles Anterior/Próxima

Ao clicar em "CSV Completo":
1. Chama POST /api/cnpj/export-jobs com os filtros atuais
2. Mostra um toast/notificação confirmando que o job foi criado, com link para acompanhar em
   "Exportações"
3. Não trava a tela esperando o job terminar — é fire-and-forget pro usuário, ele acompanha
   depois na aba dedicada

Os filtros desta tela devem ser os MESMOS da tela de Mapa (compartilhe o componente de painel
de filtros entre as duas telas se fizer sentido, ou ao menos compartilhe a lógica de
estado/URL) — um usuário pode chegar nesta tela vindo do mapa com os filtros já aplicados.

Implemente com componentes Server Component onde possível para a busca inicial (melhor TTFB),
e Client Component só onde há interatividade (filtros, paginação).
```

## Após rodar este prompt
- Teste o fluxo: aplicar filtro no mapa → navegar para CNPJs → confirmar que os filtros persistiram
- Avance para `19-tela-exportacoes-sse.md`
