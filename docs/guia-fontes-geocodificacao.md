# Guia — Baixar bases e configurar acesso para geocodificação em cascata

Passo a passo para preparar as três fontes da cascata de geocodificação (CNEFE/IBGE →
BrasilAPI CEP → Google Geocoding), antes de rodar o prompt de implementação
(`docs/prompt-enriquecimento-geocodificacao.md`).

---

## 1. CNEFE (IBGE) — gratuito, sem chave, download único

O CNEFE do Censo 2022 é público, já georreferenciado, e não precisa de nenhuma API key. O link
que eu tinha passado antes mudou de lugar — o correto (confirmado agora) é este:

1. Acesse `https://ftp.ibge.gov.br/Cadastro_Nacional_de_Enderecos_para_Fins_Estatisticos/Censo_Demografico_2022/Coordenadas_enderecos/UF/`
   no navegador — essa pasta já traz o arquivo certo, com coordenadas por endereço, separado por
   UF (a pasta `Arquivos_CNEFE/` no nível acima tem os atributos completos sem coordenada
   embutida, e `Agregados_por_CEP/` é uma agregação — a que você quer é `Coordenadas_enderecos`).
2. Baixe o zip da sua UF — para São Paulo é **`35_SP.zip`** (114 MB compactado). O padrão de nome
   é `{código_IBGE_da_UF}_{sigla}.zip` (ex. `33_RJ.zip`, `31_MG.zip`).
3. Na mesma pasta (`Coordenadas_enderecos/`) tem um `Dicionario_Coordenadas_Censo2022.xls` —
   baixe também, ele documenta as colunas exatas do CSV dentro do zip (nomes de coluna podem
   variar levemente do que eu presumi no prompt de implementação — confira contra esse dicionário
   antes de escrever o script de import).
4. Extraia o `.zip` — vem um `.csv` com endereço + `LATITUDE`/`LONGITUDE` por registro, já
   georreferenciado.
5. Salve o `.csv` extraído numa pasta local que o worker consiga acessar, ex.
   `C:\radar-prospeccao-storage\cnefe\35_SP.csv`. Depois de implementado o `import-cnefe.ts`
   (passo do prompt), você roda algo como:
   ```
   npm run import:cnefe --workspace=apps/workers -- --uf=SP --file="C:\radar-prospeccao-storage\cnefe\35_SP.csv"
   ```
   (nome exato do script/flags é definido durante a implementação — ajuste conforme o que o
   Claude Code gerar).

Não precisa de conta, chave ou cadastro — é FTP público. Se quiser expandir depois, o mesmo
padrão de URL serve pra qualquer UF, só trocar o código/sigla no nome do zip.

### Importar todas as UFs de uma vez

Se decidir baixar o Brasil inteiro (~600 MB compactados, os 27 zips da pasta `UF/`), o jeito mais
prático é:

1. Baixe todos os 27 `.zip` da pasta `UF/` pra uma pasta local, ex. `C:\radar-prospeccao-storage\cnefe\zips\`.
2. Extraia todos, mantendo o nome original (`11_RO.csv`, `12_AC.csv`, ..., `35_SP.csv`, ...) numa
   pasta única, ex. `C:\radar-prospeccao-storage\cnefe\csv\`.
3. Rode o import em modo `--all` (incluído no prompt de implementação), apontando pra essa pasta:
   ```
   npm run import:cnefe --workspace=apps/workers -- --dir="C:\radar-prospeccao-storage\cnefe\csv" --all
   ```
   Isso varre a pasta, identifica a UF pelo nome de cada arquivo, e importa todas em sequência
   numa única execução — sem precisar rodar comando por comando.
4. Como o import é feito via `COPY` streaming (mesma técnica usada pro importador da Receita
   Federal), mesmo ~1,5-2 GB de CSV total deve importar em minutos, não horas — mas rode fora do
   horário que você estiver testando o app, só por precaução (evita competir por I/O do Postgres
   local com suas próprias buscas no Mapa).

---

## 2. BrasilAPI (CEP) — gratuito, sem chave

Nenhuma configuração necessária. É só uma chamada HTTP direta:
```
GET https://brasilapi.com.br/api/cep/v2/{cep}
```
Sem autenticação, sem variável de ambiente. Único cuidado: a BrasilAPI pede para não fazer
crawling/full-scan abusivo — como o uso aqui é sob demanda (só quando falta CEP no CNEFE local),
está dentro do uso esperado. Se mais adiante o volume crescer muito, considere hospedar um mirror
local dos dados de CEP (a BrasilAPI é open source).

---

## 3. Google Geocoding API — já configurada, só confirmar

Essa você já tem, é a mesma chave usada em `geocode-cnpj.ts`:

1. Confirme no Google Cloud Console (mesmo projeto das outras chaves) que a **Geocoding API**
   está habilitada: APIs & Services → Library → busque "Geocoding API" → Enable (se ainda não
   estiver).
2. Você pode reaproveitar a chave `GOOGLE_MAPS_API_KEY` que já existe (a mesma usada no
   `geocode-cnpj.ts` hoje) — não precisa criar uma nova, mas confirme que essa chave tem a
   Geocoding API liberada nas API restrictions dela (Console → Credentials → sua chave → API
   restrictions → adicione "Geocoding API" à lista, se não estiver).
3. Como essa é a etapa paga da cascata, mantenha o orçamento configurado na Cloudflare/Google
   Billing (Budgets & Alerts) que já orientamos no guia de deploy.

---

## Ordem recomendada de execução

1. Baixe e importe o CNEFE só de SP primeiro (cobre o teste de São Carlos e a maior parte do seu
   volume inicial de prospecção).
2. Rode o prompt de implementação (`docs/prompt-enriquecimento-geocodificacao.md`).
3. Teste uma busca no Mapa numa região de SP e confirme nos logs do worker que a maioria das
   resoluções está vindo de `cnefe` (fonte gratuita), não de `google_geocoding`.
4. Baixe e importe outras UFs conforme for expandindo a prospecção.
