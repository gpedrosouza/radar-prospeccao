/**
 * Geocodifica registros de company_cnpj que têm endereço mas não têm coordenadas.
 *
 * !! NÃO CHAMAR AUTOMATICAMENTE !!
 * A API do Google Geocoding cobra por chamada. Rodar sem limite sobre os ~20M
 * registros da base custaria dezenas de milhares de dólares.
 * Veja a seção "Por que apenas sob demanda?" no fim deste arquivo.
 *
 * Uso:
 *   npm run geocode:cnpj --workspace=apps/workers -- [limite] [--dry-run]
 *
 * Exemplos:
 *   npm run geocode:cnpj --workspace=apps/workers -- 100
 *   npm run geocode:cnpj --workspace=apps/workers -- 50 --dry-run
 *   CNPJ_GEOCODE_UF=SP npm run geocode:cnpj --workspace=apps/workers -- 200
 *
 * Variáveis de ambiente (apps/workers/.env):
 *   GOOGLE_MAPS_API_KEY      Obrigatória em modo real.
 *   CNPJ_GEOCODE_LIMIT       Limite padrão quando não passado via CLI (default: 50).
 *   CNPJ_GEOCODE_DELAY_MS    Delay entre chamadas à API (default: 150ms).
 *   CNPJ_GEOCODE_UF          Restringe a uma UF e ativa partition pruning.
 *   CNPJ_GEOCODE_PROGRESS_EVERY  Frequência de log de progresso (default: 10).
 */

import pg from "pg";
import {
  buildGeocodeAddress,
  fetchFromGoogleGeocoding,
  GeocodeRateLimitError,
} from "@radar/shared/server";

// ── Config ────────────────────────────────────────────────────────────────────

const cliArgs = process.argv.slice(2);
const DRY_RUN = cliArgs.includes("--dry-run");
const limitFromCli = cliArgs.find((a) => /^\d+$/.test(a));

const LIMIT = limitFromCli
  ? parseInt(limitFromCli, 10)
  : parseInt(process.env.CNPJ_GEOCODE_LIMIT ?? "50", 10);

const DELAY_MS = parseInt(process.env.CNPJ_GEOCODE_DELAY_MS ?? "150", 10);
const UF = process.env.CNPJ_GEOCODE_UF?.toUpperCase().trim() || null;
const PROGRESS_EVERY = parseInt(
  process.env.CNPJ_GEOCODE_PROGRESS_EVERY ?? "10",
  10
);
const API_KEY = process.env.GOOGLE_MAPS_API_KEY ?? "";
const DATABASE_URL = process.env.DATABASE_URL;

// ── Validação de config ───────────────────────────────────────────────────────

if (!DATABASE_URL) {
  console.error("ERRO: DATABASE_URL não definida");
  process.exit(1);
}

if (!DRY_RUN && !API_KEY) {
  console.error(
    "ERRO: GOOGLE_MAPS_API_KEY não definida.\n" +
      "      Use --dry-run para testar a seleção de registros sem chamar a API."
  );
  process.exit(1);
}

