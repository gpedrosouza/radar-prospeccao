-- Migration: company_cnpj.geocode_source
--
-- Registra qual etapa da cascata resolveu a coordenada de cada CNPJ
-- (cnefe_cep | cnefe_municipio | brasilapi_cep | google_geocoding). Sem
-- isso não dá pra identificar depois quais registros foram geocodificados
-- só no nível de município (antes de cnefe_ceps existir) para reprocessar
-- com a fonte mais precisa agora disponível — ver
-- apps/workers/src/scripts/reenrich-municipio-level.ts.
--
-- company_cnpj é particionada por LIST(uf) — ALTER TABLE no pai propaga
-- automaticamente para as 27 partições, sem precisar de loop manual.

ALTER TABLE "company_cnpj" ADD COLUMN "geocode_source" VARCHAR(20);
