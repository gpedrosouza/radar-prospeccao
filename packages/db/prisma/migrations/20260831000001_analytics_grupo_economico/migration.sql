-- =============================================================================
-- Migration: 20260831000001_analytics_grupo_economico
--
-- Grupo econômico: CNPJs que compartilham ao menos um sócio pertencem ao mesmo
-- ticket de conta (FIDC), não são leads avulsos.
--
-- REGRA ARQUITETURAL (CLAUDE.md regra 6):
--   Agregação → schema `analytics`. company_cnpj NÃO é tocada por esta
--   migration: nenhuma coluna nova, nenhum ALTER. A ligação com a tabela
--   particionada é feita em tempo de leitura por cnpj_basico
--   (= substr(company_cnpj.cnpj, 1, 8)).
--
-- LGPD:
--   cpf_cnpj_socio é usado APENAS aqui dentro, como chave de junção para
--   descobrir sócios em comum. A matview materializa somente
--   (cnpj_basico, grupo_id, grupo_tamanho) — nenhum CPF, nenhum nome, nada
--   que saia daqui identifique uma pessoa natural.
--
-- População: passo `socios-agg` do importador
--   RECEITA_IMPORT_ONLY=socios-agg npm run import:receita --workspace=apps/workers
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS analytics;

-- ---------------------------------------------------------------------------
-- Dependências criadas pelo importador (apps/workers/.../import-receita/schema.ts).
--
-- Repetidas aqui com IF NOT EXISTS para que `db:deploy` funcione num banco
-- limpo, antes de qualquer importação — sem isso o CREATE MATERIALIZED VIEW
-- abaixo falharia no CI. Ambos os lados usam IF NOT EXISTS e a mesma definição:
-- quem rodar primeiro cria, o outro é no-op.
--
-- Fonte da verdade:
--   staging_socio      → schema.ts (tabela de ingestão da Receita)
--   company_socio_agg  → esta migration (é lida pela aplicação, não é staging)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS staging_socio (
  cnpj_basico                CHAR(8) NOT NULL,
  identificador_socio        CHAR(1),
  nome_socio_razao_social    TEXT,
  cpf_cnpj_socio             TEXT,
  qualificacao_socio         CHAR(2),
  data_entrada_sociedade     TEXT,
  pais                       TEXT,
  representante_legal        TEXT,
  nome_representante         TEXT,
  qualificacao_representante CHAR(2),
  faixa_etaria               CHAR(1)
);

CREATE INDEX IF NOT EXISTS idx_staging_socio_cnpj
  ON staging_socio (cnpj_basico);

CREATE TABLE IF NOT EXISTS company_socio_agg (
  cnpj_basico           CHAR(8) PRIMARY KEY,
  qtd_socios            INT     NOT NULL DEFAULT 0,
  socio_administrador   TEXT,
  qualificacao_admin    TEXT,
  tem_socio_estrangeiro BOOLEAN NOT NULL DEFAULT FALSE,
  tem_socio_pj          BOOLEAN NOT NULL DEFAULT FALSE,
  data_entrada_admin    DATE
);

