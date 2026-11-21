-- Migration: cnefe_municipio_centroides
--
-- Primeira etapa (mais barata) da cascata de geocodificação sob demanda
-- (CLAUDE.md § "Estratégia de geocodificação / enriquecimento externo").
--
-- DESVIO DO DESENHO ORIGINAL — registrado aqui por transparência:
-- o pedido original previa uma tabela `cnefe_enderecos` com cep, tipo_logradouro,
-- logradouro, numero, bairro (lookup por CEP). Investigação do dataset real do
-- IBGE (Coordenadas_enderecos/UF/, Censo 2022, conferido contra
-- Dicionario_Coordenadas_Censo2022.xls) mostrou que esse arquivo só tem
-- COD_UF, COD_MUN, COD_ESPECIE, LATITUDE, LONGITUDE, NV_GEO_COORD — sem CEP
-- nem campos de logradouro. A pasta irmã Agregados_por_CEP/ tem CEP mas é
-- estatística demográfica (contagem de domicílios/estabelecimentos), sem
-- nenhuma coordenada. Não existe, nos produtos públicos prontos do IBGE, um
-- arquivo de "coordenada por CEP" — só dá pra montar isso fazendo join com
-- Arquivos_CNEFE (atributos completos, também sem coordenada embutida), o que
-- fica fora do escopo desta migration.
--
-- Por isso a tabela guarda um CENTROIDE POR MUNICÍPIO (uf + codigo_municipio,
-- código IBGE — mesmo esquema de cities.codigo_ibge), calculado a partir da
-- média de todos os pontos de endereço do CNEFE naquele município. Precisão
-- de cidade, não de bairro/CEP — ainda assim zero custo por consulta e válido
-- como primeira tentativa da cascata antes de BrasilAPI/Google.
--
-- 111M+ registros de endereço no Brasil inteiro (Coordenadas_enderecos) seriam
-- caros de armazenar e indexar só para depois agregar em ~5.570 centroides —
-- a agregação é feita em apps/workers/src/scripts/import-cnefe.ts durante a
-- leitura em streaming do CSV, e só o centroide final é persistido aqui.

CREATE TABLE "cnefe_municipio_centroides" (
    "id"               SERIAL           NOT NULL,
    "uf"               CHAR(2)          NOT NULL,
    "codigo_municipio" INTEGER          NOT NULL,
    "total_enderecos"  INTEGER          NOT NULL,
    "latitude"         DOUBLE PRECISION NOT NULL,
    "longitude"        DOUBLE PRECISION NOT NULL,
    "geom"             GEOGRAPHY(POINT, 4326) NOT NULL,
    "criado_em"        TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cnefe_municipio_centroides_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cnefe_municipio_centroides_uf_codigo_municipio_key"
    ON "cnefe_municipio_centroides" ("uf", "codigo_municipio");

CREATE INDEX "idx_cnefe_municipio_centroides_geom"
    ON "cnefe_municipio_centroides" USING GIST ("geom");
