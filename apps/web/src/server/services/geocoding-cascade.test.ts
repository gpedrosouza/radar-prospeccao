/**
 * Testes do módulo de geocodificação compartilhado (@radar/shared/server).
 *
 * A implementação vive em packages/shared porque é usada tanto por
 * apps/web (fila de enriquecimento) quanto por apps/workers (consumer +
 * script manual geocode-cnpj.ts) — o teste roda aqui porque apps/web já tem
 * vitest configurado (packages/shared e apps/workers não têm runner).
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  extractCepFromEndereco,
  buildGeocodeAddress,
  fetchFromGoogleGeocoding,
  fetchFromBrasilApiCep,
  geocodeCompany,
  GeocodeRateLimitError,
  type GeocodeCompanyDeps,
} from "@radar/shared/server";

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── extractCepFromEndereco ──────────────────────────────────────────────────

describe("extractCepFromEndereco", () => {
  it("extrai o CEP do final da string", () => {
    expect(extractCepFromEndereco("R FLORIANO PEIXOTO 100 CENTRO 01310100")).toBe("01310100");
  });

  it("retorna null quando não há 8 dígitos no final", () => {
    expect(extractCepFromEndereco("R FLORIANO PEIXOTO 100 CENTRO")).toBeNull();
  });

  it("retorna null para CEP todo-zero", () => {
    expect(extractCepFromEndereco("R FLORIANO PEIXOTO 100 CENTRO 00000000")).toBeNull();
  });

  it("retorna null quando o CEP não está no final (erro de dado)", () => {
    expect(extractCepFromEndereco("R FLORIANO 01310100 PEIXOTO APTO 5")).toBeNull();
  });

  it("retorna null para string vazia", () => {
    expect(extractCepFromEndereco("")).toBeNull();
  });

  it("aceita a string sendo só o CEP", () => {
    expect(extractCepFromEndereco("01310100")).toBe("01310100");
  });

  it("ignora espaços em branco à volta", () => {
    expect(extractCepFromEndereco("  R FLORIANO 01310100  ")).toBe("01310100");
  });

  it("com mais de 8 dígitos consecutivos no final, pega só os últimos 8", () => {
    expect(extractCepFromEndereco("R FLORIANO 123456789")).toBe("23456789");
  });
});

// ── buildGeocodeAddress ──────────────────────────────────────────────────────

describe("buildGeocodeAddress", () => {
  it("monta endereço completo quando há endereco", () => {
    expect(
      buildGeocodeAddress({
        endereco: "R FLORIANO PEIXOTO 100",
        municipioNome: "SAO CARLOS",
        uf: "SP",
      })
    ).toBe("R FLORIANO PEIXOTO 100, SAO CARLOS - SP, Brasil");
  });

  it("omite o endereco sem deixar vírgula sobrando quando é null", () => {
    expect(
      buildGeocodeAddress({ endereco: null, municipioNome: "SAO CARLOS", uf: "SP" })
    ).toBe("SAO CARLOS - SP, Brasil");
  });
});

// ── fetchFromGoogleGeocoding ──────────────────────────────────────────────────

describe("fetchFromGoogleGeocoding", () => {
  it("retorna lat/lng/formatted_address quando status OK", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "OK",
          results: [
            {
              formatted_address: "Av. Paulista, São Paulo - SP, Brasil",
              geometry: { location: { lat: -23.5613, lng: -46.6565 } },
            },
          ],
        }),
      })
    );

    const result = await fetchFromGoogleGeocoding("Av. Paulista, São Paulo - SP, Brasil", "key123");

    expect(result).toEqual({
      lat: -23.5613,
      lng: -46.6565,
      formatted_address: "Av. Paulista, São Paulo - SP, Brasil",
    });
  });

  it("retorna null para ZERO_RESULTS", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "ZERO_RESULTS", results: [] }) })
    );

    const result = await fetchFromGoogleGeocoding("endereço inexistente", "key123");
    expect(result).toBeNull();
  });

  it("lança GeocodeRateLimitError para OVER_QUERY_LIMIT", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "OVER_QUERY_LIMIT", results: [] }) })
    );

    await expect(fetchFromGoogleGeocoding("qualquer", "key123")).rejects.toBeInstanceOf(
      GeocodeRateLimitError
    );
  });

  it("lança erro genérico para outros status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: "REQUEST_DENIED", error_message: "chave inválida", results: [] }),
      })
    );

    await expect(fetchFromGoogleGeocoding("qualquer", "key-invalida")).rejects.toThrow(
      /REQUEST_DENIED.*chave inválida/
    );
  });

  it("lança erro quando a resposta HTTP não é ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: "Internal Error" }));

    await expect(fetchFromGoogleGeocoding("qualquer", "key123")).rejects.toThrow(/HTTP 500/);
  });
});

// ── fetchFromBrasilApiCep ────────────────────────────────────────────────────

describe("fetchFromBrasilApiCep", () => {
  it("retorna null para CEP não encontrado (404)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    const result = await fetchFromBrasilApiCep("00000000");
    expect(result).toBeNull();
  });

  it("retorna null quando a resposta não tem coordenadas (caso real mais comum)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          cep: "01001000",
          state: "SP",
          city: "São Paulo",
          location: { type: "Point", coordinates: {} },
        }),
      })
    );

    const result = await fetchFromBrasilApiCep("01001000");
    expect(result).toBeNull();
  });

  it("retorna lat/lng quando a resposta tem coordenadas", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          location: { coordinates: { latitude: "-23.5613", longitude: "-46.6565" } },
        }),
      })
    );

    const result = await fetchFromBrasilApiCep("01310100");
    expect(result).toEqual({ lat: -23.5613, lng: -46.6565 });
  });

  it("lança erro para falha HTTP diferente de 404", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    await expect(fetchFromBrasilApiCep("01310100")).rejects.toThrow(/HTTP 500/);
  });
});

// ── geocodeCompany (cascata) ──────────────────────────────────────────────────
// Ordem: CNEFE por CEP → CNEFE por município → BrasilAPI CEP → Google Geocoding.

describe("geocodeCompany", () => {
  const BASE_INPUT = { endereco: "R FLORIANO PEIXOTO 100 CENTRO 01310100", municipioNome: "SAO CARLOS", uf: "SP" };

  function deps(overrides: Partial<GeocodeCompanyDeps> = {}): GeocodeCompanyDeps {
    return {
      lookupCnefeCep: overrides.lookupCnefeCep ?? (() => Promise.resolve(null)),
      lookupCnefeCentroid: overrides.lookupCnefeCentroid ?? (() => Promise.resolve(null)),
      googleApiKey: overrides.googleApiKey,
    };
  }

  it("resolve via CNEFE por CEP sem chamar nenhuma outra fonte", async () => {
    const lookupCnefeCep = vi.fn().mockResolvedValue({ lat: -22.0, lng: -47.9 });
    const lookupCnefeCentroid = vi.fn().mockResolvedValue({ lat: -21.0, lng: -46.0 }); // não deveria ser chamado
    vi.stubGlobal("fetch", vi.fn());

    const outcome = await geocodeCompany(BASE_INPUT, deps({ lookupCnefeCep, lookupCnefeCentroid, googleApiKey: "key123" }));

    expect(outcome).toEqual({
      result: { lat: -22.0, lng: -47.9, source: "cnefe_cep" },
      googleAttempted: false,
    });
    expect(lookupCnefeCentroid).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("cai para CNEFE por município quando não há CEP extraível no endereço", async () => {
    const lookupCnefeCep = vi.fn().mockResolvedValue({ lat: -99, lng: -99 }); // não deveria ser chamado (sem CEP)
    const lookupCnefeCentroid = vi.fn().mockResolvedValue({ lat: -22.0, lng: -47.9 });
    vi.stubGlobal("fetch", vi.fn());

    const outcome = await geocodeCompany(
      { endereco: "ENDERECO SEM CEP", municipioNome: "SAO CARLOS", uf: "SP" },
      deps({ lookupCnefeCep, lookupCnefeCentroid, googleApiKey: "key123" })
    );

    expect(outcome).toEqual({
      result: { lat: -22.0, lng: -47.9, source: "cnefe_municipio" },
      googleAttempted: false,
    });
    expect(lookupCnefeCep).not.toHaveBeenCalled();
  });

  it("cai para CNEFE por município quando há CEP mas cnefe_ceps não tem correspondência", async () => {
    const lookupCnefeCep = vi.fn().mockResolvedValue(null);
    const lookupCnefeCentroid = vi.fn().mockResolvedValue({ lat: -22.0, lng: -47.9 });
    vi.stubGlobal("fetch", vi.fn());

    const outcome = await geocodeCompany(BASE_INPUT, deps({ lookupCnefeCep, lookupCnefeCentroid, googleApiKey: "key123" }));

    expect(outcome).toEqual({
      result: { lat: -22.0, lng: -47.9, source: "cnefe_municipio" },
      googleAttempted: false,
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("cai para BrasilAPI quando nenhum CNEFE resolve e há CEP extraível", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ location: { coordinates: { latitude: "-23.5", longitude: "-46.6" } } }),
      })
    );

    const outcome = await geocodeCompany(BASE_INPUT, deps({ googleApiKey: "key123" }));

    expect(outcome).toEqual({
      result: { lat: -23.5, lng: -46.6, source: "brasilapi_cep" },
      googleAttempted: false,
    });
  });

  it("cai para Google quando CNEFE (CEP e município) e BrasilAPI não resolvem", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        // BrasilAPI: sem coordenada
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ location: { coordinates: {} } }),
        })
        // Google: resolve
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            status: "OK",
            results: [{ formatted_address: "endereço", geometry: { location: { lat: -22.01, lng: -47.91 } } }],
          }),
        })
    );

    const outcome = await geocodeCompany(BASE_INPUT, deps({ googleApiKey: "key123" }));

    expect(outcome).toEqual({
      result: { lat: -22.01, lng: -47.91, source: "google_geocoding" },
      googleAttempted: true,
    });
  });

  it("pula BrasilAPI direto para Google quando não há CEP extraível e CNEFE por município falha", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "OK",
        results: [{ formatted_address: "endereço", geometry: { location: { lat: -22.01, lng: -47.91 } } }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const outcome = await geocodeCompany(
      { endereco: "ENDERECO SEM CEP", municipioNome: "SAO CARLOS", uf: "SP" },
      deps({ googleApiKey: "key123" })
    );

    expect(outcome.result?.source).toBe("google_geocoding");
    expect(outcome.googleAttempted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1); // só a chamada ao Google, BrasilAPI nunca foi tentada
  });

  it("respeita o cap de custo: sem googleApiKey, não tenta Google mesmo com CEP disponível", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ location: { coordinates: {} } }) })
    );

    const outcome = await geocodeCompany(BASE_INPUT, deps({ googleApiKey: undefined }));

    expect(outcome).toEqual({ result: null, googleAttempted: false });
  });

  it("marca googleAttempted mesmo quando Google não resolve (ZERO_RESULTS ainda custa)", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ location: { coordinates: {} } }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ status: "ZERO_RESULTS", results: [] }) })
    );

    const outcome = await geocodeCompany(BASE_INPUT, deps({ googleApiKey: "key123" }));

    expect(outcome).toEqual({ result: null, googleAttempted: true });
  });
});
