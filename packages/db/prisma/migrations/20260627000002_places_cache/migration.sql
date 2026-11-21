-- Migration: places_cache
-- Cache de resultados do Google Places API indexado por célula de grid geográfico.
-- TTL gerenciado pela aplicação (campo expira_em); cleanup via cron/script worker.

CREATE TABLE places_cache (
  id            UUID          NOT NULL DEFAULT gen_random_uuid(),
  grid_cell_key TEXT          NOT NULL,
  keyword       TEXT          NOT NULL DEFAULT '',
  resultado     JSONB         NOT NULL,
  criado_em     TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expira_em     TIMESTAMP(3)  NOT NULL,

  CONSTRAINT places_cache_pkey PRIMARY KEY (id)
);

-- Upsert por (célula, keyword): garante uma entrada por par região+categoria.
CREATE UNIQUE INDEX places_cache_cell_keyword_key
  ON places_cache (grid_cell_key, keyword);

-- Varredura eficiente para cleanup de entradas expiradas.
CREATE INDEX places_cache_expira_em_idx
  ON places_cache (expira_em);
