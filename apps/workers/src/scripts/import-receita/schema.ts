import { query } from "./db.js";

/**
 * Cria todas as tabelas de lookup (dicionários permanentes) e staging
 * (temporárias para a carga) caso ainda não existam.
 *
 * As tabelas staging_* ficam disponíveis após a carga para auditoria.
 * A tabela staging_socio é semi-permanente: Sócios não têm tabela
 * definitiva no schema atual — ela pode ser promovida a uma migration
 * quando necessário.
 */
export async function ensureSchema(): Promise<void> {
  await query(`
    -- Tabelas de lookup (dicionários da Receita Federal)
    CREATE TABLE IF NOT EXISTS lookup_cnae (
      codigo      CHAR(7) PRIMARY KEY,
      descricao   TEXT    NOT NULL
    );

    -- Hierarquia da CNAE 2.0 (IBGE), nível classe. Não vem da Receita: é
    -- populada por packages/db/seeds/import-cnae-estrutura.ts a partir de um
    -- CSV versionado. lookup_cnae acima é subclasse (7 díg); a classe são os
    -- 5 primeiros dígitos, e é por ela que se chega a grupo/divisão/seção.
    CREATE TABLE IF NOT EXISTS lookup_cnae_estrutura (
      classe       CHAR(5) PRIMARY KEY,
      classe_desc  TEXT NOT NULL,
      grupo        CHAR(3),
      grupo_desc   TEXT,
      divisao      CHAR(2),
      divisao_desc TEXT,
      secao        CHAR(1),
      secao_desc   TEXT
    );

    CREATE TABLE IF NOT EXISTS lookup_natureza_juridica (
      codigo      CHAR(4) PRIMARY KEY,
      descricao   TEXT    NOT NULL
    );

    -- Municípios da RF (distinto de "cities" que vem do IBGE/operação)
    CREATE TABLE IF NOT EXISTS lookup_municipio_rf (
      codigo      CHAR(7) PRIMARY KEY,
      descricao   TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lookup_pais (
      codigo      CHAR(3) PRIMARY KEY,
      descricao   TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lookup_qualificacao (
      codigo      CHAR(2) PRIMARY KEY,
      descricao   TEXT    NOT NULL
    );

    -- Staging de Empresas (CNPJ básico + dados cadastrais)
    CREATE TABLE IF NOT EXISTS staging_empresa (
      cnpj_basico              CHAR(8) NOT NULL,
      razao_social             TEXT    NOT NULL,
      natureza_juridica        CHAR(4),
      qualificacao_responsavel CHAR(2),
      capital_social           TEXT,
      porte                    CHAR(2),
      ente_federativo          TEXT
    );

    -- Staging de Simples Nacional / MEI
    CREATE TABLE IF NOT EXISTS staging_simples (
      cnpj_basico          CHAR(8) NOT NULL,
      opcao_simples        CHAR(1),
      data_opcao_simples   TEXT,
      data_exclusao_simples TEXT,
      opcao_mei            CHAR(1),
      data_opcao_mei       TEXT,
      data_exclusao_mei    TEXT
    );

    -- Staging de Estabelecimentos (todos os 30 campos do CSV)
    CREATE TABLE IF NOT EXISTS staging_estabelecimento (
      cnpj_basico              CHAR(8) NOT NULL,
      cnpj_ordem               CHAR(4) NOT NULL,
      cnpj_dv                  CHAR(2) NOT NULL,
      identificador_mf         CHAR(1),
      nome_fantasia            TEXT,
      situacao_cadastral       CHAR(2),
      data_situacao_cadastral  TEXT,
      motivo_situacao_cadastral TEXT,
      nome_cidade_exterior     TEXT,
      pais                     TEXT,
      data_inicio_atividade    TEXT,
      cnae_principal           CHAR(7),
      cnae_secundario          TEXT,
      tipo_logradouro          TEXT,
      logradouro               TEXT,
      numero                   TEXT,
      complemento              TEXT,
      bairro                   TEXT,
      cep                      CHAR(8),
      uf                       CHAR(2),
      municipio_codigo         TEXT,
      ddd1                     TEXT,
      telefone1                TEXT,
      ddd2                     TEXT,
      telefone2                TEXT,
      ddd_fax                  TEXT,
      fax                      TEXT,
      email                    TEXT,
      situacao_especial        TEXT,
      data_situacao_especial   TEXT
    );

    -- Sócios (semi-permanente até migration formal)
    CREATE TABLE IF NOT EXISTS staging_socio (
      cnpj_basico              CHAR(8) NOT NULL,
      identificador_socio      CHAR(1),
      nome_socio_razao_social  TEXT,
      cpf_cnpj_socio           TEXT,
      qualificacao_socio       CHAR(2),
      data_entrada_sociedade   TEXT,
      pais                     TEXT,
      representante_legal      TEXT,
      nome_representante       TEXT,
      qualificacao_representante CHAR(2),
      faixa_etaria             CHAR(1)
    );

    -- QSA agregado: uma linha por cnpj_basico presente em company_cnpj.
    --
    -- Existe para que a listagem e a exportação nunca façam JOIN linha a linha
    -- contra staging_socio (24M linhas, várias por empresa). O passo socios-agg
    -- do importador resolve o decisor e as flags uma vez, em SQL, e a leitura
    -- vira um único lookup por cnpj_basico.
    --
    -- LGPD: guarda apenas o NOME do administrador e agregados. cpf_cnpj_socio
    -- nunca é copiado para cá — ele fica restrito a staging_socio, usado só
    -- como chave interna do grupo econômico.
    CREATE TABLE IF NOT EXISTS company_socio_agg (
      cnpj_basico             CHAR(8) PRIMARY KEY,
      qtd_socios              INT  NOT NULL DEFAULT 0,
      socio_administrador     TEXT,
      qualificacao_admin      TEXT,
      tem_socio_estrangeiro   BOOLEAN NOT NULL DEFAULT FALSE,
      tem_socio_pj            BOOLEAN NOT NULL DEFAULT FALSE,
      data_entrada_admin      DATE
    );

    -- CNAEs secundários, normalizados: uma linha por (CNPJ, CNAE).
    --
    -- A Receita publica a lista como um único campo TEXT com códigos separados
    -- por vírgula (campo 12 do CSV de Estabelecimentos), que o passo cnae-sec
    -- explode aqui. Tabela própria, unida por CNPJ em tempo de leitura:
    -- company_cnpj é particionada e não é tocada (CLAUDE.md regra 3).
    --
    -- Só CNPJs presentes em company_cnpj entram — o CSV cobre a base inteira
    -- da Receita, inclusive baixadas e MEI, que o importador descarta.
    CREATE TABLE IF NOT EXISTS company_cnae_secundario (
      cnpj  CHAR(14) NOT NULL,
      cnae  CHAR(7)  NOT NULL,
      PRIMARY KEY (cnpj, cnae)
    );

    -- Redundante com o prefixo da PK, mas barato e explícito: toda leitura é
    -- "os secundários deste CNPJ".
    CREATE INDEX IF NOT EXISTS idx_cnae_sec_cnpj
      ON company_cnae_secundario (cnpj);
  `);
}