if (isNaN(LIMIT) || LIMIT <= 0) {
  console.error(`ERRO: limite inválido: "${limitFromCli ?? process.env.CNPJ_GEOCODE_LIMIT}"`);
  process.exit(1);
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface CnpjRow {
  id: string;
  uf: string;
  cnpj: string;
  razao_social: string;
  endereco: string;
  municipio_nome: string;
  criado_em: Date;
}

// geocode() e buildAddress() foram extraídos para @radar/shared/server
// (geocodeCompany usa a mesma lógica na cascata de enriquecimento sob
// demanda) — evita duplicar a chamada à Google Geocoding API em dois lugares.
async function geocode(address: string) {
  return fetchFromGoogleGeocoding(address, API_KEY);
}

// ── DB ────────────────────────────────────────────────────────────────────────

async function selectPending(client: pg.Client): Promise<CnpjRow[]> {
  // Prioridade: registros mais recentes (da última carga).
  // Quando UF está definida o planner usa só a partição correspondente (pruning).
  // Sem UF, as 27 partições são varridas — aceitável aqui porque o LIMIT é baixo
  // e este script nunca roda no caminho crítico de requisições HTTP.
  const conditions: string[] = [
    "latitude IS NULL",
    "longitude IS NULL",
    "endereco IS NOT NULL",
    "endereco <> ''",
    "situacao = 'Ativa'",
  ];
  const params: unknown[] = [];

  if (UF) {
    params.push(UF);
    conditions.unshift(`uf = $${params.length}`);
  }

  params.push(LIMIT);
  const limitPlaceholder = `$${params.length}`;

  const sql = `
    SELECT id, uf, cnpj, razao_social, endereco, municipio_nome, criado_em
    FROM company_cnpj
    WHERE ${conditions.join(" AND ")}
    ORDER BY criado_em DESC
    LIMIT ${limitPlaceholder}
  `;

  const result = await client.query<CnpjRow>(sql, params);
  return result.rows;
}

async function updateCoords(
  client: pg.Client,
  row: CnpjRow,
  lat: number,
  lng: number
): Promise<void> {
  // WHERE inclui `uf` para direcionar o UPDATE à partição correta.
  // ST_MakePoint recebe (longitude, latitude) — ordem oposta à convenção geográfica.
  // Este script só chama a Google Geocoding API (sem cascata CNEFE/BrasilAPI),
  // então geocode_source é sempre 'google_geocoding' quando resolve.
  await client.query(
    `UPDATE company_cnpj
     SET latitude       = $1,
         longitude      = $2,
         geom           = ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
         geocode_source = 'google_geocoding',
         atualizado_em  = NOW()
     WHERE id = $3 AND uf = $4`,
    [lat, lng, row.id, row.uf]
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildAddress(row: CnpjRow): string {
  return buildGeocodeAddress({
    endereco: row.endereco,
    municipioNome: row.municipio_nome,
    uf: row.uf,
  });
}

function pad(n: number, total: number): string {
  return String(n).padStart(String(total).length, " ");
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();

  console.log("Geocodificador de CNPJs");
  console.log("─".repeat(50));
  console.log(`Modo:        ${DRY_RUN ? "DRY-RUN (sem chamadas à API)" : "REAL"}`);
  console.log(`Limite:      ${LIMIT}`);
  console.log(`UF:          ${UF ?? "todas"}`);
  if (!DRY_RUN) {
    console.log(`Delay:       ${DELAY_MS} ms entre chamadas`);
    console.log(`Progresso:   a cada ${PROGRESS_EVERY} registro(s)`);
  }
  console.log("─".repeat(50));
  console.log();

  const rows = await selectPending(client);
  console.log(`${rows.length} registro(s) encontrado(s) para geocodificar.\n`);

  if (rows.length === 0) {
    console.log(
      "Nada a fazer. Possíveis causas:\n" +
        "  - Todos os registros com endereço já têm coordenadas\n" +
        "  - A tabela está vazia (rode import:receita primeiro)\n" +
        (UF ? `  - Nenhum registro Ativo sem coordenadas na UF ${UF}\n` : "")
    );
    await client.end();
    return;
  }

  let success = 0;
  let zeroResults = 0;
  let errors = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const pos = `${pad(i + 1, rows.length)}/${rows.length}`;
    const address = buildAddress(row);

    if (DRY_RUN) {
      console.log(
        `  [dry-run] ${pos}  cnpj=${row.cnpj}  uf=${row.uf}\n` +
          `             endereço: "${address}"`
      );
      success++;
      continue;
    }

    try {
      const result = await geocode(address);

      if (!result) {
        console.log(`  [zero]    ${pos}  cnpj=${row.cnpj}  "${address}"`);
        zeroResults++;
      } else {
        await updateCoords(client, row, result.lat, result.lng);
        success++;

        const isProgressTick =
          (i + 1) % PROGRESS_EVERY === 0 || i === rows.length - 1;
        if (isProgressTick) {
          console.log(
            `  [ok]      ${pos}  cnpj=${row.cnpj}  uf=${row.uf}  ` +
              `(${result.lat.toFixed(5)}, ${result.lng.toFixed(5)})`
          );
        }
      }
    } catch (err) {
      if (err instanceof GeocodeRateLimitError) {
        // Cota excedida: parar imediatamente para não continuar gastando.
        console.error(`\n  [PARADO]  ${pos}  ${err.message}`);
        console.error("  Aguarde reset da cota (geralmente 1 minuto) e reexecute.");
        break;
      }
      errors++;
      console.error(
        `  [erro]    ${pos}  cnpj=${row.cnpj}: ` +
          (err instanceof Error ? err.message : String(err))
      );
    }

    if (i < rows.length - 1) {
      await delay(DELAY_MS);
    }
  }

  console.log();
  console.log("─".repeat(50));
  console.log(`Processados: ${success + zeroResults + errors} / ${rows.length}`);
  console.log(`Sucesso:     ${success}`);
  console.log(`Sem resultado: ${zeroResults}`);
  console.log(`Erros:       ${errors}`);
  console.log("─".repeat(50));

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
