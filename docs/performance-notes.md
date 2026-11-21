# Performance Notes — company_cnpj

Baseline coletado em 2026-06-27 com 11 linhas de fixture (3 por UF após filtros Ativa + não-MEI).
Os tempos reais com ~20M linhas serão muito maiores; o que importa aqui é **confirmar que os
caminhos de índice existem e são acionados corretamente** — não os tempos absolutos.

---

## Baseline de timings — 2026-06-27 (fixtures, 11 linhas)

| # | Query | Plano natural | t natural | Plano forçado (`enable_seqscan=off`) | t forçado |
|---|-------|--------------|-----------|--------------------------------------|-----------|
| a | `WHERE uf='SP' AND situacao='Ativa' LIMIT 500` | Seq Scan `company_cnpj_sp` (partition pruning ✓) | **0.072 ms** | Index Scan `_municipio_codigo_cnae_principal_idx` | ~0.4 ms |
| b | `WHERE cnae_principal LIKE '6201%' LIMIT 500` | Append 27× Seq Scan (sem `uf`, all partitions) | **0.275 ms** | Append 27× Index Scan `_cnae_principal_idx` (`~>=~`/`~<~` bpchar range ✓) | — |
| c | `WHERE uf='SP' ORDER BY id LIMIT 500 OFFSET 10000` | Sort → Seq Scan `company_cnpj_sp` | **0.072 ms** | Index Scan `_uf_id_idx` (`uf='SP'`) — lê OFFSET linhas antes do LIMIT | **0.458 ms** |
| d | `WHERE uf='SP' AND id > 50000 ORDER BY id LIMIT 500` | Sort → Seq Scan `company_cnpj_sp` | **0.017 ms** | Index Scan `_uf_id_idx` (`uf='SP' AND id>50000`) — posiciona direto ✓ | **0.054 ms** |

> Atenção: com dataset mínimo o planner sempre prefere Seq Scan (correto). Os tempos forçados
> mostram o overhead do índice frio; com 20M linhas os papéis se invertem drasticamente.
> Atualizar esta tabela após primeira carga real da Receita Federal.

---

## ANALYZE

```sql
ANALYZE VERBOSE company_cnpj;
```

- Propaga automaticamente às 27 partições filhas.
- Saída: `INFO: analyzing "public.company_cnpj_ac"` … `"public.company_cnpj_to"` (27 linhas).
- Recomendação para produção: agendar `ANALYZE company_cnpj` após cada carga de dados. O script
  `npm run db:analyze --workspace=apps/workers` faz isso automaticamente antes das queries de
  validação.

---

## Índices criados na migration (`20260626000001_init`)

| Sufixo | Colunas | Tipo | Observação |
|--------|---------|------|------------|
| `_pkey` | `(id, uf)` | btree | PK composta obrigatória por particionamento |
| `_municipio_codigo_cnae_principal_idx` | `(municipio_codigo, cnae_principal)` | btree partial (`WHERE situacao = 'Ativa'`) | Só lido quando situacao = 'Ativa' está no WHERE |
| `_cnae_principal_idx` | `cnae_principal` | btree `bpchar_pattern_ops` | Permite LIKE '6201%' via range scan |
| `_uf_id_idx` | `(uf, id)` | btree | ORDER BY id com partition pruning + cursor pagination |
| `_geom_idx` | `geom` | GIST | Busca por raio geográfico (PostGIS) — sem dados ainda |

Total: 140 índices (5 tipos × 27 partições + 4 ON ONLY no pai).

---

## Query (a) — Partition pruning + partial index

```sql
SELECT * FROM company_cnpj WHERE uf = 'SP' AND situacao = 'Ativa' LIMIT 500;
```

### Natural (dataset pequeno)
```
Seq Scan on company_cnpj_sp  (actual time=0.005..0.006 rows=3)
Execution Time: 0.072 ms
```
Somente `company_cnpj_sp` é varrida — **partition pruning funcionando** (26 partições excluídas).

### Forçado (`enable_seqscan = off`)
```
Index Scan on company_cnpj_sp_municipio_codigo_cnae_principal_idx
  Index Cond: (situacao = 'Ativa'::bpchar)
Execution Time: ~0.4 ms (inclui overhead de read de index page fria)
```
Índice parcial é acionado. Com dados reais e `municipio_codigo` no WHERE, o cost drop será
expressivo: a partição SP tem ~20M linhas, mas o índice parcial (só Ativas) cobre ~18M.