export async function truncateStagingEmpresa(): Promise<void> {
  await query("TRUNCATE TABLE staging_empresa");
}

export async function truncateStagingSimples(): Promise<void> {
  await query("TRUNCATE TABLE staging_simples");
}

export async function truncateStagingEstabelecimento(): Promise<void> {
  await query("TRUNCATE TABLE staging_estabelecimento");
}

export async function truncateStagingSocio(): Promise<void> {
  await query("TRUNCATE TABLE staging_socio");
}

export async function truncateLookup(
  table:
    | "lookup_cnae"
    | "lookup_natureza_juridica"
    | "lookup_municipio_rf"
    | "lookup_pais"
    | "lookup_qualificacao",
): Promise<void> {
  await query(`TRUNCATE TABLE ${table}`);
}

/** Cria índices nas staging tables APÓS a carga (mais rápido do que durante). */
export async function indexStagingTables(): Promise<void> {
  await query(`
    CREATE INDEX IF NOT EXISTS idx_staging_empresa_cnpj
      ON staging_empresa (cnpj_basico);

    CREATE INDEX IF NOT EXISTS idx_staging_simples_cnpj
      ON staging_simples (cnpj_basico);

    CREATE INDEX IF NOT EXISTS idx_staging_estab_cnpj
      ON staging_estabelecimento (cnpj_basico);

    -- Sem este índice o passo socios-agg e a matview de grupo econômico
    -- varrem staging_socio inteira a cada junção por cnpj_basico.
    CREATE INDEX IF NOT EXISTS idx_staging_socio_cnpj
      ON staging_socio (cnpj_basico);
  `);
}

export async function dropStagingIndexes(): Promise<void> {
  await query(`
    DROP INDEX IF EXISTS idx_staging_empresa_cnpj;
    DROP INDEX IF EXISTS idx_staging_simples_cnpj;
    DROP INDEX IF EXISTS idx_staging_estab_cnpj;
    DROP INDEX IF EXISTS idx_staging_socio_cnpj;
  `);
}
