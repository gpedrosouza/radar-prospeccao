-- =============================================================================
-- Migration: 20260901000001_company_cnae_secundario
--
-- CNAEs secundários — as atividades que a empresa declara além da principal.
-- Refinam a fronteira B2B/B2C, hoje decidida por um único código: revelam quem
-- faz atacado E varejo, ou indústria que também vende no balcão.
--
-- REGRA ARQUITETURAL (CLAUDE.md regra 3):
--   company_cnpj NÃO é tocada — nenhuma coluna nova, nenhum ALTER. Ela é
--   particionada por LIST(uf) e qualquer alteração exigiria DDL manual nas 27
--   partições. Os secundários vivem em tabela própria, unida por CNPJ em tempo
--   de leitura (ver packages/db/src/repositories/cnae-secundario-lookup.ts).
--
-- Modelagem normalizada — uma linha por (CNPJ, CNAE) — e não um array ou uma
-- string com vírgulas como a Receita publica: só assim "tem secundário no
-- setor X" é um lookup indexado em vez de um LIKE sobre texto livre.
--
-- Repetida com IF NOT EXISTS em apps/workers/.../import-receita/schema.ts, pelo
-- mesmo motivo de company_socio_agg na migration anterior: `db:deploy` num
-- banco limpo precisa da tabela antes de qualquer importação, e o importador
-- precisa dela mesmo se rodar antes das migrations. Quem rodar primeiro cria,
-- o outro é no-op. As duas definições são idênticas.
--
-- População: passo `cnae-sec` do importador, que roda logo após
-- `estabelecimentos` (staging_estabelecimento é truncada a cada carga, e é ela
-- que carrega a lista bruta):
--   RECEITA_IMPORT_ONLY=all npm run import:receita --workspace=apps/workers
-- =============================================================================

CREATE TABLE IF NOT EXISTS company_cnae_secundario (
  cnpj  CHAR(14) NOT NULL,
  cnae  CHAR(7)  NOT NULL,
  PRIMARY KEY (cnpj, cnae)
);

-- Redundante com o prefixo da PK, mas barato e explícito: toda leitura é
-- "os secundários deste CNPJ".
CREATE INDEX IF NOT EXISTS idx_cnae_sec_cnpj
  ON company_cnae_secundario (cnpj);