**Comportamento esperado em produção:** Index Scan (ou Bitmap Index Scan) quando a query
inclui `municipio_codigo` + `cnae_principal` + `uf`. Sem `municipio_codigo`, o planner
provavelmente opta por Seq Scan na partição inteira.

---

## Query (b) — LIKE prefix com bpchar_pattern_ops

```sql
SELECT * FROM company_cnpj WHERE cnae_principal LIKE '6201%' LIMIT 500;
```

### Natural (dataset pequeno)
```
Append → 27× Seq Scan on company_cnpj_<uf>
Execution Time: 0.275 ms
```
Sem filtro `uf`, todas as 27 partições são varridas — **esperado e correto**.

### Forçado (`enable_seqscan = off`)
```
Append → 27× Index Scan on company_cnpj_<uf>_cnae_principal_idx
  Index Cond: ((cnae_principal ~>=~ '6201'::bpchar) AND (cnae_principal ~<~ '6202'::bpchar))
```
`bpchar_pattern_ops` converte LIKE '6201%' em um range scan com os operadores `~>=~` / `~<~`
internos do bpchar. Confirma que **`bpchar_pattern_ops` está correto** — `text_pattern_ops`
não é aceito em colunas CHAR (tipo interno `bpchar`).

**Comportamento esperado em produção:** combinado com `uf` o Append terá apenas 1 filho.
Sem `uf`, o full Append de 27 é inevitável mas ainda usa índice em vez de seq scan.

---

## Query (c) — Paginação por OFFSET

```sql
SELECT * FROM company_cnpj WHERE uf = 'SP' ORDER BY id LIMIT 500 OFFSET 10000;
```

### Natural (dataset pequeno)
```
Sort → Seq Scan on company_cnpj_sp
Execution Time: 0.072 ms
```

### Forçado (`enable_seqscan = off`)
```
Index Scan using company_cnpj_sp_uf_id_idx on company_cnpj_sp
  Index Cond: (uf = 'SP'::bpchar)
Execution Time: 0.458 ms
```
O índice `(uf, id)` é acionado corretamente. **Em produção**, `OFFSET 10000` lê e descarta
10.000 tuplas antes de retornar as 500 úteis — custo O(OFFSET). Em páginas profundas
(OFFSET 100000+), isso representa dezenas de milhares de leituras desperdiçadas.

**Conclusão:** evitar OFFSET em produção para paginação de listas longas. Usar cursor.

---

## Query (d) — Paginação por cursor

```sql
SELECT * FROM company_cnpj WHERE uf = 'SP' AND id > 50000 ORDER BY id LIMIT 500;
```

### Natural (dataset pequeno)
```
Sort → Seq Scan on company_cnpj_sp
Execution Time: 0.017 ms
```

### Forçado (`enable_seqscan = off`)
```
Index Scan using company_cnpj_sp_uf_id_idx on company_cnpj_sp
  Index Cond: ((uf = 'SP'::bpchar) AND (id > 50000))
Execution Time: 0.054 ms
```
O planner posiciona o índice diretamente em `id > last_seen_id` — custo O(1) independente
de quantas páginas já foram navegadas. Com dados reais, a vantagem sobre OFFSET cresce
proporcionalmente ao número de página.

**Conclusão:** toda paginação na UI deve usar `id > :lastId` + `LIMIT`, nunca `OFFSET`.

---

## Comparação OFFSET vs cursor (projeção para produção)

| Métrica | OFFSET 10k | Cursor id > X |
|---------|------------|---------------|
| Linhas lidas pelo banco | 10.000 + 500 | 500 |
| Custo incremental por página | O(n×PAGE) | O(1) |
| Funciona com índice `(uf, id)` | Sim (mas desperdiça) | Sim (aproveitamento pleno) |
| Suporta "pular para página 200" | Sim | Não (limitação conhecida e aceitável) |

---

## Recomendações para produção

1. **Toda query de listagem na UI inclui `WHERE uf = ?`** — ativa partition pruning.
2. **Paginação usa cursor** (`id > :lastId`) em vez de OFFSET — ver acima.
3. **`ANALYZE company_cnpj`** após cada carga de dados para atualizar estatísticas.
4. **Query de busca por CNAE** sempre combina `uf` + `cnae_principal LIKE` para restringir
   o Append a 1 partição.
5. **Busca geográfica** (PostGIS ST_DWithin) ainda sem dados — validar quando geocodificação
   for implementada (índice GIST `_geom_idx` já criado).
