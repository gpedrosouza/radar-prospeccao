# Prompt para Claude Code — Corrigir performance da busca por raio no Mapa

Cole o bloco abaixo no Claude Code, dentro do repositório do projeto.

---

Estou com lentidão na busca por raio da tela de Mapa (`GET /api/cnpj/companies` com
`lat`/`lng`/`raio_km`). Investiguei e identifiquei duas causas raiz que preciso corrigir:

## 1. Adicionar índice espacial à tabela `cities`

Hoje `apps/web/src/server/repositories/city.repository.ts` (`findWithinRadius`) faz
`ST_MakePoint` on-the-fly linha a linha via `$queryRaw`, sem coluna `geom` nem índice GIST — o
próprio comentário no topo do arquivo já documenta a migration pendente. Quero que você:

1. Crie uma migration SQL manual em `packages/db/prisma/migrations/` (seguindo o padrão dos
   arquivos já existentes em `packages/db/prisma/migrations/20260626000001_init/migration.sql`)
   que:
   - Adicione a coluna `geom GEOGRAPHY(POINT, 4326)` na tabela `cities`.
   - Popule `geom` a partir de `longitude`/`latitude` já existentes (`UPDATE cities SET geom =
     ST_MakePoint(longitude, latitude)::geography`).
   - Crie um índice `CREATE INDEX idx_cities_geom ON cities USING GIST(geom);`.
2. Atualize o `schema.prisma` para refletir a nova coluna (campo `geom` no model `City`,
   `Unsupported("geography(Point,4326)")` como já deve estar feito para `CompanyCnpj.geom`, veja
   o padrão lá).
3. Reescreva `findWithinRadius` em `city.repository.ts` para usar a coluna `geom` persistida em
   vez de `ST_MakePoint` on-the-fly, mantendo a mesma assinatura e o mesmo formato de retorno
   (`CityInRadius[]`).
4. Rode `npm run db:deploy --workspace=packages/db` e `npm run db:generate --workspace=packages/db`
   depois de criar a migration, para aplicar e regenerar o client.
5. Atualize/rode os testes Vitest relacionados a `city.repository` (crie um teste se não existir
   um cobrindo `findWithinRadius`, testando contra o banco real conforme convenção do projeto).

## 2. Evitar dupla resolução de município + forçar partition pruning por UF

Em `apps/web/src/server/services/cnpj-search.service.ts`, `searchCnpjs` e `countCnpjs` chamam
`buildRepositoryFilters` de forma independente, e cada uma resolve `resolveMunicipioCodigos`
(que chama a busca por raio) separadamente — ou seja, a busca por raio roda duas vezes por
requisição, já que `apps/web/src/app/api/cnpj/companies/route.ts` dispara as duas em paralelo
via `Promise.all`. Além disso, quando a busca é feita só por `lat`/`lng`/`raio_km` (sem `uf`
explícito), a query em `company_cnpj` não consegue fazer partition pruning e varre as 27
partições. Quero que você:

1. Refatore para resolver `municipio_codigos` **uma única vez** por requisição e reutilizar o
   resultado tanto em `searchCnpjs` quanto em `countCnpjs` — por exemplo, expondo uma função
   `resolveSearchContext(filters)` que devolve `{ municipio_codigos, uf_inferida }` e é chamada
   uma vez em `route.ts`, passando o resultado já resolvido para as duas funções em vez de cada
   uma resolver por conta própria.
2. Quando a busca por raio resolver municípios, derive automaticamente o(s) `uf` presentes nesse
   conjunto de cidades (o repository de `cities` já retorna `uf` por município — ver
   `CityInRadius.uf` em `city.repository.ts`) e passe isso como filtro adicional para
   `cnpjRepository.findByFilters`/`countByFiltersCapped`, para habilitar partition pruning mesmo
   quando o usuário não seleciona UF manualmente no mapa. Se o raio cruzar mais de uma UF, passe
   a lista de UFs (ajuste `FindByFiltersInput` em `cnpj.repository.ts` se hoje só aceita uma
   `uf` string — troque para aceitar `uf` OU `uf_in: string[]`, mantendo compatibilidade com o
   uso atual por outras rotas).
3. Garanta que `packages/shared` (schema Zod `CnpjSearchFiltersSchema`) e os tipos em
   `FindByFiltersInput` continuem consistentes com essa mudança.
4. Rode `npm test --workspace=apps/web` no final e me mostre o resultado. Não quebre os testes
   de integração existentes de `export-jobs` e `cnpj/companies` (mencionados no CLAUDE.md como já
   cobertos).

## Regras a respeitar (do CLAUDE.md do projeto)

- `company_cnpj` é particionada por `uf` — qualquer mudança em índice/coluna dela precisa de SQL
  manual, nunca `prisma migrate dev`. `cities` não é particionada, mas siga o mesmo padrão de
  migration manual para consistência.
- Rotas de API não tocam Prisma diretamente — mantenha o fluxo
  `route handler → services → repositories → Prisma`.
- Não introduza chamadas síncronas pesadas em rota de API sem necessidade.

Ao terminar, me dê um resumo do que mudou, os arquivos tocados, e o tempo de resposta antes/depois
para uma busca de raio 40km em torno de São Carlos (lat -22.0087, lng -47.8909), se conseguir
medir localmente.
