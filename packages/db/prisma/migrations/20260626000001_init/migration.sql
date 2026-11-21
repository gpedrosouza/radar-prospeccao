-- =============================================================================
-- Migration: 20260626000001_init
-- Criação inicial do schema do Radar Prospecção.
--
-- ATENÇÃO: a tabela company_cnpj é particionada por LIST(uf) e NÃO é gerada
-- automaticamente pelo Prisma. Qualquer alteração estrutural nessa tabela
-- deve seguir o processo manual descrito no README.
-- =============================================================================

-- PostGIS já habilitado pela imagem postgis/postgis, mas explicitamos aqui
-- para que a migration seja reproduzível em qualquer setup.
CREATE EXTENSION IF NOT EXISTS postgis;

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------

CREATE TYPE "UserRole" AS ENUM ('banker', 'admin');
CREATE TYPE "CityCategory" AS ENUM ('cidade', 'municipio', 'distrito');
CREATE TYPE "ExportJobStatus" AS ENUM ('queued', 'running', 'completed', 'failed');

-- -----------------------------------------------------------------------------
-- users
-- -----------------------------------------------------------------------------

CREATE TABLE "users" (
    "id"         UUID        NOT NULL DEFAULT gen_random_uuid(),
    "nome"       TEXT        NOT NULL,
    "email"      TEXT        NOT NULL,
    "senha_hash" TEXT        NOT NULL,
    "papel"      "UserRole"  NOT NULL DEFAULT 'banker',
    "criado_em"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_email_key" ON "users" ("email");

-- -----------------------------------------------------------------------------
-- cities
-- -----------------------------------------------------------------------------

CREATE TABLE "cities" (
    "id"                SERIAL          NOT NULL,
    "codigo_ibge"       INTEGER         NOT NULL,
    "nome"              TEXT            NOT NULL,
    "uf"                CHAR(2)         NOT NULL,
    "categoria"         "CityCategory"  NOT NULL DEFAULT 'municipio',
    "municipio_sede_id" INTEGER,
    "latitude"          DOUBLE PRECISION NOT NULL,
    "longitude"         DOUBLE PRECISION NOT NULL,
    CONSTRAINT "cities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cities_codigo_ibge_key" ON "cities" ("codigo_ibge");

ALTER TABLE "cities"
    ADD CONSTRAINT "cities_municipio_sede_id_fkey"
    FOREIGN KEY ("municipio_sede_id") REFERENCES "cities" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- -----------------------------------------------------------------------------
-- cnpj_export_jobs
-- -----------------------------------------------------------------------------

CREATE TABLE "cnpj_export_jobs" (
    "id"            UUID              NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id"    UUID              NOT NULL,
    "filtros"       JSONB             NOT NULL,
    "status"        "ExportJobStatus" NOT NULL DEFAULT 'queued',
    "linhas"        INTEGER,
    "tamanho_bytes" BIGINT,
    "storage_key"   TEXT,
    "progresso_pct" SMALLINT          NOT NULL DEFAULT 0,
    "erro"          TEXT,
    "criado_em"     TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "concluido_em"  TIMESTAMP(3),
    CONSTRAINT "cnpj_export_jobs_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "cnpj_export_jobs"
    ADD CONSTRAINT "cnpj_export_jobs_usuario_id_fkey"
    FOREIGN KEY ("usuario_id") REFERENCES "users" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- =============================================================================
-- company_cnpj — tabela particionada (gerenciada fora do Prisma)
-- =============================================================================

-- Sequence global compartilhada por todas as 27 partições.
-- BIGSERIAL por partição não serve aqui: geraria sequências independentes.
CREATE SEQUENCE company_cnpj_id_seq;

CREATE TABLE company_cnpj (
    id                BIGINT           NOT NULL DEFAULT nextval('company_cnpj_id_seq'),
    cnpj              CHAR(14)         NOT NULL,
    razao_social      TEXT             NOT NULL,
    nome_fantasia     TEXT,
    uf                CHAR(2)          NOT NULL,
    municipio_codigo  INTEGER          NOT NULL,
    municipio_nome    TEXT             NOT NULL,
    cnae_principal    CHAR(7)          NOT NULL,
    situacao          TEXT             NOT NULL,
    porte             TEXT,
    natureza_juridica TEXT,
    matriz_filial     TEXT,
    opcao_simples     BOOLEAN          NOT NULL DEFAULT FALSE,
    opcao_mei         BOOLEAN          NOT NULL DEFAULT FALSE,
    data_abertura     DATE,
    capital_social    DECIMAL(15, 2),
    email             TEXT,
    telefone          TEXT,
    endereco          TEXT,
    latitude          DOUBLE PRECISION,
    longitude         DOUBLE PRECISION,
    geom              GEOGRAPHY(POINT, 4326),
    criado_em         TIMESTAMP(3)     NOT NULL DEFAULT NOW(),
    atualizado_em     TIMESTAMP(3)     NOT NULL DEFAULT NOW(),
    -- PK composta: partitioned tables exigem a partition key na PK
    PRIMARY KEY (id, uf)
) PARTITION BY LIST (uf);

-- 27 partições — uma por UF do Brasil
CREATE TABLE company_cnpj_ac PARTITION OF company_cnpj FOR VALUES IN ('AC');
CREATE TABLE company_cnpj_al PARTITION OF company_cnpj FOR VALUES IN ('AL');
CREATE TABLE company_cnpj_ap PARTITION OF company_cnpj FOR VALUES IN ('AP');
CREATE TABLE company_cnpj_am PARTITION OF company_cnpj FOR VALUES IN ('AM');
CREATE TABLE company_cnpj_ba PARTITION OF company_cnpj FOR VALUES IN ('BA');
CREATE TABLE company_cnpj_ce PARTITION OF company_cnpj FOR VALUES IN ('CE');
CREATE TABLE company_cnpj_df PARTITION OF company_cnpj FOR VALUES IN ('DF');
CREATE TABLE company_cnpj_es PARTITION OF company_cnpj FOR VALUES IN ('ES');
CREATE TABLE company_cnpj_go PARTITION OF company_cnpj FOR VALUES IN ('GO');
CREATE TABLE company_cnpj_ma PARTITION OF company_cnpj FOR VALUES IN ('MA');
CREATE TABLE company_cnpj_mt PARTITION OF company_cnpj FOR VALUES IN ('MT');
CREATE TABLE company_cnpj_ms PARTITION OF company_cnpj FOR VALUES IN ('MS');
CREATE TABLE company_cnpj_mg PARTITION OF company_cnpj FOR VALUES IN ('MG');
CREATE TABLE company_cnpj_pa PARTITION OF company_cnpj FOR VALUES IN ('PA');
CREATE TABLE company_cnpj_pb PARTITION OF company_cnpj FOR VALUES IN ('PB');
CREATE TABLE company_cnpj_pr PARTITION OF company_cnpj FOR VALUES IN ('PR');
CREATE TABLE company_cnpj_pe PARTITION OF company_cnpj FOR VALUES IN ('PE');
CREATE TABLE company_cnpj_pi PARTITION OF company_cnpj FOR VALUES IN ('PI');
CREATE TABLE company_cnpj_rj PARTITION OF company_cnpj FOR VALUES IN ('RJ');
CREATE TABLE company_cnpj_rn PARTITION OF company_cnpj FOR VALUES IN ('RN');
CREATE TABLE company_cnpj_rs PARTITION OF company_cnpj FOR VALUES IN ('RS');
CREATE TABLE company_cnpj_ro PARTITION OF company_cnpj FOR VALUES IN ('RO');
CREATE TABLE company_cnpj_rr PARTITION OF company_cnpj FOR VALUES IN ('RR');
CREATE TABLE company_cnpj_sc PARTITION OF company_cnpj FOR VALUES IN ('SC');
CREATE TABLE company_cnpj_sp PARTITION OF company_cnpj FOR VALUES IN ('SP');
CREATE TABLE company_cnpj_se PARTITION OF company_cnpj FOR VALUES IN ('SE');
CREATE TABLE company_cnpj_to PARTITION OF company_cnpj FOR VALUES IN ('TO');

-- Índice parcial: queries de prospecção filtram quase sempre por situacao = 'Ativa'
CREATE INDEX idx_company_cnpj_ativo
    ON company_cnpj (municipio_codigo, cnae_principal)
    WHERE situacao = 'Ativa';

-- Índice para busca por prefixo de CNAE (ex: LIKE '4711%')
-- bpchar_pattern_ops é o operador correto para colunas CHAR (bpchar internamente)
CREATE INDEX idx_company_cnpj_cnae_prefix
    ON company_cnpj (cnae_principal bpchar_pattern_ops);

-- Índice composto (uf, id) para paginação por cursor dentro de uma UF
CREATE INDEX idx_company_cnpj_uf_id
    ON company_cnpj (uf, id);

-- Índice geoespacial para buscas por raio (ST_DWithin)
CREATE INDEX idx_company_cnpj_geom
    ON company_cnpj USING GIST (geom);

-- Trigger para manter atualizado_em consistente em updates via SQL direto.
-- Prisma já faz isso via @updatedAt, mas importações bulk usam SQL raw.
CREATE OR REPLACE FUNCTION set_atualizado_em()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.atualizado_em = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_company_cnpj_atualizado_em
    BEFORE UPDATE ON company_cnpj
    FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();
