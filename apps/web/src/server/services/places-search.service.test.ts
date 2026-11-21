import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/server/repositories/places-cache.repository");

import * as cacheRepo from "@/server/repositories/places-cache.repository";
import { searchPlaces, getCoveringCells } from "./places-search.service";
import type { GooglePlaceResult } from "./places-search.service";
import type { PlacesCacheEntry } from "@/server/repositories/places-cache.repository";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PLACE_A: GooglePlaceResult = {
  place_id: "ChIJABC123",
  name: "Farmácia São João",
  vicinity: "Rua da Consolação, 100, São Paulo",
  geometry: { location: { lat: -23.55, lng: -46.64 } },
  types: ["pharmacy", "health", "establishment"],
  rating: 4.2,
  business_status: "OPERATIONAL",
};

const PLACE_B: GooglePlaceResult = {
  place_id: "ChIJXYZ456",
  name: "Drogaria Popular",
  vicinity: "Av. Paulista, 200, São Paulo",
  geometry: { location: { lat: -23.54, lng: -46.65 } },
  types: ["pharmacy", "health", "establishment"],
  rating: 3.8,
  business_status: "OPERATIONAL",
};

const LAT = -23.55;
const LNG = -46.64;
const RAIO_KM = 5;
const KEYWORD = "farmácia";

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockGoogleApi(places: GooglePlaceResult[] = [PLACE_A]) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "OK", results: places }),
    })
  );
}

function makeCacheEntry(
  cellKey: string,
  places: GooglePlaceResult[],
  keyword = KEYWORD
): PlacesCacheEntry {
  return {
    id: `uuid-${cellKey}`,
    grid_cell_key: cellKey,
    keyword,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resultado: places as any,
    criado_em: new Date("2026-06-01T00:00:00Z"),
    expira_em: new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000),
  };
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(cacheRepo.findByCells).mockResolvedValue([]);
  vi.mocked(cacheRepo.upsert).mockResolvedValue(undefined);
  mockGoogleApi([PLACE_A]);
  // Necessário para que fetchFromGooglePlaces não lance mesmo sem chave real
  process.env.GOOGLE_PLACES_API_KEY = "test-key";
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GOOGLE_PLACES_API_KEY;
});

// ── getCoveringCells ──────────────────────────────────────────────────────────

describe("getCoveringCells", () => {
  it("retorna ao menos 1 célula para qualquer busca", () => {
    const cells = getCoveringCells(LAT, LNG, 1);
    expect(cells.length).toBeGreaterThanOrEqual(1);
  });

  it("raio maior cobre mais células", () => {
    const small = getCoveringCells(LAT, LNG, 5);
    const large = getCoveringCells(LAT, LNG, 20);
    expect(large.length).toBeGreaterThan(small.length);
  });

  it("chave no formato latIdx:lngIdx com inteiros possivelmente negativos", () => {
    const cells = getCoveringCells(LAT, LNG, 10);
    for (const c of cells) {
      expect(c.key).toMatch(/^-?\d+:-?\d+$/);
    }
  });

  it("células têm latIdx e lngIdx coerentes com a chave", () => {
    const cells = getCoveringCells(LAT, LNG, 5);
    for (const c of cells) {
      expect(c.key).toBe(`${c.latIdx}:${c.lngIdx}`);
    }
  });
});

// ── searchPlaces — cache miss (primeira busca) ────────────────────────────────

describe("searchPlaces — cache miss", () => {
  it("chama o Google Places API quando não há cache", async () => {
    await searchPlaces({ lat: LAT, lng: LNG, raioKm: RAIO_KM, keyword: KEYWORD });

    expect(global.fetch).toHaveBeenCalled();
  });

  it("retorna os resultados vindos da API", async () => {
    const results = await searchPlaces({
      lat: LAT,
      lng: LNG,
      raioKm: RAIO_KM,
      keyword: KEYWORD,
    });

    expect(results.some((r) => r.place_id === PLACE_A.place_id)).toBe(true);
  });

  it("persiste resultado no cache após chamada à API", async () => {
    await searchPlaces({ lat: LAT, lng: LNG, raioKm: RAIO_KM, keyword: KEYWORD });

    expect(cacheRepo.upsert).toHaveBeenCalled();
    const [, kw, data, expiraEm] = vi.mocked(cacheRepo.upsert).mock.calls[0];
    expect(kw).toBe(KEYWORD);
    expect(data).toEqual([PLACE_A]);
    expect(expiraEm).toBeInstanceOf(Date);
    expect((expiraEm as Date).getTime()).toBeGreaterThan(Date.now());
  });

  it("chama upsert uma vez por célula faltante", async () => {
    const cells = getCoveringCells(LAT, LNG, RAIO_KM);
    await searchPlaces({ lat: LAT, lng: LNG, raioKm: RAIO_KM, keyword: KEYWORD });

    expect(cacheRepo.upsert).toHaveBeenCalledTimes(cells.length);
  });
});

