/**
 * Backfill em lote de latitude/longitude via CNEFE (CEP → município,
 * nessa ordem) para os CNPJs sem coordenada — CEP primeiro (mais preciso,
 * cnefe_ceps), fallback de município pros que não bateram CEP
 * (cnefe_municipio_centroides).
 *
 * Diferente de geocode-cnpj.ts (que chama a Google Geocoding API, paga, por
 * isso é sob demanda com LIMIT baixo): este script só usa dados CNEFE já
 * importados localmente — zero chamada externa, zero custo — por isso pode
 * rodar em lote sobre a base inteira sem preocupação de orçamento (CLAUDE.md
 * "trate custo como recurso finito" não se aplica aqui, não há custo).
 *
 * Roda UF por UF: aproveita partition pruning de company_cnpj (WHERE uf =
 * $1 direciona à partição certa), mantém cada UPDATE pequeno e loggable, e
 * uma UF com problema não trava as demais.
 *
 * Idempotente por natureza — WHERE latitude IS NULL garante que rodar de
 * novo não re-processa nada já resolvido (nenhum --force necessário).
 *
 * Uso:
 *   npm run backfill:cnefe --workspace=apps/workers -- --dry-run
 *   npm run backfill:cnefe --workspace=apps/workers -- --dry-run --uf=SP
 *   npm run backfill:cnefe --workspace=apps/workers
 *   npm run backfill:cnefe --workspace=apps/workers -- --uf=SP
 */

import pg from "pg";
import { TODAS_UFS } from "./lib/cnefe-shared.js";

const cliArgs = process.argv.slice(2);
const DRY_RUN = cliArgs.includes("--dry-run");

function argValue(flag: string): string | undefined {
  const prefix = `--${flag}=`;
  const found = cliArgs.find((a) => a.startsWith(prefix));
  return found?.slice(prefix.length);
}

const UF_ARG = argValue("uf")?.toUpperCase();
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("ERRO: DATABASE_URL não definida");
  process.exit(1);
}

// CEP sempre no final de endereco (ver extractCepFromEndereco em
// packages/shared/src/geocoding.ts) — mesma regex, replicada em SQL aqui
// porque o backfill roda como UPDATE...FROM set-based, não linha a linha.
const CEP_EXPR = `substring(c.endereco from '(\\d{8})\\s*$')`;

const UPDATE_CEP_SQL = `
  UPDATE company_cnpj c
  SET latitude       = cc.latitude,
      longitude      = cc.longitude,
      geom           = ST_SetSRID(ST_MakePoint(cc.longitude, cc.latitude), 4326)::geography,
      geocode_source = 'cnefe_cep',
      atualizado_em  = NOW()
  FROM cnefe_ceps cc
  WHERE c.uf = $1 AND c.latitude IS NULL AND c.endereco IS NOT NULL
    AND cc.cep = ${CEP_EXPR}
    AND ${CEP_EXPR} <> '00000000'
`;

// Fallback de município: atravessa o crosswalk cities.municipio_codigo_rf
// (company_cnpj.municipio_codigo é código da Receita Federal, não IBGE —
// ver cnpj-search.service.ts para o mesmo problema/solução).
const UPDATE_MUNICIPIO_SQL = `
  UPDATE company_cnpj c
  SET latitude       = cmc.latitude,
      longitude      = cmc.longitude,
      geom           = ST_SetSRID(ST_MakePoint(cmc.longitude, cmc.latitude), 4326)::geography,
      geocode_source = 'cnefe_municipio',
      atualizado_em  = NOW()
  FROM cities ci
  JOIN cnefe_municipio_centroides cmc ON cmc.uf = ci.uf AND cmc.codigo_municipio = ci.codigo_ibge
  WHERE c.uf = $1 AND c.latitude IS NULL
    AND ci.uf = c.uf AND ci.municipio_codigo_rf = c.municipio_codigo
`;

interface UfResult {
  uf: string;
  porCep: number;
  porMunicipio: number;
  tempoMs: number;
}

async function processUf(client: pg.Client, uf: string): Promise<UfResult> {
  const inicio = Date.now();

  // DRY-RUN roda os UPDATEs de verdade dentro de uma transação e dá ROLLBACK
  // no final — não é um SELECT COUNT independente pra cada etapa, porque
  // CEP e município não são conjuntos disjuntos (quase toda linha resolvida
  // por município também bateria CEP primeiro num run real). Só simulando a
  // sequência real (CEP consome as linhas, DEPOIS município vê o que sobrou)
  // dá o número certo — dois COUNTs isolados infla o total.
  await client.query("BEGIN");
  try {
    const cepResult = await client.query(UPDATE_CEP_SQL, [uf]);
    const municipioResult = await client.query(UPDATE_MUNICIPIO_SQL, [uf]);
    await client.query(DRY_RUN ? "ROLLBACK" : "COMMIT");
    return {
      uf,
      porCep: cepResult.rowCount ?? 0,
      porMunicipio: municipioResult.rowCount ?? 0,
      tempoMs: Date.now() - inicio,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

async function main(): Promise<void> {
  console.log("Backfill CNEFE — company_cnpj.latitude/longitude (CEP → município)");
  console.log("─".repeat(60));
  console.log(`Modo: ${DRY_RUN ? "DRY-RUN (sem alterações)" : "REAL"}`);
  console.log(`UF:   ${UF_ARG ?? "todas (27)"}`);
  console.log("─".repeat(60));
  console.log();

  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();

  const ufs = UF_ARG ? [UF_ARG] : TODAS_UFS;
  const resultados: UfResult[] = [];
  let totalCep = 0;
  let totalMunicipio = 0;

  try {
    for (const uf of ufs) {
      try {
        const r = await processUf(client, uf);
        resultados.push(r);
        totalCep += r.porCep;
        totalMunicipio += r.porMunicipio;
        console.log(
          `[${uf}] cnefe_cep=${r.porCep.toLocaleString("pt-BR")} ` +
            `cnefe_municipio=${r.porMunicipio.toLocaleString("pt-BR")} ` +
            `(${(r.tempoMs / 1000).toFixed(1)}s)`
        );
      } catch (err) {
        // Uma UF com problema não deve travar as demais.
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[${uf}] ERRO — ${msg}`);
      }
    }
  } finally {
    await client.end();
  }

  console.log();
  console.log("─".repeat(60));
  console.log(
    DRY_RUN
      ? `TOTAL que seria resolvido: cnefe_cep=${totalCep.toLocaleString("pt-BR")} ` +
          `cnefe_municipio=${totalMunicipio.toLocaleString("pt-BR")} ` +
          `(${(totalCep + totalMunicipio).toLocaleString("pt-BR")} no total). Nenhuma alteração aplicada.`
      : `TOTAL resolvido: cnefe_cep=${totalCep.toLocaleString("pt-BR")} ` +
          `cnefe_municipio=${totalMunicipio.toLocaleString("pt-BR")} ` +
          `(${(totalCep + totalMunicipio).toLocaleString("pt-BR")} no total).`
  );
  console.log("─".repeat(60));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
