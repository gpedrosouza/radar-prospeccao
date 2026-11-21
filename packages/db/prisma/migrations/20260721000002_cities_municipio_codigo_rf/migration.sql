-- Migration: cities.municipio_codigo_rf
--
-- company_cnpj.municipio_codigo usa a tabela de municípios própria da Receita
-- Federal (TOM — lookup_municipio_rf), numerada de forma independente do
-- código IBGE (cities.codigo_ibge). São dois sistemas de código diferentes
-- para os mesmos municípios (ex: São Carlos/SP = 3548906 no IBGE, 7079 na
-- Receita) — sem esse crosswalk, filtrar company_cnpj por codigo_ibge nunca
-- retorna nada.
--
-- Casamento feito por nome+UF normalizados em
-- apps/workers/src/scripts/match-municipio-codigo-rf.ts (não dá para casar
-- via SQL puro de forma confiável por causa de acentuação/grafia).

ALTER TABLE "cities" ADD COLUMN "municipio_codigo_rf" INTEGER;
