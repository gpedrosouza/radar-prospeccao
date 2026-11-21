# Prompt 07 — Validação de Índices e ANALYZE

> Fase: 1 — Dados
> Pré-requisito: `06-importador-receita-copy.md` (pelo menos uma carga de teste rodada)

---

## Prompt

```
Leia o CLAUDE.md na raiz do projeto antes de começar.

Depois de carregar uma amostra de dados (ou a base completa) na tabela CompanyCnpj particionada,
preciso validar que os índices criados na migration da Fase 0 estão funcionando como esperado,
e configurar a rotina de ANALYZE.

Faça o seguinte:

1. Rode ANALYZE "CompanyCnpj"; e confirme que completou sem erro
2. Rode EXPLAIN ANALYZE nas seguintes queries de teste, e me mostre o plano de execução de cada uma:
   a) SELECT * FROM "CompanyCnpj" WHERE uf = 'SP' AND situacao = 'Ativa' LIMIT 500;
      (deve usar partition pruning + o índice parcial de situação ativa)
   b) SELECT * FROM "CompanyCnpj" WHERE cnae_principal LIKE '6201%';
      (deve usar o índice text_pattern_ops)
   c) SELECT * FROM "CompanyCnpj" WHERE uf = 'SP' ORDER BY id LIMIT 500 OFFSET 10000;
      (esta é a query de paginação por OFFSET — espera-se que seja LENTA; vamos comparar com cursor)
   d) SELECT * FROM "CompanyCnpj" WHERE uf = 'SP' AND id > 50000 ORDER BY id LIMIT 500;
      (esta é a versão por cursor — espera-se que seja MUITO mais rápida que a anterior)

3. Crie um script em apps/workers/src/scripts/analyze-cnpj.ts que roda o ANALYZE e pode ser
   chamado via npm script (npm run db:analyze), para eu rodar manualmente depois de cada carga
   grande

4. Documente num comentário no próprio script, ou num arquivo docs/performance-notes.md, os
   tempos de execução observados nas 4 queries acima, para servir de baseline de comparação
   se algo degradar no futuro

Se qualquer uma das queries (a) ou (b) não estiver usando o índice esperado, investigue e
ajuste o índice ou a query antes de prosseguir — não aceite um plano de execução que faça
sequential scan na tabela toda.
```

## Após rodar este prompt
- Guarde os tempos de baseline em algum lugar versionado (docs/performance-notes.md sugerido)
- Avance para `08-schema-analytics.md`
