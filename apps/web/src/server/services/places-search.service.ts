/**
 * Busca de empresas no Google Places com cache por grid geográfico.
 *
 * Estratégia de cache:
 *   O território é dividido em células quadradas de CELL_DEGREES graus (~11km).
 *   Cada célula armazena os Places encontrados ao buscar do seu centro com raio
 *   CELL_RADIUS_KM (metade da diagonal — cobre os quatro cantos).
 *
 *   1. Para uma busca (lat, lng, raio, keyword), calcula a bounding box e lista
 *      todas as células que ela cobre.
 *   2. Consulta o banco — células com cache válido (não expirado) não geram
 *      chamada à API.
 *   3. Para cada célula sem cache: chama o Google Places Nearby Search centrado
 *      no centro geométrico da célula e persiste o resultado.
 *   4. Combina todos os resultados (cache + frescos) deduplicando por place_id.
 *
 * Custo estimado com 80% de cache hit:
 *   Sem cache:  100 buscas × $0,032  = $3,20
 *   Com cache:   20 buscas × $0,032  = $0,64  (80% de redução)
 *
 * Evolução futura: substituir CELL_DEGREES por H3 para células hexagonais
 * sem distorção em altas latitudes.
 */

import * as placesCacheRepo from "@/server/repositories/places-cache.repository";

// ── Configuração do grid ──────────────────────────────────────────────────────

// Lado da célula em graus. 0,1° ≈ 11,1 km na linha do equador (~10,2 km em SP).
// Sobrescreva com PLACES_CACHE_CELL_DEGREES para testes ou ajuste de granularidade.
const CELL_DEGREES = parseFloat(
  process.env.PLACES_CACHE_CELL_DEGREES ?? "0.1"
);

// Raio (km) usado ao chamar a API por célula: metade da diagonal da célula,
// para que o círculo de busca cubra todos os quatro cantos sem grandes buracos.
const CELL_RADIUS_KM = (CELL_DEGREES * 111 * Math.SQRT2) / 2; // ≈ 7,85 km

// ── Tipos públicos ────────────────────────────────────────────────────────────

export interface GooglePlaceResult {
  place_id: string;
  name: string;
  vicinity: string;
  geometry: {
    location: { lat: number; lng: number };
  };
  types: string[];
  rating?: number;
  user_ratings_total?: number;
  business_status?: string;
}

export interface PlacesSearchParams {
  lat: number;
  lng: number;
  raioKm: number;
  keyword?: string;
}

export interface CellRef {
  key: string;
  latIdx: number;
  lngIdx: number;
}

// ── Grid math ─────────────────────────────────────────────────────────────────

function cellIndex(coord: number): number {
  return Math.floor(coord / CELL_DEGREES);
}

function buildCellKey(latIdx: number, lngIdx: number): string {
  return `${latIdx}:${lngIdx}`;
}

function cellCenter(latIdx: number, lngIdx: number): { lat: number; lng: number } {
  return {
    lat: (latIdx + 0.5) * CELL_DEGREES,
    lng: (lngIdx + 0.5) * CELL_DEGREES,
  };
}

/**
 * Retorna todas as células do grid cobertas pela bounding box de um raio de busca.
 * Exportada para permitir testes unitários independentes.
 */
export function getCoveringCells(
  lat: number,
  lng: number,
  radiusKm: number
): CellRef[] {
  const latDelta = radiusKm / 111;
  const lngDelta = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));

  const latIdxMin = cellIndex(lat - latDelta);
  const latIdxMax = cellIndex(lat + latDelta);
  const lngIdxMin = cellIndex(lng - lngDelta);
  const lngIdxMax = cellIndex(lng + lngDelta);

  const cells: CellRef[] = [];
  for (let latIdx = latIdxMin; latIdx <= latIdxMax; latIdx++) {
    for (let lngIdx = lngIdxMin; lngIdx <= lngIdxMax; lngIdx++) {
      cells.push({
        key: buildCellKey(latIdx, lngIdx),
        latIdx,
        lngIdx,
      });
    }
  }
  return cells;
}

// ── Google Places API client ──────────────────────────────────────────────────

async function fetchFromGooglePlaces(
  lat: number,
  lng: number,
  radiusMeters: number,
  keyword: string
): Promise<GooglePlaceResult[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_PLACES_API_KEY não configurada");

  const params = new URLSearchParams({
    location: `${lat},${lng}`,
    radius: String(Math.round(radiusMeters)),
    key: apiKey,
  });
  if (keyword) params.set("keyword", keyword);

  const resp = await fetch(
    `https://maps.googleapis.com/maps/api/place/nearbysearch/json?${params}`
  );

  if (!resp.ok) {
    throw new Error(`Google Places API HTTP error: ${resp.status}`);
  }

  const data = (await resp.json()) as {
    status: string;
    results: GooglePlaceResult[];
  };

  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    throw new Error(`Google Places API retornou status inesperado: ${data.status}`);
  }

  return data.results ?? [];
}

// ── Service ───────────────────────────────────────────────────────────────────

/** Número máximo de células que uma busca pode cobrir. Protege contra raios excessivos. */
const MAX_CELLS = 25;

/**
 * Busca empresas no Google Places com cache por célula de grid.
 *
 * Para um raio típico de 10 km cobre ~4–9 células (0,1° por lado).
 * Retorna os resultados já deduplicados por place_id.
 */
export async function searchPlaces(
  params: PlacesSearchParams
): Promise<GooglePlaceResult[]> {
  const { lat, lng, raioKm, keyword = "" } = params;

  const cells = getCoveringCells(lat, lng, raioKm);

  if (cells.length > MAX_CELLS) {
    throw new Error(
      `Raio muito grande: cobre ${cells.length} células (máximo ${MAX_CELLS}). ` +
        `Reduza o raio de busca.`
    );
  }

  const cellKeys = cells.map((c) => c.key);

  // Uma única query busca todos os hits de cache
  const cachedEntries = await placesCacheRepo.findByCells(cellKeys, keyword);
  const cachedCellKeys = new Set(cachedEntries.map((e) => e.grid_cell_key));

  const missingCells = cells.filter((c) => !cachedCellKeys.has(c.key));

  // Busca sequencial para respeitar rate limits da API
  const freshResultGroups: GooglePlaceResult[][] = [];
  if (missingCells.length > 0) {
    const ttlDays = parseInt(process.env.PLACES_CACHE_TTL_DAYS ?? "30", 10);
    const expiraEm = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1_000);
    const radiusMeters = CELL_RADIUS_KM * 1_000;

    for (const cell of missingCells) {
      const { lat: cLat, lng: cLng } = cellCenter(cell.latIdx, cell.lngIdx);
      const results = await fetchFromGooglePlaces(cLat, cLng, radiusMeters, keyword);
      await placesCacheRepo.upsert(cell.key, keyword, results, expiraEm);
      freshResultGroups.push(results);
    }
  }

  // Merge com deduplicação por place_id — vizinhos podem retornar o mesmo negócio
  const seen = new Set<string>();
  const merged: GooglePlaceResult[] = [];

  const allGroups = [
    ...cachedEntries.map((e) => e.resultado as unknown as GooglePlaceResult[]),
    ...freshResultGroups,
  ];

  for (const group of allGroups) {
    for (const place of group) {
      if (!seen.has(place.place_id)) {
        seen.add(place.place_id);
        merged.push(place);
      }
    }
  }

  return merged;
}
