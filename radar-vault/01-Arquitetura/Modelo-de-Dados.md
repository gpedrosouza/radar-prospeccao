---
tags: [arquitetura, banco-de-dados]
---

# Modelo de Dados

## Tabela central: `CompanyCnpj` (particionada por UF)

A tabela que recebe os ~66M de registros da Receita **deve ser particionada desde a migration inicial**, nunca depois. Particionar depois exige reescrever a tabela inteira com a base já carregada — uma operação de horas/dias.

```sql
CREATE TABLE "CompanyCnpj" (
    id              BIGSERIAL,
    cnpj            VARCHAR(14) NOT NULL,
    razao_social    TEXT,
    nome_fantasia   TEXT,
    uf              VARCHAR(2) NOT NULL,
    municipio_codigo INT,
    municipio_nome  TEXT,
    cnae_principal  VARCHAR(7),
    situacao        VARCHAR(20),
    porte           VARCHAR(20),
    natureza_juridica VARCHAR(10),
    matriz_filial   VARCHAR(1),
    opcao_simples   BOOLEAN,
    opcao_mei       BOOLEAN,
    data_abertura   DATE,
    capital_social  NUMERIC(18,2),
    email           TEXT,
    telefone        TEXT,
    endereco        TEXT,
    latitude        DOUBLE PRECISION,
    longitude       DOUBLE PRECISION,
    geom            GEOGRAPHY(Point, 4326),  -- PostGIS, populado só após geocodificação
    criado_em       TIMESTAMPTZ DEFAULT now(),
    atualizado_em   TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (id, uf)
) PARTITION BY LIST (uf);

-- Uma partição por UF (27 no total)
CREATE TABLE company_cnpj_sp PARTITION OF "CompanyCnpj" FOR VALUES IN ('SP');
CREATE TABLE company_cnpj_rj PARTITION OF "CompanyCnpj" FOR VALUES IN ('RJ');
-- ... repetir para as 27 UFs
```

## Índices essenciais (criados junto, não depois)

```sql
-- Índice parcial: maioria das buscas operacionais filtra só ativos
CREATE INDEX CONCURRENTLY idx_cnpj_ativo_municipio
  ON "CompanyCnpj" (municipio_codigo, cnae_principal)
  WHERE situacao = 'Ativa';

-- Busca por prefixo de CNAE
CREATE INDEX CONCURRENTLY idx_cnpj_cnae_prefix
  ON "CompanyCnpj" (cnae_principal text_pattern_ops);

-- Geoespacial (após geocodificação)
CREATE INDEX CONCURRENTLY idx_cnpj_geom
  ON "CompanyCnpj" USING GIST (geom);

-- Cursor de exportação (paginação estável)
CREATE INDEX CONCURRENTLY idx_cnpj_export_cursor
  ON "CompanyCnpj" (uf, id);
```

## Schema `analytics` (separado do operacional)

```sql
CREATE SCHEMA analytics;

-- Tabelas resumo, atualizadas por job batch (npm run analytics:refresh)
-- analytics.cnpj_summary_by_uf
-- analytics.cnpj_summary_by_cnae
-- analytics.cnpj_summary_by_status
-- etc. (ver detalhe na Fase 1)
```

Regra: **nenhum dashboard ou query de UI aponta direto para `CompanyCnpj` para agregação**. Sempre para `analytics.*`, atualizado em batch.

## Tabelas de suporte operacional

```sql
-- Fila de jobs (espelha o que está no Redis/BullMQ para auditoria e histórico)
CREATE TABLE "CnpjExportJob" (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id    UUID NOT NULL REFERENCES "User"(id),
    filtros       JSONB NOT NULL,
    status        VARCHAR(20) NOT NULL DEFAULT 'queued', -- queued|running|completed|failed
    linhas        INT,
    tamanho_bytes BIGINT,
    storage_key   TEXT,            -- chave no R2
    progresso_pct SMALLINT DEFAULT 0,
    erro          TEXT,
    criado_em     TIMESTAMPTZ DEFAULT now(),
    concluido_em  TIMESTAMPTZ
);

CREATE TABLE "User" (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome          TEXT NOT NULL,
    email         TEXT UNIQUE NOT NULL,
    senha_hash    TEXT NOT NULL,
    papel         VARCHAR(20) DEFAULT 'banker', -- banker|gestor|admin
    criado_em     TIMESTAMPTZ DEFAULT now()
);

-- Fase 5 (e-mail) — só criar quando chegar a fase
CREATE TABLE "EmailCampaign" ( ... );
CREATE TABLE "EmailBounce" ( ... );
CREATE TABLE "EmailUnsubscribe" ( ... );
```

## Tabelas de localidades (mantidas da v1, reimportadas)

```sql
CREATE TABLE "City" (
    id                BIGSERIAL PRIMARY KEY,
    codigo_ibge       VARCHAR(10),
    nome              TEXT NOT NULL,
    uf                VARCHAR(2) NOT NULL,
    categoria         VARCHAR(20), -- cidade|municipio|distrito
    municipio_sede_id BIGINT REFERENCES "City"(id),
    latitude          DOUBLE PRECISION,
    longitude         DOUBLE PRECISION,
    geom              GEOGRAPHY(Point, 4326)
);

CREATE INDEX idx_city_geom ON "City" USING GIST (geom);
```

## Configuração obrigatória do Postgres (não é opcional para 66M de linhas)

No `docker-compose.yml`, variáveis de ambiente do container Postgres ou `postgresql.conf` montado:

```
shared_buffers = 2GB
effective_cache_size = 6GB
work_mem = 64MB
maintenance_work_mem = 512MB
max_parallel_workers_per_gather = 4
max_parallel_workers = 4
random_page_cost = 1.1   # assumindo NVMe SSD
```

E rodar `ANALYZE` após qualquer carga grande:
```sql
ANALYZE "CompanyCnpj";
```

## Links relacionados
- [[01-Arquitetura/Arquitetura-Geral]]
- [[05-Decisoes-ADR/ADR-002-Particionamento-Postgres]]
- [[03-Fases-Desenvolvimento/Fase-1-Dados]]
