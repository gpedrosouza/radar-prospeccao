-- =============================================================================
-- Migration: 20260901000002_grupo_economico_fix
--
-- Corrige os grupos gigantes espúrios de analytics.grupo_economico
-- (20260831000001), sem tocar em company_cnpj e sem exigir reimportação: basta
-- aplicar esta migration e rodar de novo só o passo que dá o REFRESH —
--   RECEITA_IMPORT_ONLY=socios-agg npm run import:receita --workspace=apps/workers
--
-- ── O defeito ───────────────────────────────────────────────────────────────
-- A matview original agrupava por chave de sócio (cpf_cnpj_socio,
-- nome_socio_razao_social) sem nenhum teto. Três fontes de ruído produziam
-- grupos de centenas ou milhares de CNPJs que não são grupo econômico nenhum:
--
--   1. Colisão de CPF mascarado. A Receita publica ***NNNNNN** — só os 6
--      dígitos centrais. O nome junto derruba muito da colisão, mas homônimos
--      comuns ("MARIA JOSE DA SILVA" com os mesmos 6 dígitos) ainda casam.
--   2. Sócio de grau altíssimo. Contador, procurador, administrador
--      profissional e sócio-laranja aparecem em dezenas ou centenas de CNPJs
--      sem relação societária entre si. A aresta existe no dado e é verdadeira;
--      só não significa "mesmo dono".
--   3. CNPJ de QSA gigante. Cooperativa, associação e condomínio listam
--      milhares de associados no QSA. Nenhum deles é sócio de grau alto, mas
--      juntos colam entre si tudo que qualquer um deles toca — foi a fonte do
--      MAIOR grupo falso da base, e a que o teto de grau sozinho não pega.
--
-- Medido na base completa antes da correção: 21 grupos com mais de 100 CNPJs,
-- o maior com 2.886 — todos falsos positivos destes três tipos.
--
-- ── A correção: DOIS tetos, um em cada ponta da aresta ──────────────────────
-- Uma aresta do grafo liga um sócio a um CNPJ. Ela vira ruído quando qualquer
-- uma das duas pontas tem grau alto demais, e os dois casos aparecem no dado
-- real — por isso o teto do sócio sozinho não resolve.
--
-- (a) CAP_GRAU_SOCIO = 30 — o sócio em CNPJs demais.
--     `grau_socio` conta em quantos cnpj_basico distintos cada chave de sócio
--     aparece; acima do teto ela é DESCARTADA antes da propagação de rótulo.
--     A chave não some do dado — só para de criar arestas.
--     Medido na base completa (26,9M linhas de QSA, 2,25M chaves com grau >= 2):
--       grau 2–5: 2.136.521 chaves | 6–10: 86.977 | 11–20: 18.269
--       grau 21–30: 3.350 | 31–50: 1.851 | 51–100: 911 | 100+: 425
--     O corte em 30 descarta 3.187 chaves (0,14% das que formam grupo) e com
--     elas 235 mil arestas. Um dono real com mais de 30 CNPJs existe (holding
--     com muitas SPEs), mas é raríssimo perto do contador que assina por 400.
--
-- (b) CAP_SOCIOS_CNPJ = 50 — o CNPJ com sócios demais.
--     Simétrico, e sem ele o problema NÃO some. O maior grupo espúrio da base
--     (2.886 CNPJs) não vinha de nenhum sócio de grau alto: vinha de uma
--     cooperativa médica com 3.464 sócios no QSA. Cada um daqueles sócios tem
--     grau baixo e passa folgado pelo teto (a), mas todos rotulam para o mesmo
--     cnpj_basico mínimo — e arrastam junto todo CNPJ que eles tocam. Um CNPJ
--     com mais de 50 sócios é cooperativa, associação ou condomínio, não uma
--     empresa com dono: seu QSA é lista de associados, não de controladores.
--     Distribuição de qtd_socios em company_socio_agg:
--       1–5: 8.760.208 | 6–10: 81.751 | 11–20: 13.752 | 21–50: 4.334
--       51–100: 946 | 101–500: 441 | 500+: 41
--     O corte em 50 tira 1.428 CNPJs de 8,86M.
--
-- Efeito combinado, medido antes e depois na base completa:
--       maior grupo   2.886 → 106 CNPJs
--       grupos > 100  21 grupos → 1
--       cobertura     3.695.136 → 3.671.274 CNPJs em grupo (−0,6%)
--
-- Subir um CAP religa arestas; descer fragmenta grupos legítimos. Mudar o
-- número aqui e rodar `socios-agg` de novo é toda a operação — as consultas
-- acima reproduzem as duas distribuições para reavaliar o corte.
--
-- ── grupo_tamanho é GLOBAL, e continua sendo ────────────────────────────────
-- A matview não conhece recorte: grupo_tamanho conta os CNPJs do grupo na base
-- inteira, não os que caem dentro do raio, da UF ou do filtro da tela. Isso é
-- proposital — materializar tamanho por recorte exigiria uma matview por
-- recorte possível. O tamanho REGIONAL é responsabilidade do consumidor: o
-- serviço ou o export já tem a lista filtrada em mãos e conta os membros do
-- grupo_id dentro dela. Se um dia precisar ser materializado, é coluna
-- derivada no read, não na matview.
--
-- O resto da definição é idêntico ao original — rótulo = menor cnpj_basico,
-- corte grupo_tamanho >= 2, mesmos índices — e a limitação de "um salto"
-- (propagação de rótulo em vez de fecho transitivo) permanece, documentada na
-- migration 20260831000001.
--
-- DROP + CREATE porque CREATE OR REPLACE não existe para matview e a lista de
-- colunas não muda: o contrato de leitura (cnpj_basico, grupo_id,
-- grupo_tamanho) é o mesmo, nenhum consumidor precisa mudar.
-- =============================================================================

