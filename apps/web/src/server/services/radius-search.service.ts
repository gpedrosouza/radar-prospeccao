import * as cityRepository from "@/server/repositories/city.repository";
import type { CityInRadius } from "@/server/repositories/city.repository";

export type { CityInRadius };

// ── Erros de domínio ──────────────────────────────────────────────────────────

export class InvalidGeoParamsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidGeoParamsError";
  }
}

// ── Implementação ─────────────────────────────────────────────────────────────

/**
 * Retorna municípios dentro do raio, ordenados por distância.
 * Lança InvalidGeoParamsError se os parâmetros estiverem fora dos limites válidos.
 */
export async function getRadiusCities(
  lat: number,
  lng: number,
  raioKm: number
): Promise<CityInRadius[]> {
  if (raioKm <= 0) {
    throw new InvalidGeoParamsError(`raio_km deve ser positivo, recebido: ${raioKm}`);
  }
  if (lat < -90 || lat > 90) {
    throw new InvalidGeoParamsError(`lat deve estar entre -90 e 90, recebido: ${lat}`);
  }
  if (lng < -180 || lng > 180) {
    throw new InvalidGeoParamsError(`lng deve estar entre -180 e 180, recebido: ${lng}`);
  }

  return cityRepository.findWithinRadius(lat, lng, raioKm);
}
