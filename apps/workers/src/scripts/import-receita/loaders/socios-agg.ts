/**
 * Passo `socios-agg`: condensa staging_socio (QSA bruto da Receita, ~24M
 * linhas) em company_socio_agg — uma linha por cnpj_basico com o decisor
 * resolvido, a contagem de sócios e as flags de composição societária.
 *
 * Roda DEPOIS de loadEstabelecimentos porque restringe o resultado aos
 * cnpj_basico que existem em company_cnpj: o QSA cobre a base inteira da
 * Receita (inclusive baixadas e MEI, que o importador descarta), e agregar
 * tudo geraria milhões de linhas que nenhuma tela jamais leria.
 *
 * Tudo acontece em SQL, server-side. Nenhuma linha do QSA trafega para o
 * Node — são 24M registros, e o trabalho é uma agregação que o Postgres faz
 * melhor sozinho.
 *
 * LGPD: cpf_cnpj_socio NÃO é copiado para company_socio_agg. O CPF (mesmo
 * mascarado) permanece só em staging_socio, onde serve exclusivamente de
 * chave de junção do grupo econômico (analytics.grupo_economico). O que sai
 * daqui para a UI/export é nome do administrador e agregados.
 */

import { query } from "../db.js";

/**
 * Prioridade de qualificação para eleger o "decisor" do CNPJ.
 *
 * Os códigos foram conferidos contra lookup_qualificacao já populada
 * (SELECT codigo, descricao FROM lookup_qualificacao) — não são os da
 * documentação da Receita de cabeça. Ordem = quem manda de fato:
 *
 *   49 Sócio-Administrador          → o caso dominante em LTDA
 *   05 Administrador
 *   65 Titular PF Residente no Brasil → titular de EIRELI/Empresa Individual;
 *      sem ele, toda empresa de titular único cairia no fallback
 *   28 Sócio-Gerente                → forma antiga, ainda muito frequente
 *   16 Presidente / 10 Diretor      → S/A
 *   34 Titular de Empresa Individual Imobiliária
 *   78 Titular PJ Domiciliada no Brasil
 *   74/70/73/72/66 → mesmos papéis, residente no exterior (decisor real,
 *      mas menos acionável para o banker, então abaixo dos domiciliados)
 *
 * 64 (Administrador Judicial) fica deliberadamente no fim: indica empresa em
 * recuperação judicial/falência — é um interventor nomeado pelo juízo, não
 * alguém para quem se prospecta produto. Só é escolhido se não houver mais
 * ninguém no quadro.
 */
const PRIORIDADE_ADMIN: readonly string[] = [
  "49", "05", "65", "28", "16", "10", "34", "78",
  "74", "70", "73", "72", "66",
];

/** CASE que traduz qualificacao_socio no rank acima (menor = mais prioritário). */
function rankSql(column: string): string {
  const whens = PRIORIDADE_ADMIN.map(
    (codigo, i) => `WHEN '${codigo}' THEN ${i}`,
  ).join(" ");
  // 90 = qualquer outra qualificação de sócio; 99 = administrador judicial.
  return `CASE trim(${column}) ${whens} WHEN '64' THEN 99 ELSE 90 END`;
}

