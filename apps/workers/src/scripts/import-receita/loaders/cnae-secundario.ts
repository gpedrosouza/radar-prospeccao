/**
 * Passo `cnae-sec`: explode staging_estabelecimento.cnae_secundario — um campo
 * TEXT com códigos de 7 dígitos separados por vírgula — em
 * company_cnae_secundario, uma linha por (CNPJ, CNAE).
 *
 * ── Por que roda DENTRO do mesmo import, logo após estabelecimentos ─────────
 * staging_estabelecimento é truncada a cada carga (diferente de staging_socio,
 * que é semi-permanente). Depois que o import termina, a lista de secundários
 * não existe mais em lugar nenhum: ou ela é persistida enquanto a staging está
 * populada, ou exige rebaixar os ZIPs da Receita de novo. Por isso o passo é
 * chamado imediatamente depois de loadEstabelecimentos, e não junto do
 * socios-agg no fim.
 *
 * Tudo em SQL, server-side: são ~20M de estabelecimentos e a média de 1–2
 * secundários por linha; nada disso precisa trafegar para o Node.
 *
 * O CNAE principal continua onde sempre esteve (company_cnpj.cnae_principal).
 * Esta tabela guarda SÓ os secundários — quem quiser o conjunto completo une
 * as duas fontes na leitura.
 */

import { query } from "../db.js";

/**
 * Restringe aos CNPJs de company_cnpj via JOIN contra uma temp table de CNPJs
 * alvo, e não com `WHERE cnpj IN (SELECT cnpj FROM company_cnpj)`.
 *
 * O IN correlacionado obrigaria o planner a comparar a expressão
 * `LPAD(...)||LPAD(...)||LPAD(...)` contra as 27 partições a cada linha da
 * staging — expressão não indexada dos dois lados. Materializar os CNPJs uma
 * vez numa UNLOGGED com PK transforma isso num hash/index join único. É o
 * mesmo padrão de tmp_basicos_alvo em socios-agg.ts, pelo mesmo motivo.
 */
const CRIAR_TMP_CNPJS_ALVO = `
CREATE UNLOGGED TABLE tmp_cnpjs_alvo AS
  SELECT cnpj FROM company_cnpj
`;

/**
 * CNPJ completo montado do mesmo jeito que o INSERT de estabelecimentos —
 * 8 + 4 + 2 = 14 dígitos. O cast final para CHAR(14) não é cosmético: sem ele
 * a comparação com tmp_cnpjs_alvo.cnpj (bpchar) seria resolvida como texto e
 * deixaria de usar a PK da temp table.
 */
const CNPJ14_SQL = `(
  LPAD(e.cnpj_basico, 8, '0')
    || LPAD(e.cnpj_ordem, 4, '0')
    || LPAD(e.cnpj_dv, 2, '0')
)::CHAR(14)`;

/**
 * unnest + string_to_array explode a lista; o resto é higiene do dado bruto:
 *
 *   - NULLIF(TRIM(...), '')  descarta a linha inteira quando não há secundário
 *     (o caso majoritário — string_to_array('', ',') devolveria [''], não []).
 *   - LPAD(...,7,'0')        normaliza códigos que vêm sem zero à esquerda,
 *     para casar com lookup_cnae (CHAR(7)) e com classificarCategoriaPorCnae.
 *   - <> '0000000'           a Receita usa esse código como "sem atividade".
 *   - ~ '^[0-9]{7}$'         sobra de vírgula, espaço ou lixo de encoding não
 *     vira uma linha com código inválido.
 *
 * DISTINCT antes do INSERT porque a mesma lista pode repetir um código; o
 * ON CONFLICT cobriria isso, mas deduplicar antes evita o custo do conflito
 * em ~30M de linhas.
 */
const INSERT_CNAE_SECUNDARIO = `
INSERT INTO company_cnae_secundario (cnpj, cnae)
WITH com_lista AS (
  -- Descarta antes de explodir quem não tem secundário nenhum (a maioria):
  -- string_to_array('', ',') devolveria [''], uma linha de lixo por CNPJ.
  SELECT ${CNPJ14_SQL} AS cnpj,
         btrim(e.cnae_secundario) AS lista
  FROM staging_estabelecimento e
  WHERE NULLIF(btrim(e.cnae_secundario), '') IS NOT NULL
),
-- O JOIN vem ANTES do unnest: restringir a company_cnpj primeiro evita
-- explodir dezenas de milhões de linhas que seriam descartadas em seguida.
alvo AS (
  SELECT c.cnpj, c.lista
  FROM com_lista c
  JOIN tmp_cnpjs_alvo t ON t.cnpj = c.cnpj
),
explodido AS (
  SELECT a.cnpj,
         LPAD(btrim(codigo), 7, '0') AS cnae
  FROM alvo a
  CROSS JOIN LATERAL unnest(string_to_array(a.lista, ',')) AS codigo
)
SELECT DISTINCT cnpj, cnae
FROM explodido
WHERE cnae ~ '^[0-9]{7}$'
  AND cnae <> '0000000'
ON CONFLICT DO NOTHING
`;

export async function loadCnaeSecundario(): Promise<void> {
  const { rows: staged } = await query(
    "SELECT count(*)::bigint AS n FROM staging_estabelecimento",
  );
  const emStaging = Number(staged[0].n);

  if (emStaging === 0) {
    // Rodar `RECEITA_IMPORT_ONLY=cnae-sec` sozinho depois de um import já
    // concluído cai aqui: a staging foi truncada e não há o que explodir.
    // Truncar a tabela final nesse cenário apagaria dados bons sem repô-los.
    console.warn(
      "  Aviso: staging_estabelecimento está vazia — nada a explodir.\n" +
        "  Este passo depende da staging populada; rode-o junto de " +
        "`estabelecimentos` (ou com RECEITA_IMPORT_ONLY=all). Pulando.",
    );
    return;
  }

  console.log("  Recriando company_cnae_secundario...");
  await query("TRUNCATE TABLE company_cnae_secundario");

  console.log("  Coletando CNPJs presentes em company_cnpj...");
  await query("DROP TABLE IF EXISTS tmp_cnpjs_alvo");
  await query(CRIAR_TMP_CNPJS_ALVO);
  await query("ALTER TABLE tmp_cnpjs_alvo ADD PRIMARY KEY (cnpj)");
  await query("ANALYZE tmp_cnpjs_alvo");

  console.log("  Explodindo a lista de CNAEs secundários (pode demorar)...");
  const result = await query(INSERT_CNAE_SECUNDARIO);

  await query("DROP TABLE IF EXISTS tmp_cnpjs_alvo");
  await query("ANALYZE company_cnae_secundario");

  const { rows } = await query(`
    SELECT count(*)::bigint             AS linhas,
           count(DISTINCT cnpj)::bigint AS cnpjs,
           count(DISTINCT cnae)::bigint AS codigos
    FROM company_cnae_secundario
  `);
  const r = rows[0];
  console.log(
    `  company_cnae_secundario: ${Number(result.rowCount ?? 0).toLocaleString("pt-BR")} ` +
      `linhas inseridas — ${Number(r.linhas).toLocaleString("pt-BR")} no total, ` +
      `${Number(r.cnpjs).toLocaleString("pt-BR")} CNPJs, ` +
      `${Number(r.codigos).toLocaleString("pt-BR")} códigos distintos.`,
  );
}
