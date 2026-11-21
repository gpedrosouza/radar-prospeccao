# Prompt 09 — Tradução de CNAE e classificação por setor econômico

> Cole no Claude Code (VS Code) na raiz do monorepo `radar-prospeccao`.
> Independe do prompt 08, mas segue as mesmas convenções. Execute na ordem; não pule os testes.

---

## Objetivo

Hoje a busca e as exportações mostram o CNAE apenas como **código** (`cnae_principal`, 7 dígitos).
Queremos:

1. **Tradução direta** código → denominação da subclasse, em toda listagem e exportação.
2. **Classificação por setor econômico** (Seção / Divisão / Grupo da CNAE 2.0), para segmentar
   campanhas por ramo — coluna e filtro "Setor".

## Fatos importantes (não re-descobrir)

- A tradução **já é possível sem import novo**: o importador da Receita já popula
  `lookup_cnae (codigo CHAR(7), descricao TEXT)` — mesmo código de 7 dígitos gravado em
  `company_cnpj.cnae_principal`. Ver `apps/workers/src/scripts/import-receita/loaders/dictionaries.ts`
  e `.../import-receita/schema.ts`. A UI mostra o código só porque o caminho de leitura não faz o join.
- A hierarquia de setor **não** vem da `lookup_cnae` (que é subclasse). Vem da estrutura CNAE 2.0 do
  IBGE, nível **classe (5 dígitos)**. O CSV normalizado já está commitado em
  **`packages/db/seeds/cnae-estrutura.csv`** com as colunas:
  `classe,classe_desc,grupo,grupo_desc,divisao,divisao_desc,secao,secao_desc` (673 classes, 21 seções).
- Relação entre os níveis: `cnae_principal` (7 díg, subclasse) → **classe = primeiros 5 dígitos**.
  Ex.: `4755503` → classe `47555`. A partir da classe se chega a grupo/divisão/seção.

## Regras arquiteturais (CLAUDE.md — inegociáveis)

- **Não** tocar em `company_cnpj` (sem coluna nova, sem migration na tabela particionada).
- `apps/web` e `apps/workers` não se importam; código compartilhado em `packages/`. O acesso a
  dados (Maps de lookup) fica em `packages/db` e é consumido por ambos.
- Rotas de API não tocam Prisma direto — via `server/services` → `server/repositories`.
- Listagens/export mantêm o filtro `uf`/`uf_in` para partition pruning.
- TypeScript strict. Conventional Commits.

---

## Parte A — Tabela de estrutura CNAE (setor)

Os `lookup_*` deste projeto **não** são modelos Prisma; são criados via `CREATE TABLE IF NOT EXISTS`
em `apps/workers/src/scripts/import-receita/schema.ts`. Siga o mesmo padrão.

1. Em `schema.ts`, adicionar (junto dos outros lookups):

   ```sql
   CREATE TABLE IF NOT EXISTS lookup_cnae_estrutura (
     classe       CHAR(5) PRIMARY KEY,
     classe_desc  TEXT NOT NULL,
     grupo        CHAR(3),
     grupo_desc   TEXT,
     divisao      CHAR(2),
     divisao_desc TEXT,
     secao        CHAR(1),
     secao_desc   TEXT
   );
   ```

2. Criar um seed/loader **em `packages/db`** (reference data do banco vive aqui, evita
   cross-import entre apps): `packages/db/seeds/import-cnae-estrutura.ts`, no mesmo estilo de
   `seeds/create-admin.ts`, que:
   - garante a tabela (`CREATE TABLE IF NOT EXISTS` acima — ou reusa o schema bootstrap);
   - lê `packages/db/seeds/cnae-estrutura.csv` (header, UTF-8);
   - faz `TRUNCATE lookup_cnae_estrutura` + `COPY`/insert em lote (idempotente).
   - Adicionar script npm: `"seed:cnae-estrutura": "tsx seeds/import-cnae-estrutura.ts"` em
     `packages/db/package.json`. Rodar: `npm run seed:cnae-estrutura --workspace=packages/db`.

## Parte B — Acesso aos lookups (packages/db) — carga única em memória

Ambos os lookups são pequenos (~1.3k CNAEs, 673 classes) e estáticos. Exponha-os como Maps
cacheados em módulo, carregados sob demanda **uma vez**, para não fazer JOIN por linha nem query
por item.

Criar `packages/db/src/repositories/cnae-lookup.ts` exportando:

```ts
// Map código 7 díg → descrição da subclasse
export async function getCnaeDescricaoMap(prisma): Promise<Map<string, string>>;

// Map classe 5 díg → { secao, secao_desc, divisao, divisao_desc, grupo, grupo_desc, classe_desc }
export async function getCnaeEstruturaMap(prisma): Promise<Map<string, CnaeEstrutura>>;

// Helpers puros de derivação (sem I/O) — podem ir em packages/shared se preferir:
export function classeFromCnae(cnae7: string): string; // primeiros 5 dígitos
```

