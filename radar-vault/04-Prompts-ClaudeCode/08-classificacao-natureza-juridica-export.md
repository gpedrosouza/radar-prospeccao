# Prompt 08 — Classificação por natureza jurídica como padrão em toda exportação

> Cole este prompt no Claude Code (VS Code) na raiz do monorepo `radar-prospeccao`.
> Ele descreve uma mudança completa (camadas 1–5). Execute na ordem. Não pule os testes.

---

## Objetivo

Tornar a **classificação empresário individual × empresa** e os campos que permitem
**estimar faixa de faturamento** parte padrão de **toda e qualquer exportação e listagem**
do sistema — hoje esses dados existem no banco mas são descartados no caminho de leitura.

Discriminador principal do negócio: **natureza jurídica `2135` (Empresário Individual)**.
Contexto: o import da Receita **já exclui MEI** (join com `staging_simples`, ver
`apps/workers/src/scripts/import-receita/loaders/estabelecimentos.ts`), então `opcao_mei` é
quase sempre `false` e **não** deve ser o eixo da classificação — a natureza jurídica é.

## Fato importante (não re-descobrir)

A tabela `company_cnpj` **já contém** todos os campos necessários — confirmado em
`packages/db/prisma/schema.prisma`: `natureza_juridica`, `capital_social`, `data_abertura`,
`matriz_filial`, `porte`, `opcao_simples`, `opcao_mei`. **Nenhuma migration é necessária.**
O problema é puramente de camadas de leitura/serialização que não selecionam nem emitem esses
campos.

Também já existe a tabela `lookup_natureza_juridica (codigo, descricao)` (populada pelo
importador em `.../loaders/dictionaries.ts`) para traduzir o código em texto.

## Regras arquiteturais a respeitar (CLAUDE.md — inegociáveis)

- **NÃO** rodar `prisma migrate dev` (e nenhuma migration) — a mudança é só select/serialização.
- `apps/web` e `apps/workers` **nunca** importam um do outro. Lógica compartilhada vai em
  `packages/shared` (a função de classificação).
- Rotas de API **não** tocam Prisma direto — sempre via `server/services` → `server/repositories`.
- Listagens/exports na tabela particionada **devem** manter o filtro `uf`/`uf_in` para partition
  pruning. Não remover.
- TypeScript strict: sem `any` injustificado.
- Commits em Conventional Commits (`feat:`, `refactor:`, `test:`).

---

## Antes de codificar: confirmar o formato do código

Rode uma leitura para saber o formato exato gravado em `company_cnpj.natureza_juridica`
(com ou sem hífen, com zeros à esquerda). Ex.:

```sql
SELECT natureza_juridica, count(*) FROM company_cnpj
GROUP BY natureza_juridica ORDER BY count DESC LIMIT 20;
```

Ajuste as constantes do classificador (`2135`, `2305`) ao formato real encontrado. Se estiver
com hífen (`213-5`), normalize antes de comparar. **Não presuma** — verifique.

---

## Camada 1 — Leitura (packages/db/src/repositories/cnpj.repository.ts)

É o gargalo único: listagem, count e export passam por aqui.

1. Em `CnpjListItem` (interface pública), adicionar:
   `natureza_juridica: string | null`, `capital_social: string | null` (Decimal serializado
   como string — nunca number, para não perder precisão), `data_abertura: Date | null`,
   `matriz_filial: string | null`.
2. Em `LIST_SELECT`, adicionar as mesmas chaves com `true`
   (`natureza_juridica`, `capital_social`, `data_abertura`, `matriz_filial`).
   `opcao_simples`/`opcao_mei` já estão presentes — manter.
3. Se houver query raw paralela (`$queryRaw<CnpjListItem[]>`) que lista as colunas
   explicitamente (por volta da linha ~324), incluir os novos campos na projeção também,
   senão os dois caminhos divergem.

## Camada 2 — Classificação compartilhada (packages/shared)

Criar `packages/shared/src/classificacao.ts` (e exportar de `packages/shared/src/index.ts`)
com uma **função pura, sem I/O**:

```ts
export type TipoPessoa =
  | "Empresário Individual"
  | "Empresa (unipessoal)"
  | "Empresa (sociedade)"
  | "MEI"
  | "Indefinido";

/**
 * Classifica o CNPJ a partir da natureza jurídica (código da Receita) e da flag MEI.
 * MEI foi excluído na carga, então na prática separa 2135 (empresário individual)
 * do restante — mas a flag é tratada por correção.
 */
export function classificarTipoPessoa(
  naturezaJuridica: string | null,
  opcaoMei: boolean,
): TipoPessoa;
```

Regras (ajustar os códigos ao formato confirmado acima):
- `opcaoMei === true` → `"MEI"`.
- natureza `2135` → `"Empresário Individual"`.
- natureza `2305` (Sociedade Limitada Unipessoal) → `"Empresa (unipessoal)"`.
- natureza nula/vazia → `"Indefinido"`.
- qualquer outra → `"Empresa (sociedade)"`.

Teste Vitest correspondente cobrindo cada ramo (`classificacao.test.ts`).

