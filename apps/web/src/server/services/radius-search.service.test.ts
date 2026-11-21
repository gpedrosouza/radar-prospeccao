import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/server/repositories/city.repository");

import * as cityRepo from "@/server/repositories/city.repository";
import { getRadiusCities, InvalidGeoParamsError } from "./radius-search.service";

const CITY_A = { codigo_ibge: 3550308, nome: "São Paulo", uf: "SP", distancia_km: 0,    municipio_codigo_rf: 7107 };
const CITY_B = { codigo_ibge: 3506300, nome: "Barueri",  uf: "SP", distancia_km: 18.5, municipio_codigo_rf: 1029 };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getRadiusCities", () => {
  it("retorna cidades do repository com os parâmetros corretos", async () => {
    vi.mocked(cityRepo.findWithinRadius).mockResolvedValue([CITY_A, CITY_B]);

    const result = await getRadiusCities(-23.5489, -46.6388, 20);

    expect(cityRepo.findWithinRadius).toHaveBeenCalledWith(-23.5489, -46.6388, 20);
    expect(result).toEqual([CITY_A, CITY_B]);
  });

  it("retorna array vazio quando nenhuma cidade está no raio", async () => {
    vi.mocked(cityRepo.findWithinRadius).mockResolvedValue([]);

    const result = await getRadiusCities(-23.5489, -46.6388, 1);

    expect(result).toHaveLength(0);
  });

  it("raio zero lança InvalidGeoParamsError sem chamar o repository", async () => {
    await expect(getRadiusCities(-23.5, -46.6, 0)).rejects.toBeInstanceOf(
      InvalidGeoParamsError
    );
    expect(cityRepo.findWithinRadius).not.toHaveBeenCalled();
  });

  it("raio negativo lança InvalidGeoParamsError", async () => {
    await expect(getRadiusCities(-23.5, -46.6, -10)).rejects.toBeInstanceOf(
      InvalidGeoParamsError
    );
  });

  it("lat > 90 lança InvalidGeoParamsError", async () => {
    await expect(getRadiusCities(91, -46.6, 10)).rejects.toBeInstanceOf(
      InvalidGeoParamsError
    );
  });

  it("lat < -90 lança InvalidGeoParamsError", async () => {
    await expect(getRadiusCities(-91, -46.6, 10)).rejects.toBeInstanceOf(
      InvalidGeoParamsError
    );
  });

  it("lng > 180 lança InvalidGeoParamsError", async () => {
    await expect(getRadiusCities(-23.5, 181, 10)).rejects.toBeInstanceOf(
      InvalidGeoParamsError
    );
  });

  it("lng < -180 lança InvalidGeoParamsError", async () => {
    await expect(getRadiusCities(-23.5, -181, 10)).rejects.toBeInstanceOf(
      InvalidGeoParamsError
    );
  });

  it("parâmetros nos limites extremos válidos não lançam erro", async () => {
    vi.mocked(cityRepo.findWithinRadius).mockResolvedValue([]);

    await expect(getRadiusCities(90, 180, 500)).resolves.toEqual([]);
    await expect(getRadiusCities(-90, -180, 0.1)).resolves.toEqual([]);
  });
});