-- ---------------------------------------------------------------------------
-- analytics.grupo_economico
--
-- Chave do sócio = (cpf_cnpj_socio, nome_socio_razao_social).
--   O CPF que a Receita publica vem mascarado (***NNNNNN**), preservando os 6
--   dígitos centrais — estável para o mesmo CPF, mas com colisão possível entre
--   CPFs diferentes. Combinar com o nome derruba a colisão a um nível
--   aceitável. Para sócio PJ o campo traz o CNPJ completo (14 dígitos), que é
--   identificador exato — é o caso holding → controladas.
--
-- LIMITAÇÃO CONHECIDA — agrupamento de um salto, não fecho transitivo:
--   O agrupamento correto é o componente conexo do grafo (CNPJ ↔ sócio), que em
--   SQL puro exige recursão cara sobre dezenas de milhões de arestas. Esta
--   matview faz UMA rodada de propagação de rótulo:
--     1. cada chave de sócio recebe como rótulo o menor cnpj_basico que ela toca;
--     2. cada cnpj_basico adota o MENOR rótulo entre os seus sócios.
--   Isso captura o caso que interessa ao banker (sócio em comum direto, o
--   "mesmo dono em N CNPJs"). Não captura cadeias indiretas: se A–B compartilham
--   o sócio X e B–C compartilham o sócio Y, A e C podem terminar em grupos
--   distintos. Fechar a transitividade é evolução prevista — trocar esta matview
--   por um passo iterativo no worker, sem mudar o contrato de leitura
--   (cnpj_basico, grupo_id, grupo_tamanho).
--
-- Só linhas com grupo_tamanho >= 2 são materializadas: quem está sozinho não é
-- grupo, e guardar 13M de grupos unitários só inflaria a tabela.
-- ---------------------------------------------------------------------------
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.grupo_economico AS
WITH socio_valido AS (
    SELECT s.cnpj_basico,
           s.cpf_cnpj_socio,
           s.nome_socio_razao_social
    FROM staging_socio s
    -- restringe ao universo que a aplicação enxerga (company_cnpj), pelo
    -- agregado que já foi filtrado por ele
    JOIN company_socio_agg a ON a.cnpj_basico = s.cnpj_basico
    WHERE s.cpf_cnpj_socio IS NOT NULL
      AND s.nome_socio_razao_social IS NOT NULL
      AND btrim(s.cpf_cnpj_socio) <> ''
      AND btrim(s.nome_socio_razao_social) <> ''
      -- descarta o preenchimento genérico da Receita, que casaria todo mundo
      -- com todo mundo e criaria um "grupo" de milhões de CNPJs
      AND btrim(s.cpf_cnpj_socio) NOT IN ('***000000**', '00000000000', '00000000000000')
      AND btrim(s.cpf_cnpj_socio) !~ '^0+$'
),
socio_chave AS (
    SELECT DISTINCT
           btrim(cpf_cnpj_socio)          AS doc,
           btrim(nome_socio_razao_social) AS nome,
           cnpj_basico
    FROM socio_valido
),
-- (1) rótulo de cada sócio = menor CNPJ que ele toca; só sócios com 2+ CNPJs
--     participam, os demais não formam grupo
rotulo_socio AS (
    SELECT doc, nome, min(cnpj_basico) AS rotulo
    FROM socio_chave
    GROUP BY doc, nome
    HAVING count(DISTINCT cnpj_basico) >= 2
),
-- (2) cada CNPJ adota o menor rótulo entre os seus sócios
rotulo_cnpj AS (
    SELECT sc.cnpj_basico,
           min(rs.rotulo) AS grupo_id
    FROM socio_chave sc
    JOIN rotulo_socio rs ON rs.doc = sc.doc AND rs.nome = sc.nome
    GROUP BY sc.cnpj_basico
),
dimensionado AS (
    SELECT cnpj_basico,
           grupo_id,
           count(*) OVER (PARTITION BY grupo_id)::INT AS grupo_tamanho
    FROM rotulo_cnpj
)
-- O passo (2) pode deixar um CNPJ sozinho no rótulo dele: se B migrou para um
-- rótulo menor por causa de outro sócio, A fica só com o próprio. É a mesma
-- limitação de um salto descrita acima — e é por isso que o corte >= 2 não é
-- redundante com o HAVING de rotulo_socio.
SELECT cnpj_basico, grupo_id, grupo_tamanho
FROM dimensionado
WHERE grupo_tamanho >= 2;

-- UNIQUE é requisito do REFRESH MATERIALIZED VIEW CONCURRENTLY, que mantém a
-- matview legível durante a reconstrução (o import roda com o app no ar).
CREATE UNIQUE INDEX IF NOT EXISTS idx_grupo_economico_cnpj_basico
  ON analytics.grupo_economico (cnpj_basico);

CREATE INDEX IF NOT EXISTS idx_grupo_economico_grupo_id
  ON analytics.grupo_economico (grupo_id);
