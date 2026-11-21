# Prompt para Claude Code — Geocodificação sob demanda com cascata de fontes

Cole o bloco abaixo no Claude Code, dentro do repositório do projeto. Pré-requisito: já deve ter
sido feito o download do CNEFE da sua UF de interesse (ver `docs/guia-fontes-geocodificacao.md`
para o passo a passo de download).

---

Quero implementar geocodificação sob demanda para `company_cnpj`, substituindo a dependência
única do Google Geocoding API por uma cascata de fontes, do mais barato pro mais caro, seguindo
a seção "Estratégia de geocodificação / enriquecimento externo" do `CLAUDE.md` (leia antes de
começar). Hoje só existe o script manual `apps/workers/src/scripts/geocode-cnpj.ts`, que geocodifica
em lote controlado só via Google — quero mantê-lo funcionando, mas adicionar as fontes mais baratas
antes dele na cascata, e conectar isso a um fluxo automático disparado pelas buscas do Mapa.

## 1. Tabela de lookup do CNEFE (IBGE)

1. Crie uma migration SQL manual em `packages/db/prisma/migrations/` (mesmo padrão da migration
   inicial em `packages/db/prisma/migrations/20260626000001_init/migration.sql`) criando uma
   tabela `cnefe_enderecos` com colunas: `id`, `uf`, `codigo_municipio`, `cep`, `tipo_logradouro`,
   `logradouro`, `numero`, `bairro`, `latitude`, `longitude`, `geom GEOGRAPHY(POINT,4326)`, com
   índice em `cep` (btree) e GIST em `geom`. Modele como tabela normal (não particionada) por
   enquanto — se crescer demais depois, particionar por UF seguindo o mesmo padrão de
   `company_cnpj`.
2. Adicione o model correspondente em `schema.prisma` e rode `npm run db:generate --workspace=packages/db`.
3. Crie um script de import em `apps/workers/src/scripts/import-cnefe.ts` que lê os CSVs do CNEFE
   já baixados localmente (fonte: pasta `Coordenadas_enderecos/UF/` do IBGE, ver
   `docs/guia-fontes-geocodificacao.md`). **Antes de mapear as colunas, abra o arquivo
   `Dicionario_Coordenadas_Censo2022.xls` baixado junto** — os nomes de coluna exatos do CSV
   variam ligeiramente entre edições do CNEFE, então confirme contra o dicionário em vez de
   assumir nomes. Espere encontrar algo equivalente a: código de UF, código de município, CEP,
   tipo/título/nome de logradouro, número, bairro, latitude, longitude. Faça `COPY` streaming
   para `cnefe_enderecos`, no mesmo estilo de streaming usado em
   `apps/workers/src/scripts/import-receita/csv-copy.ts` (reaproveite o padrão, não duplique
   lógica se der pra extrair um helper compartilhado).
4. O script deve aceitar dois modos de uso:
   - **Uma UF só**: `--uf=SP --file="C:\...\35_SP.csv"` (importa um arquivo específico).
   - **Todas de uma vez**: `--dir="C:\radar-prospeccao-storage\cnefe" --all` — varre a pasta
     procurando todos os CSVs já extraídos (nomeie os arquivos extraídos mantendo o prefixo do
     código IBGE, ex. `35_SP.csv`, `33_RJ.csv`, deduza a UF do nome do arquivo), e importa cada um
     em sequência, logando progresso por UF (quantos registros, tempo, erros) e continuando para
     a próxima mesmo se uma UF falhar (não travar o import inteiro por causa de 1 CSV malformado).
   - Idempotência: se rodar `--all` de novo depois de já ter importado algumas UFs, pule as que já
     tiverem registros em `cnefe_enderecos` para aquela UF (ou aceite um `--force` para reimportar).

## 2. Serviço de geocodificação em cascata

**Importante — leia antes de implementar:** `company_cnpj` NÃO tem uma coluna `cep` separada.
Veja `apps/workers/src/scripts/import-receita/loaders/estabelecimentos.ts` (em torno da linha
186): o campo `endereco` é uma única string concatenada via `CONCAT_WS(' ', tipo_logradouro,
logradouro, numero, complemento, bairro, cep)` — o CEP é sempre o último token, sempre 8 dígitos.
Não há como alterar isso retroativamente sem reprocessar os ~15-20M de registros já importados
(fora de escopo aqui). Portanto, o casamento com o CNEFE (que é indexado por CEP) precisa
extrair o CEP de dentro dessa string.

Crie `apps/web/src/server/services/geocoding.service.ts` (ou em `packages/shared` se fizer mais
sentido ser usado tanto por `apps/web` quanto por `apps/workers` — decida e justifique) com:

