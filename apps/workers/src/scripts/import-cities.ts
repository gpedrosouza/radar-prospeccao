/**
 * Importa municípios brasileiros (código IBGE, nome, UF, latitude, longitude)
 * para a tabela cities — usada pela busca por raio da tela de Mapa
 * (city.repository.findWithinRadius).
 *
 * Fonte: github.com/kelvins/municipios-brasileiros — dataset comunitário
 * derivado dos dados oficiais do IBGE (malha de sedes municipais), mantido
 * publicamente e amplamente usado pela comunidade brasileira de dev. Cobre
 * os 5.570 municípios do Brasil. Não inclui distritos — todo registro é
 * importado com categoria = 'municipio' (é o que findWithinRadius filtra).
 *
 * Uso:
 *   npm run import:cities --workspace=apps/workers
 *   npm run import:cities --workspace=apps/workers -- --dry-run
 *
 * Variáveis de ambiente (apps/workers/.env):
 *   DATABASE_URL                  Obrigatória.
 *   CITIES_IMPORT_MUNICIPIOS_URL  Default: raw do kelvins/municipios-brasileiros.
 *   CITIES_IMPORT_ESTADOS_URL     Default: raw do kelvins/municipios-brasileiros.
 *
 * Idempotente: upsert por codigo_ibge (ON CONFLICT DO UPDATE) — seguro
 * rodar de novo para atualizar coordenadas caso a fonte publique correções.
 */

import pg from "pg";
import { parse } from "csv-parse/sync";

const DEFAULT_MUNICIPIOS_URL =
  "https://raw.githubusercontent.com/kelvins/municipios-brasileiros/main/csv/municipios.csv";
const DEFAULT_ESTADOS_URL =
  "https://raw.githubusercontent.com/kelvins/municipios-brasileiros/main/csv/estados.csv";

const cliArgs = process.argv.slice(2);
const DRY_RUN = cliArgs.includes("--dry-run");

const MUNICIPIOS_URL = process.env.CITIES_IMPORT_MUNICIPIOS_URL ?? DEFAULT_MUNICIPIOS_URL;
const ESTADOS_URL = process.env.CITIES_IMPORT_ESTADOS_URL ?? DEFAULT_ESTADOS_URL;
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("ERRO: DATABASE_URL não definida");
  process.exit(1);
}

// ── Tipos das linhas de origem ────────────────────────────────────────────────

interface EstadoRow {
  codigo_uf: string;
  uf: string;
}

interface MunicipioRow {
  codigo_ibge: string;
  nome: string;
  latitude: string;
  longitude: string;
  codigo_uf: string;
}

interface CityRow {
  codigo_ibge: number;
  nome: string;
  uf: string;
  lat: number;
  lng: number;
}

// ── Download + parse ──────────────────────────────────────────────────────────

async function fetchCsv<T>(url: string): Promise<T[]> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Falha ao baixar ${url}: HTTP ${res.status}`);
  }
  const text = await res.text();
  return parse(text, { columns: true, skip_empty_lines: true, bom: true }) as T[];
}

function buildCityRows(municipios: MunicipioRow[], estados: EstadoRow[]): CityRow[] {
  const ufByCodigoUf = new Map(estados.map((e) => [e.codigo_uf, e.uf]));
  const rows: CityRow[] = [];

  for (const m of municipios) {
    const uf = ufByCodigoUf.get(m.codigo_uf);
    const lat = parseFloat(m.latitude);
    const lng = parseFloat(m.longitude);

    if (!uf || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      console.warn(`  [ignorado] codigo_ibge=${m.codigo_ibge} nome="${m.nome}" — uf ou coordenada inválida`);
      continue;
    }

    rows.push({ codigo_ibge: parseInt(m.codigo_ibge, 10), nome: m.nome, uf, lat, lng });
  }

  return rows;
}

// ── DB ────────────────────────────────────────────────────────────────────────

async function upsertCities(client: pg.Client, rows: CityRow[]): Promise<void> {
  await client.query("BEGIN");
  try {
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      await client.query(
        `INSERT INTO cities (codigo_ibge, nome, uf, categoria, latitude, longitude, geom)
         VALUES ($1, $2, $3, 'municipio', $4, $5, ST_SetSRID(ST_MakePoint($5, $4), 4326)::geography)
         ON CONFLICT (codigo_ibge) DO UPDATE
         SET nome      = EXCLUDED.nome,
             uf        = EXCLUDED.uf,
             latitude  = EXCLUDED.latitude,
             longitude = EXCLUDED.longitude,
             geom      = EXCLUDED.geom`,
        [r.codigo_ibge, r.nome, r.uf, r.lat, r.lng]
      );

      if ((i + 1) % 1000 === 0 || i === rows.length - 1) {
        console.log(`  ${i + 1}/${rows.length} processados...`);
      }
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("Importador de municípios (cities)");
  console.log("─".repeat(50));
  console.log(`Modo:        ${DRY_RUN ? "DRY-RUN (sem escrita no banco)" : "REAL"}`);
  console.log(`Municípios:  ${MUNICIPIOS_URL}`);
  console.log(`Estados:     ${ESTADOS_URL}`);
  console.log("─".repeat(50));
  console.log();

  console.log("Baixando dados...");
  const [municipios, estados] = await Promise.all([
    fetchCsv<MunicipioRow>(MUNICIPIOS_URL),
    fetchCsv<EstadoRow>(ESTADOS_URL),
  ]);
  console.log(`${municipios.length} município(s) e ${estados.length} UF(s) baixados.\n`);

  const rows = buildCityRows(municipios, estados);

  if (DRY_RUN) {
    console.log("Amostra (5 primeiros):");
    for (const r of rows.slice(0, 5)) {
      console.log(`  ${r.codigo_ibge}  ${r.nome}/${r.uf}  (${r.lat}, ${r.lng})`);
    }
    console.log(`\n${rows.length} registro(s) seriam upsertados em cities. Nenhuma escrita realizada (--dry-run).`);
    return;
  }

  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await upsertCities(client, rows);
  } finally {
    await client.end();
  }

  console.log();
  console.log("─".repeat(50));
  console.log(`Concluído: ${rows.length} município(s) upsertados em cities.`);
  console.log("─".repeat(50));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
