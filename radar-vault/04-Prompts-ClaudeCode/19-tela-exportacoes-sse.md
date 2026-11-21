# Prompt 19 — Tela de Exportações (Jobs em Tempo Real)

> Fase: 3 — UI
> Pré-requisito: `18-tela-cnpjs-tabela.md` concluído

---

## Prompt

```
Leia o CLAUDE.md na raiz do projeto. Consulte também docs/design/radar-gr-ui.html (tela "03
Exportações") para a estrutura exata dos cards de job — replique o layout de job-card,
badges de status e barra de progresso usando as variáveis CSS do arquivo.

Vamos construir a tela de Exportações (app/(app)/exportacoes/page.tsx), que lista os jobs de
exportação do usuário autenticado com progresso em tempo real.

Topo:
1. Título "Exportações" + botão "+ Nova Exportação" (leva para a tela de CNPJs/Mapa, ou abre
   um modal simples de seleção de filtros — decida a abordagem mais simples e documente)

Lista de jobs (busca inicial via GET /api/cnpj/export-jobs, Server Component):
Para cada job, um card mostrando:
- Nome/identificador do arquivo (pode ser gerado a partir dos filtros, ex:
  "SP_Ativa_6201_40km_2026-06-14.csv.gz")
- Timestamp relativo ("há 5 min", "ontem")
- Badge de status: ✓ Concluído (verde), ⟳ Processando (amarelo), ✕ Falhou (vermelho)
- Estatísticas: linhas processadas, tamanho do arquivo, duração
- Se "running": barra de progresso animada + percentual, ATUALIZADA EM TEMPO REAL via SSE
  (conecte ao endpoint /api/cnpj/export-jobs/[id]/stream criado na Fase 2, prompt 13)
- Se "completed": botão "⬇ Download" que abre a URL pré-assinada do R2
- Se "failed": botão "↺ Tentar novamente" (cria um novo job com os mesmos filtros)

Comportamento técnico importante:
- Para jobs com status "running" no carregamento inicial da página, conecte automaticamente
  ao SSE de cada um (pode ter mais de um rodando)
- Quando um job conclui via SSE, atualize o card SEM precisar recarregar a página inteira
  (estado local em Client Component para os cards com job ativo)
- Feche a conexão SSE corretamente ao desmontar o componente ou quando o job conclui/falha
- Jobs já concluídos/falhados (carregados na busca inicial) NÃO precisam de conexão SSE —
  só os "running"

Crie um componente ExportJobCard que encapsula toda essa lógica de card + SSE condicional,
para manter a página principal limpa.

Teste o fluxo completo: criar uma exportação na tela de CNPJs → navegar para Exportações →
ver o progresso subir em tempo real → ver o card mudar para "Concluído" com botão de download
funcional, sem precisar recarregar a página manualmente.
```

## Após rodar este prompt
- Teste com pelo menos 2 jobs simultâneos para garantir que múltiplas conexões SSE não conflitam
- Avance para `20-filtros-url-state.md`