1. Uma função utilitária `extractCepFromEndereco(endereco: string): string | null` — regex que
   pega os últimos 8 dígitos consecutivos da string (ex. `/(\d{8})\s*$/`), validando que é um CEP
   plausível (não aceitar `00000000`). Cubra com teste unitário casos sem CEP, CEP no meio da
   string por erro de dado, etc.
2. Uma função `geocodeCompany(input: { endereco: string | null, municipio: string, uf: string })`
   que tenta, na ordem, e retorna assim que uma fonte resolver:
   - **CNEFE local**: extrai o CEP via `extractCepFromEndereco`; se achou CEP, busca em
     `cnefe_enderecos` por `cep` (match exato). Se houver mais de um resultado pro mesmo CEP, use
     o centroide (não dá pra casar por número de rua com confiança, já que `endereco` é uma string
     livre, não campos estruturados — documente essa limitação no código).
   - **BrasilAPI CEP** (`https://brasilapi.com.br/api/cep/v2/{cep}`, sem chave): se o CEP existir
     mas não bater no CNEFE local, chama a API. Trate ausência de coordenada na resposta como "não
     resolvido".
   - **Google Geocoding API** (`GOOGLE_MAPS_API_KEY`): fallback final — quando não há CEP
     extraível OU as duas fontes acima falharem. Reaproveite a lógica de `geocode()` e
     `buildAddress()` já existentes em `geocode-cnpj.ts` (extraia para um módulo compartilhado em
     vez de duplicar), que já usa a string `endereco` completa + município/UF como texto livre.

Cada resultado deve vir marcado com a fonte (`"cnefe" | "brasilapi_cep" | "google_geocoding"`)
para telemetria/custo — logue quantas resoluções vieram de cada fonte.

## 3. Fila de enriquecimento sob demanda

1. Siga o padrão de `apps/web/src/server/queues/export-queue.ts` (producer) e
   `apps/workers/src/queues/export-queue-consumer.ts` (consumer) para criar uma fila BullMQ nova
   `geocode-enrichment`.
2. Em `apps/web/src/app/api/cnpj/companies/route.ts`, depois de responder a busca, identifique os
   `id`/`uf` dos CNPJs retornados que estão com `latitude IS NULL` e enfileire um job de
   enriquecimento (só os IDs, não o payload completo) — fire-and-forget, sem bloquear a resposta
   ao usuário.
3. O consumer em `apps/workers` processa o job chamando `geocodeCompany` (com `endereco`,
   `municipio_nome`, `uf` de cada CNPJ, buscados do banco pelo `id`/`uf` recebido no job) pra cada
   CNPJ da lista,
   respeitando um delay entre chamadas (reaproveite `CNPJ_GEOCODE_DELAY_MS`) e um teto de chamadas
   pagas (Google) por job, configurável via env (`GEOCODE_ENRICHMENT_GOOGLE_CAP_PER_JOB`, default
   baixo, tipo 20) — nunca deixe a fila estourar orçamento sozinha.
4. Persista os resultados com `UPDATE ... WHERE id = $1 AND uf = $2` (partition-safe, mesmo padrão
   de `updateCoords` em `geocode-cnpj.ts`).
5. Idempotência: se dois jobs pedirem geocodificação do mesmo CNPJ (buscas concorrentes na mesma
   região), o segundo deve pular quem já foi resolvido nesse meio tempo — confira `latitude IS
   NULL` de novo dentro do consumer antes de gastar uma chamada.

## 4. Variáveis de ambiente novas

Adicione ao `.env.example`, `.env.production.example` e à seção de env do `CLAUDE.md`:
```
CNEFE_IMPORTED_UFS=          # UFs já importadas localmente, informativo
GEOCODE_ENRICHMENT_GOOGLE_CAP_PER_JOB=20
```

## Regras a respeitar (do CLAUDE.md)

- Rotas de API não tocam Prisma diretamente — `route handler → services → repositories → Prisma`.
- Jobs longos sempre via fila BullMQ, nunca síncrono numa rota.
- `company_cnpj` só recebe `ALTER TABLE` via migration SQL manual, nunca `prisma migrate dev`.
- Trate custo como recurso finito: nunca implemente um caminho que geocodifique em massa sem
  cap/limite explícito.

Ao terminar, rode `npm test --workspace=apps/web` e `npm test --workspace=apps/workers` (se
houver), e me dê um resumo dos arquivos alterados/criados e de quantas chamadas Google essa
mudança evita, comparando uma busca típica antes/depois.