// ── searchPlaces — cache hit (segunda busca na mesma região) ──────────────────

describe("searchPlaces — cache hit", () => {
  it("NÃO chama a API quando todos os cells estão em cache", async () => {
    const cells = getCoveringCells(LAT, LNG, RAIO_KM);
    vi.mocked(cacheRepo.findByCells).mockResolvedValue(
      cells.map((c) => makeCacheEntry(c.key, [PLACE_A]))
    );

    await searchPlaces({ lat: LAT, lng: LNG, raioKm: RAIO_KM, keyword: KEYWORD });

    expect(global.fetch).not.toHaveBeenCalled();
    expect(cacheRepo.upsert).not.toHaveBeenCalled();
  });

  it("retorna os resultados do cache sem nova chamada à API", async () => {
    const cells = getCoveringCells(LAT, LNG, RAIO_KM);
    vi.mocked(cacheRepo.findByCells).mockResolvedValue(
      cells.map((c) => makeCacheEntry(c.key, [PLACE_A]))
    );

    const results = await searchPlaces({
      lat: LAT,
      lng: LNG,
      raioKm: RAIO_KM,
      keyword: KEYWORD,
    });

    expect(results).toHaveLength(1);
    expect(results[0].place_id).toBe(PLACE_A.place_id);
  });

  it("deduplica place_id quando o mesmo negócio aparece em múltiplas células", async () => {
    const cells = getCoveringCells(LAT, LNG, RAIO_KM);
    // Ambas as células retornam PLACE_A — simula sobreposição na borda
    vi.mocked(cacheRepo.findByCells).mockResolvedValue(
      cells.map((c) => makeCacheEntry(c.key, [PLACE_A]))
    );

    const results = await searchPlaces({
      lat: LAT,
      lng: LNG,
      raioKm: RAIO_KM,
      keyword: KEYWORD,
    });

    const ids = results.map((r) => r.place_id);
    expect(ids.filter((id) => id === PLACE_A.place_id)).toHaveLength(1);
  });
});

// ── searchPlaces — cache parcial ──────────────────────────────────────────────

describe("searchPlaces — cache parcial (algumas células faltando)", () => {
  it("chama a API apenas para células faltantes", async () => {
    const cells = getCoveringCells(LAT, LNG, RAIO_KM);
    // Só a primeira célula está em cache
    vi.mocked(cacheRepo.findByCells).mockResolvedValue([
      makeCacheEntry(cells[0].key, [PLACE_A]),
    ]);

    await searchPlaces({ lat: LAT, lng: LNG, raioKm: RAIO_KM, keyword: KEYWORD });

    // Deve salvar as (N - 1) células restantes
    expect(cacheRepo.upsert).toHaveBeenCalledTimes(cells.length - 1);
  });

  it("combina resultados do cache com os frescos da API, sem duplicatas", async () => {
    const cells = getCoveringCells(LAT, LNG, RAIO_KM);
    vi.mocked(cacheRepo.findByCells).mockResolvedValue([
      makeCacheEntry(cells[0].key, [PLACE_A]),
    ]);
    // API retorna PLACE_B para as células faltantes
    mockGoogleApi([PLACE_B]);

    const results = await searchPlaces({
      lat: LAT,
      lng: LNG,
      raioKm: RAIO_KM,
      keyword: KEYWORD,
    });

    const ids = results.map((r) => r.place_id);
    expect(ids).toContain(PLACE_A.place_id);
    expect(ids).toContain(PLACE_B.place_id);
  });
});

// ── searchPlaces — keyword vazia ──────────────────────────────────────────────

describe("searchPlaces — sem keyword", () => {
  it("normaliza keyword undefined para string vazia ao consultar cache", async () => {
    await searchPlaces({ lat: LAT, lng: LNG, raioKm: RAIO_KM });

    expect(cacheRepo.findByCells).toHaveBeenCalledWith(
      expect.any(Array),
      ""
    );
  });

  it("não inclui keyword na URL da API quando vazia", async () => {
    await searchPlaces({ lat: LAT, lng: LNG, raioKm: RAIO_KM });

    const url = (vi.mocked(global.fetch).mock.calls[0]?.[0] as string) ?? "";
    expect(url).not.toContain("keyword=");
  });
});

// ── searchPlaces — raio excessivo ─────────────────────────────────────────────

describe("searchPlaces — raio excessivo", () => {
  it("lança erro quando o raio cobre mais de MAX_CELLS células", async () => {
    // 200 km cobre centenas de células — deve ser rejeitado
    await expect(
      searchPlaces({ lat: LAT, lng: LNG, raioKm: 200, keyword: KEYWORD })
    ).rejects.toThrow(/células.*máximo/i);
  });
});
