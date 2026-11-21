# Prompt 20 — Unificação de Filtros via URL State

> Fase: 3 — UI
> Pré-requisito: `19-tela-exportacoes-sse.md` concluído
> Este é o último prompt da Fase 3 — consolida e corrige duplicações entre as telas

---

## Prompt

```
Leia o CLAUDE.md na raiz do projeto. Para qualquer ajuste visual durante esta refatoração,
docs/design/radar-gr-ui.html continua sendo a referência definitiva de cores e componentes.

Ao construir as telas de Mapa e CNPJs nos prompts anteriores, é provável que a lógica de
filtros (estado, leitura/escrita da URL, validação Zod) tenha ficado duplicada ou ligeiramente
inconsistente entre as duas telas. Vamos consolidar isso agora.

Faça o seguinte:

1. Revise os componentes de filtro criados nas telas de Mapa e CNPJs. Identifique a lógica
   duplicada (parsing de query params, serialização de volta pra URL, validação).

2. Crie um hook compartilhado: apps/web/src/hooks/useCnpjFilters.ts que:
   - Lê os filtros atuais da URL (useSearchParams)
   - Valida com o schema Zod de packages/shared
   - Expõe uma função para atualizar um filtro específico (atualiza a URL via router.push,
     mantendo os outros filtros intactos)
   - Expõe uma função para remover um filtro específico (usado pelos chips removíveis)
   - Expõe uma função para limpar todos os filtros

3. Refatore as telas de Mapa e CNPJs para usar esse hook único, eliminando a duplicação.

4. Crie um componente compartilhado <FilterChips filters={...} onRemove={...} /> usado nas
   duas telas, já que o visual e comportamento são idênticos.

5. Adicione um teste (pode ser um teste de componente com Vitest + Testing Library, ou um
   teste do hook isolado) que confirma: ao remover um chip de filtro, APENAS aquele filtro
   é removido da URL, os demais permanecem.

6. Valide manualmente o cenário completo: aplicar filtros no Mapa → navegar para CNPJs (via
   sidebar, não voltando pelo browser) → confirmar que os filtros persistiram, porque ambos
   leem da mesma fonte de verdade (a URL).

Ao final, atualize o CLAUDE.md da raiz, seção "Fase atual", para "Fase 4 — Workers e Escala
(próxima)".
```

## Após rodar este prompt
- Isso conclui a Fase 3 inteira. Atualize [[03-Fases-Desenvolvimento/Status-Atual]]
- Faça uma revisão visual geral das 3 telas construídas antes de avançar
- Avance para os prompts da Fase 4 (`21-docker-compose-prod-caddy.md` em diante)