## Camada 3 — Exportação (apps/workers/src/lib/csv-exporter.ts)

Único produtor de arquivo do sistema — mexer aqui cobre toda exportação.

1. Em `CSV_COLUMNS`, acrescentar após `porte`:
   - `{ key: "tipo_pessoa", header: "Tipo" }`
   - `{ key: "natureza_juridica", header: "Cód. Natureza Jurídica" }`
   - `{ key: "natureza_juridica_desc", header: "Natureza Jurídica" }`
   - `{ key: "capital_social", header: "Capital Social" }`
   - `{ key: "data_abertura", header: "Data de Abertura" }`
2. Em `itemToRow`, preencher:
   - `tipo_pessoa`: `classificarTipoPessoa(item.natureza_juridica, item.opcao_mei)` (import de
     `@radar/shared`).
   - `natureza_juridica`: `item.natureza_juridica`.
   - `natureza_juridica_desc`: via **mapa carregado uma vez por job** —
     `SELECT codigo, descricao FROM lookup_natureza_juridica` num `Map<string,string>` no início
     da exportação, passado para `itemToRow`. Não fazer JOIN por linha nem query por linha.
   - `capital_social`: formatar como string (ex.: `item.capital_social ?? ""`).
   - `data_abertura`: `YYYY-MM-DD` (ou vazio se null).
3. Também emitir `opcao_simples`/`opcao_mei` como colunas legíveis (`"Sim"`/`"Não"`) — hoje o
   repositório já entrega, mas o CSV descarta. Colunas `Optante Simples` / `Optante MEI`.

## Camada 4 — Filtro por natureza jurídica

Permitir que o banker gere direto "só empresa de fato" ou "só 2135", sem pós-processar no Excel.

1. `packages/db` → `FindByFiltersInput`: adicionar `natureza_juridica?: string` e
   `naturezas_juridicas?: string[]` (OR/IN). Tratar em **ambos** os caminhos de `buildWhere`
   (o `Prisma.CompanyCnpjWhereInput` e a variante raw SQL) — manter partition pruning por `uf`.
2. `apps/web/src/server/services` → schema Zod dos filtros (export + busca/count): validar o novo
   campo. Repassar do route → service → repository (sem tocar Prisma no route).
3. Conferir que `POST /api/cnpj/export-jobs`, `GET /api/cnpj/companies` e o count aceitam e
   propagam o filtro.

## Camada 5 — UI (apps/web/src/app/(app)/cnpjs/_components + mapa)

1. `CnpjTableItem` (`cnpjs/_components/types.ts`): adicionar `natureza_juridica`,
   `tipo_pessoa` (derivar no mapeamento vindo da API usando `classificarTipoPessoa`, ou expor a
   descrição/tipo já pela API — escolher um e ser consistente), `capital_social`, `data_abertura`.
2. `CnpjTable.tsx`: nova coluna **Tipo** (e opcionalmente Natureza Jurídica/Capital como colunas
   secundárias).
3. `FilterBar.tsx` + estado de filtros (`CnpjsFilterState`, `useCnpjFilters` hook, `FilterChips`,
   `computeRemovedParams`): adicionar o filtro de natureza jurídica / tipo de pessoa, com chip
   removível, preservado na URL entre Mapa ↔ CNPJs (mesmo padrão dos demais filtros).

---

## Testes e verificação (obrigatório antes de finalizar)

- `packages/shared`: teste unitário de `classificarTipoPessoa` (todos os ramos).
- `packages/db`: se houver teste de repositório/`LIST_SELECT`, atualizar para os novos campos.
- `apps/web`: atualizar/rodar testes de `export.service`, `cnpj-search.service`,
  `computeRemovedParams` e integração de `export-jobs`/`cnpj/companies`.
- Rodar `npm test --workspace=apps/web` e o test do worker (se existir) — tudo verde.
- Rodar `npm run build`/typecheck para garantir strict sem erros.
- Sanidade manual: disparar uma exportação pequena (uma UF/município) e abrir o CSV — as colunas
  `Tipo`, `Natureza Jurídica`, `Capital Social`, `Data de Abertura` devem vir preenchidas, e
  `Tipo = "Empresário Individual"` para os CNPJs de natureza `2135`.

## Critérios de aceite

- Toda exportação gerada pelo worker inclui as novas colunas, sem exceção.
- A classificação vem de **uma única** função em `packages/shared`, usada por web e worker.
- Nenhuma migration criada; `company_cnpj` intacta; partition pruning preservado.
- Filtro por natureza jurídica funciona em Mapa, CNPJs e no job de exportação, com chip na URL.
- Lint (`no-restricted-imports` entre apps) e typecheck strict passam.

## Commits sugeridos

1. `feat(shared): função classificarTipoPessoa por natureza jurídica`
2. `feat(db): expõe natureza_juridica/capital_social/data_abertura/matriz_filial em CnpjListItem`
3. `feat(workers): colunas de classificação e faturamento no export CSV`
4. `feat(web): filtro por natureza jurídica em busca, count e export`
5. `feat(web): coluna Tipo e filtro de natureza jurídica na UI de CNPJs`