Cache em variável de módulo (lazy). Ambos os Maps vêm de `SELECT ... FROM lookup_cnae` e
`... FROM lookup_cnae_estrutura`. Se o cache precisar invalidar, reset simples é suficiente
(dados só mudam quando o importador/seed roda).

## Parte C — Exportação (apps/workers/src/lib/csv-exporter.ts)

No início do job, carregar os dois Maps (Parte B) e passá-los ao `itemToRow`. Adicionar ao
`CSV_COLUMNS` (após `cnae_principal`) e preencher em `itemToRow`:

- `{ key: "cnae_descricao",  header: "CNAE (descrição)" }` → `descMap.get(item.cnae_principal) ?? ""`
- `{ key: "cnae_secao",      header: "Setor" }`            → `estrutura?.secao_desc ?? ""`
- `{ key: "cnae_divisao",    header: "Divisão CNAE" }`     → `estrutura?.divisao_desc ?? ""`
  (onde `estrutura = estruturaMap.get(classeFromCnae(item.cnae_principal))`)

Manter `cnae_principal` (código) como está — as novas colunas são adicionais.

## Parte D — API + serviço (enriquecer a listagem)

- `/api/cnpj/companies` → o **service** (`server/services`) carrega os Maps (Parte B) e enriquece
  cada item com `cnae_descricao`, `cnae_secao` (e `cnae_divisao` se quiser) antes de retornar.
  A query principal continua igual (partition pruning intacto); o enriquecimento é pós-consulta,
  em memória. Não fazer o route tocar Prisma.
- Atualizar o tipo de retorno (`CnpjTableItem` / DTO) com os novos campos.

## Parte E — Filtro por Setor (reaproveitando cnae_prefixos)

O repositório já suporta `cnae_prefixo`/`cnae_prefixos` (LIKE `'prefixo%'` com índice
`bpchar_pattern_ops`). Use isso — **sem** denormalizar seção em `company_cnpj`:

1. Ao selecionar uma Seção na UI, resolver via `lookup_cnae_estrutura` as **divisões** (2 díg)
   daquela seção → vira uma lista de prefixos de 2 dígitos.
2. Passar essa lista como `cnae_prefixos` para a busca/count/export. Assim o filtro de setor cai no
   caminho já existente e indexado, sem tocar schema.
3. Expor um endpoint utilitário (ou constante gerada) "seções → divisões" a partir do
   `lookup_cnae_estrutura` para a UI montar o seletor.

## Parte F — UI (`apps/web/src/app/(app)/cnpjs/_components` + mapa)

1. `CnpjTable.tsx`: nova coluna **CNAE (descrição)** ao lado do código; opcional **Setor**.
2. `FilterBar.tsx` + estado (`CnpjsFilterState`, `useCnpjFilters`, `FilterChips`,
   `computeRemovedParams`): seletor **Setor** (21 seções). A seleção é traduzida para
   `cnae_prefixos` (Parte E), com chip removível e preservação na URL entre Mapa ↔ CNPJs.
3. Tooltip/label: mostrar código + descrição juntos onde fizer sentido.

---

## Testes e verificação (obrigatório)

- `packages/db`: teste de `classeFromCnae` (7→5 díg, padding) e dos loaders de Map (mock do prisma
  ou banco de teste).
- Seed: rodar `npm run seed:cnae-estrutura --workspace=packages/db` e conferir
  `SELECT count(*) FROM lookup_cnae_estrutura;` = 673 e 21 seções distintas.
- `apps/web`: atualizar/rodar testes de `cnpj-search.service`, `export.service`,
  `computeRemovedParams`; `npm test --workspace=apps/web` verde.
- Sanidade manual: exportar uma amostra (ex.: município agrícola) e conferir que
  `4755503 → "Comércio varejista..."`, `0113000 → Setor "AGRICULTURA, PECUÁRIA..."` etc.
- Typecheck/lint strict passam (inclusive `no-restricted-imports` entre apps).

## Critérios de aceite

- Toda listagem e exportação trazem a descrição do CNAE, não só o código.
- Coluna e filtro "Setor" funcionam em Mapa, CNPJs e no export, via `cnae_prefixos`
  (sem alterar `company_cnpj`, sem migration na tabela particionada).
- Tradução vem de `lookup_cnae` (já existente); setor vem de `lookup_cnae_estrutura`
  (nova, populada pelo seed a partir do CSV commitado).
- Lookups carregados uma vez em memória — sem JOIN/consulta por linha.

## Commits sugeridos

1. `feat(db): tabela lookup_cnae_estrutura + seed a partir de cnae-estrutura.csv`
2. `feat(db): loaders cacheados de descrição e estrutura de CNAE`
3. `feat(workers): colunas CNAE (descrição) e Setor no export CSV`
4. `feat(web): enriquece listagem com descrição de CNAE e setor`
5. `feat(web): filtro por Setor (seção → cnae_prefixos) na UI de CNPJs`