export async function buildSocioAgg(): Promise<void> {
  console.log("  Recriando company_socio_agg...");
  await query("TRUNCATE TABLE company_socio_agg");

  // Materializa os cnpj_basico de interesse numa temp table indexada. Um
  // EXISTS correlacionado contra company_cnpj não usaria índice (o predicado
  // seria sobre substr(cnpj,1,8), que não é indexado) e viraria um seq scan
  // das 27 partições por sócio.
  console.log("  Coletando cnpj_basico presentes em company_cnpj...");
  await query("DROP TABLE IF EXISTS tmp_basicos_alvo");
  await query(`
    CREATE UNLOGGED TABLE tmp_basicos_alvo AS
      SELECT DISTINCT substr(cnpj, 1, 8)::CHAR(8) AS cnpj_basico
      FROM company_cnpj
  `);
  await query(
    "ALTER TABLE tmp_basicos_alvo ADD PRIMARY KEY (cnpj_basico)",
  );
  await query("ANALYZE tmp_basicos_alvo");

  const { rows: alvoRows } = await query(
    "SELECT count(*)::int AS n FROM tmp_basicos_alvo",
  );
  console.log(
    `  ${Number(alvoRows[0].n).toLocaleString("pt-BR")} CNPJs básicos alvo.`,
  );

  console.log("  Agregando QSA (contagens, flags e decisor)...");
  await query(`
    INSERT INTO company_socio_agg (
      cnpj_basico, qtd_socios, socio_administrador, qualificacao_admin,
      tem_socio_estrangeiro, tem_socio_pj, data_entrada_admin
    )
    WITH socios AS (
      SELECT s.cnpj_basico,
             s.identificador_socio,
             s.nome_socio_razao_social,
             s.qualificacao_socio,
             s.data_entrada_sociedade
      FROM staging_socio s
      JOIN tmp_basicos_alvo b ON b.cnpj_basico = s.cnpj_basico
    ),
    agg AS (
      SELECT cnpj_basico,
             count(*)::int AS qtd_socios,
             bool_or(trim(identificador_socio) = '3') AS tem_socio_estrangeiro,
             bool_or(trim(identificador_socio) = '1') AS tem_socio_pj
      FROM socios
      GROUP BY cnpj_basico
    ),
    admin AS (
      SELECT DISTINCT ON (cnpj_basico)
             cnpj_basico,
             nome_socio_razao_social,
             qualificacao_socio,
             data_entrada_sociedade
      FROM socios
      -- nome como desempate deixa a escolha estável entre reimportações
      -- (sem ele, dois sócios de mesma qualificação alternariam a cada carga)
      ORDER BY cnpj_basico,
               ${rankSql("qualificacao_socio")},
               nome_socio_razao_social
    )
    SELECT a.cnpj_basico,
           a.qtd_socios,
           ad.nome_socio_razao_social,
           q.descricao,
           a.tem_socio_estrangeiro,
           a.tem_socio_pj,
           CASE
             WHEN ad.data_entrada_sociedade ~ '^\\d{8}$'
              AND ad.data_entrada_sociedade <> '00000000'
             THEN to_date(ad.data_entrada_sociedade, 'YYYYMMDD')
             ELSE NULL
           END
    FROM agg a
    LEFT JOIN admin ad ON ad.cnpj_basico = a.cnpj_basico
    LEFT JOIN lookup_qualificacao q ON q.codigo = ad.qualificacao_socio
  `);

  await query("DROP TABLE IF EXISTS tmp_basicos_alvo");
  await query("ANALYZE company_socio_agg");

  const { rows } = await query(`
    SELECT count(*)::int                                          AS total,
           count(socio_administrador)::int                        AS com_admin,
           count(*) FILTER (WHERE tem_socio_estrangeiro)::int     AS estrangeiro,
           count(*) FILTER (WHERE tem_socio_pj)::int              AS pj
    FROM company_socio_agg
  `);
  const r = rows[0];
  console.log(
    `  company_socio_agg: ${Number(r.total).toLocaleString("pt-BR")} linhas, ` +
      `${Number(r.com_admin).toLocaleString("pt-BR")} com decisor, ` +
      `${Number(r.estrangeiro).toLocaleString("pt-BR")} com sócio estrangeiro, ` +
      `${Number(r.pj).toLocaleString("pt-BR")} com sócio PJ.`,
  );
}

/**
 * Reconstrói analytics.grupo_economico (definida na migration
 * 20260831000001_analytics_grupo_economico).
 *
 * CONCURRENTLY mantém a matview legível durante a reconstrução — o import roda
 * com o app no ar. Exige o índice único e uma matview já populada; numa base
 * que nunca refreshou, cai para o REFRESH comum.
 */
export async function refreshGrupoEconomico(): Promise<void> {
  const { rows: existe } = await query(
    "SELECT to_regclass('analytics.grupo_economico') IS NOT NULL AS ok",
  );
  if (!existe[0].ok) {
    console.warn(
      "  Aviso: analytics.grupo_economico não existe — rode as migrations " +
        "(npm run db:deploy --workspace=packages/db). Pulando.",
    );
    return;
  }

  console.log("  Atualizando analytics.grupo_economico...");
  try {
    await query("REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.grupo_economico");
  } catch {
    await query("REFRESH MATERIALIZED VIEW analytics.grupo_economico");
  }
  await query("ANALYZE analytics.grupo_economico");

  const { rows } = await query(`
    SELECT count(*)::int              AS cnpjs,
           count(DISTINCT grupo_id)::int AS grupos,
           coalesce(max(grupo_tamanho), 0)::int AS maior
    FROM analytics.grupo_economico
  `);
  const g = rows[0];
  console.log(
    `  grupo_economico: ${Number(g.cnpjs).toLocaleString("pt-BR")} CNPJs em ` +
      `${Number(g.grupos).toLocaleString("pt-BR")} grupos (maior: ${g.maior} CNPJs).`,
  );
}
