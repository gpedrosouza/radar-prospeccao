-- =============================================================================
-- Migration: 20260627000001_analytics_schema
--
-- Cria o schema `analytics` e as tabelas de agregação.
--
-- REGRA ARQUITETURAL (ver CLAUDE.md regra 6):
--   Queries de UI NUNCA agregam direto sobre company_cnpj.
--   Todas as contagens e relatórios exibidos na interface leem exclusivamente
--   deste schema. A tabela bruta fica reservada para buscas paginadas com
--   filtro de uf (partition pruning).
--
-- População: npm run analytics:refresh --workspace=apps/workers
--   (rotina manual/agendada — nunca chamada por rota de API)
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS analytics;

-- ---------------------------------------------------------------------------
-- Totais por UF
-- ---------------------------------------------------------------------------
CREATE TABLE analytics.cnpj_summary_by_uf (
    uf               CHAR(2)   NOT NULL,
    total            BIGINT    NOT NULL DEFAULT 0,
    total_ativas     BIGINT    NOT NULL DEFAULT 0,
    total_com_email  BIGINT    NOT NULL DEFAULT 0,
    atualizado_em    TIMESTAMP NOT NULL,
    CONSTRAINT cnpj_summary_by_uf_pkey PRIMARY KEY (uf)
);

-- ---------------------------------------------------------------------------
-- Totais por CNAE principal
-- descricao vem de lookup_cnae (populada pelo importador)
-- ---------------------------------------------------------------------------
CREATE TABLE analytics.cnpj_summary_by_cnae (
    cnae_principal  CHAR(7)   NOT NULL,
    descricao       TEXT,
    total           BIGINT    NOT NULL DEFAULT 0,
    atualizado_em   TIMESTAMP NOT NULL,
    CONSTRAINT cnpj_summary_by_cnae_pkey PRIMARY KEY (cnae_principal)
);

-- ---------------------------------------------------------------------------
-- Totais por situação cadastral
-- ---------------------------------------------------------------------------
CREATE TABLE analytics.cnpj_summary_by_status (
    situacao      TEXT      NOT NULL,
    total         BIGINT    NOT NULL DEFAULT 0,
    atualizado_em TIMESTAMP NOT NULL,
    CONSTRAINT cnpj_summary_by_status_pkey PRIMARY KEY (situacao)
);

-- ---------------------------------------------------------------------------
-- Totais por porte da empresa
-- NULLs consolidados em 'NAO_INFORMADO' no refresh
-- ---------------------------------------------------------------------------
CREATE TABLE analytics.cnpj_summary_by_size (
    porte         TEXT      NOT NULL,
    total         BIGINT    NOT NULL DEFAULT 0,
    atualizado_em TIMESTAMP NOT NULL,
    CONSTRAINT cnpj_summary_by_size_pkey PRIMARY KEY (porte)
);

-- ---------------------------------------------------------------------------
-- Log de execuções do refresh
-- ---------------------------------------------------------------------------
CREATE TABLE analytics.refresh_log (
    id                 BIGSERIAL NOT NULL,
    tabela             TEXT      NOT NULL,
    linhas_processadas BIGINT    NOT NULL,
    duracao_ms         INTEGER   NOT NULL,
    executado_em       TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT refresh_log_pkey PRIMARY KEY (id)
);

CREATE INDEX refresh_log_tabela_executado_em_idx
    ON analytics.refresh_log (tabela, executado_em DESC);
