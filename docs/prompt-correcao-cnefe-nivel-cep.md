# Prompt para Claude Code — Elevar CNEFE de nível-município para nível-CEP

Cole o bloco abaixo no Claude Code, dentro do repositório do projeto.

---

## Contexto (não pular — leia antes de mexer em código)

Numa sessão anterior você implementou a cascata de geocodificação sob demanda e documentou, na
migration `packages/db/prisma/migrations/20260721000003_cnefe_municipio_centroides/migration.sql`,
que o `Coordenadas_enderecos` do IBGE (pasta `cnefe/`, já importado em
`cnefe_municipio_centroides`) não tem CEP nem logradouro — só município e coordenada. Por isso a
primeira camada da cascata ficou no nível de município.

**Isso mudou.** Foi baixado um segundo dataset do CNEFE, `Arquivos_CNEFE`, em
`C:\Users\Guilherme\Desktop\GO Dev\radar-prospeccao\cnefe\cnefe_correto\` (arquivos nomeados
`{codigo_uf}_{SIGLA}.csv`, ex. `14_RR.csv`, `35_SP.csv`). Eu inspecionei o conteúdo real desse
arquivo (não só a documentação) e confirmei que ele **já tem CEP e LATITUDE/LONGITUDE na mesma
linha** — não precisa cruzar com o `Coordenadas_enderecos` por `COD_UNICO_ENDERECO` como cheguei a
propor antes. É mais simples: um único arquivo, uma linha por endereço, com tudo junto.

Header confirmado (arquivo `14_RR.csv`, delimitador `;`):
```
COD_UNICO_ENDERECO;COD_UF;COD_MUNICIPIO;COD_DISTRITO;COD_SUBDISTRITO;COD_SETOR;NUM_QUADRA;NUM_FACE;
CEP;DSC_LOCALIDADE;NOM_TIPO_SEGLOGR;NOM_TITULO_SEGLOGR;NOM_SEGLOGR;NUM_ENDERECO;DSC_MODIFICADOR;
NOM_COMP_ELEM1;VAL_COMP_ELEM1;...;LATITUDE;LONGITUDE;NV_GEO_COORD;COD_ESPECIE;DSC_ESTABELECIMENTO;
COD_INDICADOR_ESTAB_ENDERECO;COD_INDICADOR_CONST_ENDERECO;COD_INDICADOR_FINALIDADE_CONST;COD_TIPO_ESPECI
```
Campos relevantes pro import: `CEP` (posição 9), `LATITUDE` (posição 26), `LONGITUDE` (posição
27). **Não assuma essas posições fixas no código** — resolva os índices pelo nome da coluna do
header, exatamente como `import-cnefe.ts` já faz para `Coordenadas_enderecos` (mesmo padrão,
robusto a pequenas variações entre arquivos). Antes de finalizar, confira o nome exato dessas
colunas contra `Dicionario_CNEFE_Censo_2022.xls` (baixado junto, mesma pasta do IBGE) — o que
citei acima é o que apareceu no header real de `14_RR.csv`, mas confirme se é consistente nos
outros arquivos também (podem ter sido baixados em datas diferentes).

**Tamanho:** esses arquivos são bem maiores que `Coordenadas_enderecos` — `35_SP.csv` tem **3,8
GB** descompactado (contra ~870 MB do arquivo irmão). Streaming linha a linha (não carregar tudo
em memória) é obrigatório, mesmo padrão de `readline` já usado em `import-cnefe.ts`.

**UFs disponíveis agora em `cnefe_correto/`:** RO, AC, AM, RR, PA, AP, TO, MA, PI, CE, RN, SE, BA,
ES, SP, MS, GO, DF (confirme a lista completa com `dir` antes de assumir — pode ter mudado se mais
UFs forem baixadas depois). Nem todas as 27 UFs estão lá ainda — o script deve processar o que
encontrar e reportar quais UFs faltam, sem quebrar.

## 1. Nova tabela `cnefe_ceps`

1. Crie uma migration SQL manual em `packages/db/prisma/migrations/` (mesmo padrão de
   `20260721000003_cnefe_municipio_centroides`):
   ```sql
   CREATE TABLE "cnefe_ceps" (
       "id"              SERIAL           NOT NULL,
       "cep"             CHAR(8)          NOT NULL,
       "uf"              CHAR(2)          NOT NULL,
       "total_enderecos" INTEGER          NOT NULL,
       "latitude"        DOUBLE PRECISION NOT NULL,
       "longitude"       DOUBLE PRECISION NOT NULL,
       "geom"            GEOGRAPHY(POINT, 4326) NOT NULL,
       "criado_em"       TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
       CONSTRAINT "cnefe_ceps_pkey" PRIMARY KEY ("id")
   );
   CREATE UNIQUE INDEX "cnefe_ceps_cep_key" ON "cnefe_ceps" ("cep");
   CREATE INDEX "idx_cnefe_ceps_geom" ON "cnefe_ceps" USING GIST ("geom");
   ```
2. Adicione o model em `schema.prisma` e rode `npm run db:generate --workspace=packages/db`.

## 2. Script de import (sem join — arquivo único por UF)

Crie `apps/workers/src/scripts/import-cnefe-ceps.ts`, seguindo bem de perto o padrão de
`import-cnefe.ts` (reaproveite a função de resolução de header por nome de coluna, e a estrutura
geral de streaming + agregação em memória + upsert — pode extrair um helper compartilhado entre os
dois scripts se fizer sentido, já que a lógica é quase idêntica, só muda a chave de agregação):

1. Lê o CSV de `Arquivos_CNEFE` em streaming (`readline`, delimitador `;`).
2. Resolve os índices de `CEP`, `LATITUDE`, `LONGITUDE` pelo header (nomes de coluna, não posição
   fixa).
3. Para cada linha: valida CEP (8 dígitos, não `00000000`) e lat/lng numéricos válidos; linhas
   inválidas são contadas e puladas, não travam o import.
4. Agrega soma/contagem de lat/lng por CEP em memória (`Map<cep, {sumLat, sumLng, count}>`) —
   igual ao padrão de `aggregateByMunicipio`, só que a chave é `CEP` em vez de `codigoMunicipio`.
   Atenção: o volume de CEPs únicos por UF é bem maior que o de municípios (pode passar de
   dezenas de milhares em UFs grandes) — ainda assim cabe em memória tranquilamente (é O(CEPs
   únicos), não O(linhas do arquivo)).
5. Ao fim de cada UF, upsert em `cnefe_ceps` (`ON CONFLICT (cep) DO UPDATE`), mesmo padrão de
   `upsertCentroides`.
6. CLI: suporte `--uf=SP --file="C:\...\cnefe_correto\35_SP.csv"` e
   `--dir="C:\Users\Guilherme\Desktop\GO Dev\radar-prospeccao\cnefe\cnefe_correto" --all`, com a
   mesma lógica de descoberta de arquivo por nome (`{codigo}_{SIGLA}.csv`) já usada em
   `descobrirArquivosPorUf`.
7. Idempotência: pula UF já importada em `cnefe_ceps`, a menos que `--force` (mesmo padrão de
   `ufJaImportada`).
8. Log final por UF: linhas lidas, linhas inválidas, CEPs únicos, tempo.

## 3. Atualizar a cascata para tentar CEP antes de município

Em `packages/shared/src/geocoding.ts`:

1. Adicione ao `GeocodeCompanyDeps` uma função `lookupCnefeCep: (cep: string) => Promise<{lat, lng} | null>`.
2. Em `geocodeCompany`, ANTES de `lookupCnefeCentroid`, extraia o CEP via
   `extractCepFromEndereco` (já existe) e tente `lookupCnefeCep`. Se resolver, retorne com
   `source: "cnefe_cep"`. Só cai pro centroide de município (renomeie a source atual `"cnefe"`
   para `"cnefe_municipio"`, deixando claro o nível) se não houver CEP extraível ou não bater em
   `cnefe_ceps`.
3. Ordem final: **CNEFE por CEP → CNEFE por município → BrasilAPI CEP → Google Geocoding**.
4. Atualize `GeocodeSource` para `"cnefe_cep" | "cnefe_municipio" | "brasilapi_cep" |
   "google_geocoding"` e ajuste todo lugar que loga/conta por source — o objeto `counts` em
   `apps/workers/src/queues/geocode-enrichment-consumer.ts` precisa do novo valor.
5. Em `geocode-enrichment-consumer.ts`, implemente `lookupCnefeCep` com
   `SELECT latitude, longitude FROM cnefe_ceps WHERE cep = $1` — direto, sem precisar do
   crosswalk de município.

## 4. Corrigir dados já enriquecidos no nível de município

1. Adicione `geocode_source VARCHAR(20) NULL` em `company_cnpj` via migration manual (se ainda não
   existir — confira antes de tentar recriar). Ajuste `persistCoords` no consumer e o script
   `geocode-cnpj.ts` para sempre gravar a fonte junto com a coordenada.
2. Crie `apps/workers/src/scripts/reenrich-municipio-level.ts`: reseta (`latitude`, `longitude`,
   `geom`, `geocode_source` → `NULL`) só os registros com `geocode_source = 'cnefe_municipio'`,
   pra que a fila de enriquecimento os pegue de novo e tenha chance de resolver por CEP dessa vez.
   Suporte `--dry-run` (mostra contagem sem aplicar) antes do modo real.

## Regras a respeitar (do CLAUDE.md)

- Rotas de API não tocam Prisma diretamente.
- `company_cnpj` só recebe `ALTER TABLE` via migration SQL manual.
- Trate custo como recurso finito — essa mudança deve reduzir ainda mais a dependência do Google,
  nunca aumentar.

Ao terminar, rode os testes (`npm test --workspace=apps/web`, `npm test --workspace=apps/workers`
se houver) e me dê um resumo: CEPs importados por UF, linhas inválidas descartadas, e quantas
empresas foram marcadas para reprocessamento.
