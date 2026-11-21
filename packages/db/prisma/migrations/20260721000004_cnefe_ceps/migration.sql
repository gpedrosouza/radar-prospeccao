-- Migration: cnefe_ceps
--
-- Segunda fonte (mais precisa que cnefe_municipio_centroides) da cascata de
-- geocodificação sob demanda. Diferente de Coordenadas_enderecos (usado em
-- cnefe_municipio_centroides — ver migration 20260721000003), o dataset
-- Arquivos_CNEFE do IBGE (pasta cnefe/cnefe_correto/) tem CEP e
-- LATITUDE/LONGITUDE na mesma linha — confirmado tanto no header real de
-- múltiplos arquivos de UF quanto no dicionário oficial
-- (Dicionario_CNEFE_Censo_2022.xls). Não precisa de join com outro dataset.
--
-- Guarda um centroide por CEP (média de todos os pontos de endereço daquele
-- CEP no CNEFE), populado por apps/workers/src/scripts/import-cnefe-ceps.ts.
-- Precisão de CEP — mais fina que o centroide por município, mais grosseira
-- que número de porta (o CNEFE tem número de porta, mas company_cnpj.endereco
-- é uma string livre sem estrutura confiável pra casar por número — ver
-- geocoding.ts).

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
