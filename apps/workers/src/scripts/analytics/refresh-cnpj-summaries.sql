-- =============================================================================
-- refresh-cnpj-summaries.sql
--
-- Recalcula todas as tabelas do schema `analytics` a partir de company_cnpj.
--
-- !! ATENÇÃO — NÃO CHAMAR A PARTIR DE ROTAS DE API !!
-- Este script varre a tabela bruta inteira (~20M+ linhas em produção) e
-- bloqueia cada tabela analytics com TRUNCATE durante a execução.
-- Deve ser executado APENAS:
--   - Manualmente pelo operador após carga de dados
--   - Por um cron job externo fora do ciclo de requisição HTTP
--   - Via: npm run analytics:refresh --workspace=apps/workers
--
-- Requer que o importador (import:receita) tenha sido executado pelo menos
-- uma vez para que lookup_cnae e company_cnpj existam com dados.
-- =============================================================================

-- =============================================================================
-- 1. cnpj_summary_by_uf
-- =============================================================================
DO $$
DECLARE
  v_start  TIMESTAMPTZ := clock_timestamp();
  v_rows   BIGINT;
  v_ms     INTEGER;
BEGIN
  TRUNCATE analytics.cnpj_summary_by_uf;

  INSERT INTO analytics.cnpj_summary_by_uf
        (uf, total, total_ativas, total_com_email, atualizado_em)
  SELECT
    uf,
    COUNT(*)                                                        AS total,
    COUNT(*) FILTER (WHERE situacao = 'Ativa')                     AS total_ativas,
    COUNT(*) FILTER (WHERE email IS NOT NULL AND TRIM(email) <> '') AS total_com_email,
    clock_timestamp()
  FROM company_cnpj
  GROUP BY uf;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000;

  INSERT INTO analytics.refresh_log (tabela, linhas_processadas, duracao_ms, executado_em)
  VALUES ('cnpj_summary_by_uf', v_rows, v_ms, NOW());

  RAISE NOTICE 'cnpj_summary_by_uf: % linhas em % ms', v_rows, v_ms;
END;
$$;

-- =============================================================================
-- 2. cnpj_summary_by_cnae
-- LEFT JOIN com lookup_cnae (public.lookup_cnae, populada pelo importador).
-- descricao será NULL se o importador ainda não carregou os dicionários.
-- =============================================================================
DO $$
DECLARE
  v_start  TIMESTAMPTZ := clock_timestamp();
  v_rows   BIGINT;
  v_ms     INTEGER;
BEGIN
  TRUNCATE analytics.cnpj_summary_by_cnae;

  INSERT INTO analytics.cnpj_summary_by_cnae
        (cnae_principal, descricao, total, atualizado_em)
  SELECT
    c.cnae_principal,
    l.descricao,
    COUNT(*)          AS total,
    clock_timestamp() AS atualizado_em
  FROM company_cnpj c
  LEFT JOIN lookup_cnae l ON l.codigo = c.cnae_principal
  GROUP BY c.cnae_principal, l.descricao;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000;

  INSERT INTO analytics.refresh_log (tabela, linhas_processadas, duracao_ms, executado_em)
  VALUES ('cnpj_summary_by_cnae', v_rows, v_ms, NOW());

  RAISE NOTICE 'cnpj_summary_by_cnae: % linhas em % ms', v_rows, v_ms;
END;
$$;

-- =============================================================================
-- 3. cnpj_summary_by_status
-- =============================================================================
DO $$
DECLARE
  v_start  TIMESTAMPTZ := clock_timestamp();
  v_rows   BIGINT;
  v_ms     INTEGER;
BEGIN
  TRUNCATE analytics.cnpj_summary_by_status;

  INSERT INTO analytics.cnpj_summary_by_status
        (situacao, total, atualizado_em)
  SELECT
    situacao,
    COUNT(*)          AS total,
    clock_timestamp() AS atualizado_em
  FROM company_cnpj
  GROUP BY situacao;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000;

  INSERT INTO analytics.refresh_log (tabela, linhas_processadas, duracao_ms, executado_em)
  VALUES ('cnpj_summary_by_status', v_rows, v_ms, NOW());

  RAISE NOTICE 'cnpj_summary_by_status: % linhas em % ms', v_rows, v_ms;
END;
$$;

-- =============================================================================
-- 4. cnpj_summary_by_size
-- porte pode ser NULL em company_cnpj — consolidado como 'NAO_INFORMADO'.
-- =============================================================================
DO $$
DECLARE
  v_start  TIMESTAMPTZ := clock_timestamp();
  v_rows   BIGINT;
  v_ms     INTEGER;
BEGIN
  TRUNCATE analytics.cnpj_summary_by_size;

  INSERT INTO analytics.cnpj_summary_by_size
        (porte, total, atualizado_em)
  SELECT
    COALESCE(porte, 'NAO_INFORMADO') AS porte,
    COUNT(*)                          AS total,
    clock_timestamp()                 AS atualizado_em
  FROM company_cnpj
  GROUP BY COALESCE(porte, 'NAO_INFORMADO');

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000;

  INSERT INTO analytics.refresh_log (tabela, linhas_processadas, duracao_ms, executado_em)
  VALUES ('cnpj_summary_by_size', v_rows, v_ms, NOW());

  RAISE NOTICE 'cnpj_summary_by_size: % linhas em % ms', v_rows, v_ms;
END;
$$;