DROP MATERIALIZED VIEW IF EXISTS analytics.grupo_economico;

CREATE MATERIALIZED VIEW analytics.grupo_economico AS
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
      -- CAP_SOCIOS_CNPJ: cooperativa/associação/condomínio não propaga rótulo.
      -- Vem de company_socio_agg, que já está no JOIN acima — sem subquery extra.
      AND a.qtd_socios <= 50
),
socio_chave AS (
    SELECT DISTINCT
           btrim(cpf_cnpj_socio)          AS doc,
           btrim(nome_socio_razao_social) AS nome,
           cnpj_basico
    FROM socio_valido
),
-- (0) grau = em quantos CNPJs distintos a chave de sócio aparece.
--     count(*) basta porque socio_chave já é DISTINCT em (doc, nome, cnpj_basico).
grau_socio AS (
    SELECT doc, nome, count(*)::INT AS grau
    FROM socio_chave
    GROUP BY doc, nome
),
-- (1) rótulo de cada sócio = menor CNPJ que ele toca.
--     grau >= 2  : sócio de um CNPJ só não forma grupo.
--     grau <= 30 : CAP_GRAU_SOCIO — acima disso é contador/procurador/colisão
--                  de máscara: a aresta é ruído e não propaga (ver cabeçalho).
rotulo_socio AS (
    SELECT sc.doc, sc.nome, min(sc.cnpj_basico) AS rotulo
    FROM socio_chave sc
    JOIN grau_socio g ON g.doc = sc.doc AND g.nome = sc.nome
    WHERE g.grau >= 2
      AND g.grau <= 30
    GROUP BY sc.doc, sc.nome
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
-- limitação de um salto descrita na migration original — e é por isso que o
-- corte >= 2 não é redundante com o filtro de grau acima.
SELECT cnpj_basico, grupo_id, grupo_tamanho
FROM dimensionado
WHERE grupo_tamanho >= 2;

-- UNIQUE é requisito do REFRESH MATERIALIZED VIEW CONCURRENTLY, que mantém a
-- matview legível durante a reconstrução (o import roda com o app no ar).
CREATE UNIQUE INDEX IF NOT EXISTS idx_grupo_economico_cnpj_basico
  ON analytics.grupo_economico (cnpj_basico);

CREATE INDEX IF NOT EXISTS idx_grupo_economico_grupo_id
  ON analytics.grupo_economico (grupo_id);
