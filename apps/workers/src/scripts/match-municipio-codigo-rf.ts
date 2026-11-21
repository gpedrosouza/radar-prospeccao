/**
 * Casa cities.codigo_ibge (IBGE) com company_cnpj.municipio_codigo (código
 * interno de município da Receita Federal — tabela TOM, refletida em
 * lookup_municipio_rf). Os dois sistemas de código são numerados de forma
 * independente para os mesmos municípios (ex: São Carlos/SP = 3548906 no
 * IBGE, 7079 na Receita) — sem esse crosswalk, resolver uma busca por raio
 * em cities e filtrar company_cnpj pelo codigo_ibge resultante nunca bate
 * com nada.
 *
 * Casamento por nome+UF normalizados (sem acento, maiúsculo, espaços
 * colapsados) contra as combinações (uf, municipio_codigo, municipio_nome)
 * que já existem de fato em company_cnpj — não depende de lookup_municipio_rf
 * diretamente porque essa tabela não tem coluna uf (só código+nome).
 *
 * Uso:
 *   npm run match:municipio-codigo-rf --workspace=apps/workers
 *
 * Idempotente — seguro rodar de novo (ex: depois de importar mais CNPJs ou
 * atualizar cities) para recasar. Requer que cities e company_cnpj já
 * tenham dados.
 */

import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("ERRO: DATABASE_URL não definida");
  process.exit(1);
}

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    // Hífen vira espaço (ex: "Entre-Ijuís" → "ENTRE IJUIS", como na Receita);
    // apóstrofo é removido (ex: "Sant'Ana" → "SANTANA", não "SANT ANA").
    .replace(/-/g, " ")
    .replace(/'/g, "")
    .toUpperCase()
    .trim()
    .replace(/\s+/g, " ");
}

interface CityRow {
  id: number;
  codigo_ibge: number;
  nome: string;
  uf: string;
}

interface RfRow {
  uf: string;
  municipio_codigo: number;
  municipio_nome: string;
}

async function main(): Promise<void> {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();

  console.log("Casamento cities.codigo_ibge ↔ company_cnpj.municipio_codigo");
  console.log("─".repeat(60));

  const { rows: cities } = await client.query<CityRow>(
    `SELECT id, codigo_ibge, nome, uf::text AS uf FROM cities`
  );
  const { rows: rfRows } = await client.query<RfRow>(
    `SELECT DISTINCT uf::text AS uf, municipio_codigo, municipio_nome FROM company_cnpj`
  );

  console.log(`${cities.length} cidade(s) (IBGE) × ${rfRows.length} combinação(ões) (Receita Federal)\n`);

  if (cities.length === 0) {
    console.log("cities está vazia — rode import:cities primeiro.");
    await client.end();
    return;
  }
  if (rfRows.length === 0) {
    console.log("company_cnpj está vazia — nada para casar.");
    await client.end();
    return;
  }

  // Chave: "UF|NOME_NORMALIZADO" → municipio_codigo. Nomes duplicados na
  // mesma UF (raro) mantêm o primeiro encontrado e são reportados.
  const rfByKey = new Map<string, number>();
  const duplicatas: string[] = [];
  for (const r of rfRows) {
    const key = `${r.uf}|${normalize(r.municipio_nome)}`;
    if (rfByKey.has(key)) {
      duplicatas.push(`${r.municipio_nome}/${r.uf} (códigos ${rfByKey.get(key)} e ${r.municipio_codigo})`);
      continue;
    }
    rfByKey.set(key, r.municipio_codigo);
  }

  let matched = 0;
  const semMatch: string[] = [];

  await client.query("BEGIN");
  try {
    for (const c of cities) {
      const key = `${c.uf}|${normalize(c.nome)}`;
      const rfCode = rfByKey.get(key);
      if (rfCode === undefined) {
        semMatch.push(`${c.nome}/${c.uf} (codigo_ibge=${c.codigo_ibge})`);
        continue;
      }
      await client.query(`UPDATE cities SET municipio_codigo_rf = $1 WHERE id = $2`, [rfCode, c.id]);
      matched++;
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    await client.end();
  }

  console.log(`Casados: ${matched}/${cities.length} (${((matched / cities.length) * 100).toFixed(1)}%)`);

  if (duplicatas.length > 0) {
    console.log(`\nAviso: ${duplicatas.length} nome(s) duplicado(s) na mesma UF em company_cnpj (mantido o primeiro):`);
    duplicatas.slice(0, 10).forEach((d) => console.log(`  ${d}`));
    if (duplicatas.length > 10) console.log(`  ... e mais ${duplicatas.length - 10}`);
  }

  if (semMatch.length > 0) {
    console.log(`\nSem correspondência (${semMatch.length}):`);
    semMatch.slice(0, 30).forEach((s) => console.log(`  ${s}`));
    if (semMatch.length > 30) console.log(`  ... e mais ${semMatch.length - 30}`);
  }

  console.log("─".repeat(60));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
