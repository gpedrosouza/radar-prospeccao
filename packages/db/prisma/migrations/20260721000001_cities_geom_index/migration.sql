-- Migration: coluna geom + índice GIST em cities
--
-- findWithinRadius (busca por raio na tela de Mapa) construía
-- ST_MakePoint(longitude, latitude) linha a linha via $queryRaw, sem coluna
-- geom nem índice espacial — cada busca por raio forçava um seq scan em toda
-- a tabela cities, recalculando a geography de cada linha a cada chamada.
-- Persiste geom (mesmo padrão de company_cnpj.geom) e indexa com GIST para
-- que ST_DWithin use o índice em vez de varrer a tabela inteira.

ALTER TABLE "cities" ADD COLUMN "geom" GEOGRAPHY(POINT, 4326);

UPDATE "cities"
SET "geom" = ST_SetSRID(ST_MakePoint("longitude", "latitude"), 4326)::geography;

CREATE INDEX idx_cities_geom ON "cities" USING GIST ("geom");
