/**
 * Teste de integração — city.repository.findWithinRadius
 *
 * Banco real (PostgreSQL local via DATABASE_URL em .env.local), seguindo a
 * convenção de apps/web/src/__tests__/api/*.integration.test.ts.
 *
 * Semeia cidades sintéticas com codigo_ibge fora da faixa real do IBGE
 * (9990000+) para nunca colidir com dados reais, e as remove ao final.
 * geom não pode ser setado via Prisma Client (tipo Unsupported) — cada
 * seed faz INSERT via Prisma seguido de UPDATE raw, replicando o mesmo
 * padrão de backfill usado na migration 20260721000001_cities_geom_index.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { findWithinRadius, findByCodigoIbge } from "./city.repository";

const prisma = new PrismaClient();

// ── Fixtures ──────────────────────────────────────────────────────────────────
// Centro: São Carlos/SP (-22.0087, -47.8909). Deslocamentos apenas em latitude
// (1° lat ≈ 111km) para manter as distâncias fáceis de prever.

const CENTRO_LAT = -22.0087;
const CENTRO_LNG = -47.8909;

const TEST_CODES = [9990001, 9990002, 9990003, 9990004] as const;

const FIXTURES = [
  { codigo_ibge: 9990001, nome: "Teste Centro",      lat: CENTRO_LAT,               categoria: "municipio" as const }, // ~0km
  { codigo_ibge: 9990002, nome: "Teste 20km",         lat: CENTRO_LAT + 20 / 111,     categoria: "municipio" as const }, // ~20km
  { codigo_ibge: 9990003, nome: "Teste 35km",         lat: CENTRO_LAT + 35 / 111,     categoria: "municipio" as const }, // ~35km
  { codigo_ibge: 9990004, nome: "Teste 100km fora",   lat: CENTRO_LAT + 100 / 111,    categoria: "municipio" as const }, // ~100km — fora do raio de 40km
];

async function cleanup() {
  await prisma.city.deleteMany({ where: { codigo_ibge: { in: [...TEST_CODES] } } });
}

beforeAll(async () => {
  await cleanup();

  for (const f of FIXTURES) {
    await prisma.city.create({
      data: {
        codigo_ibge: f.codigo_ibge,
        nome: f.nome,
        uf: "SP",
        categoria: f.categoria,
        latitude: f.lat,
        longitude: CENTRO_LNG,
      },
    });
  }

  // geom é Unsupported no client Prisma — backfill via SQL raw, mesmo padrão da migration.
  await prisma.$executeRaw`
    UPDATE cities
    SET geom = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
    WHERE codigo_ibge = ANY(${[...TEST_CODES]})
  `;

  // municipio_codigo_rf é um Int normal — só a "Teste Centro" tem correspondência,
  // simulando o resultado real do script de matching (nem toda cidade casa).
  await prisma.city.update({
    where: { codigo_ibge: 9990001 },
    data: { municipio_codigo_rf: 88888 },
  });
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

// ── Testes ────────────────────────────────────────────────────────────────────

describe("findWithinRadius", () => {
  it("retorna apenas municípios dentro do raio, ordenados por distância crescente", async () => {
    const result = await findWithinRadius(CENTRO_LAT, CENTRO_LNG, 40);
    const testResults = result.filter((c) => (TEST_CODES as readonly number[]).includes(c.codigo_ibge));

    expect(testResults.map((c) => c.codigo_ibge)).toEqual([9990001, 9990002, 9990003]);
    expect(testResults.every((c, i, arr) => i === 0 || arr[i - 1].distancia_km <= c.distancia_km)).toBe(true);
  });

  it("exclui municípios fora do raio", async () => {
    const result = await findWithinRadius(CENTRO_LAT, CENTRO_LNG, 40);
    expect(result.some((c) => c.codigo_ibge === 9990004)).toBe(false);
  });

  it("distância calculada é consistente com o deslocamento conhecido (~20km)", async () => {
    const result = await findWithinRadius(CENTRO_LAT, CENTRO_LNG, 40);
    const cidade20km = result.find((c) => c.codigo_ibge === 9990002);

    expect(cidade20km).toBeDefined();
    expect(cidade20km!.distancia_km).toBeGreaterThan(15);
    expect(cidade20km!.distancia_km).toBeLessThan(25);
  });

  it("raio maior inclui o município antes excluído", async () => {
    const result = await findWithinRadius(CENTRO_LAT, CENTRO_LNG, 110);
    expect(result.some((c) => c.codigo_ibge === 9990004)).toBe(true);
  });

  it("retorna uf junto com cada resultado", async () => {
    const result = await findWithinRadius(CENTRO_LAT, CENTRO_LNG, 40);
    const testResults = result.filter((c) => (TEST_CODES as readonly number[]).includes(c.codigo_ibge));
    expect(testResults.every((c) => c.uf === "SP")).toBe(true);
  });

  it("exclui categoria diferente de 'municipio' (ex: distrito)", async () => {
    await prisma.city.create({
      data: {
        codigo_ibge: 9990005,
        nome: "Teste Distrito",
        uf: "SP",
        categoria: "distrito",
        latitude: CENTRO_LAT,
        longitude: CENTRO_LNG,
      },
    });
    await prisma.$executeRaw`
      UPDATE cities
      SET geom = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
      WHERE codigo_ibge = 9990005
    `;

    try {
      const result = await findWithinRadius(CENTRO_LAT, CENTRO_LNG, 40);
      expect(result.some((c) => c.codigo_ibge === 9990005)).toBe(false);
    } finally {
      await prisma.city.deleteMany({ where: { codigo_ibge: 9990005 } });
    }
  });

  it("retorna municipio_codigo_rf quando houver correspondência, null caso contrário", async () => {
    const result = await findWithinRadius(CENTRO_LAT, CENTRO_LNG, 40);
    const centro = result.find((c) => c.codigo_ibge === 9990001);
    const sem20km = result.find((c) => c.codigo_ibge === 9990002);

    expect(centro?.municipio_codigo_rf).toBe(88888);
    expect(sem20km?.municipio_codigo_rf).toBeNull();
  });
});

describe("findByCodigoIbge", () => {
  it("retorna municipio_codigo_rf para um codigo_ibge existente", async () => {
    const result = await findByCodigoIbge(9990001);
    expect(result).toEqual({ municipio_codigo_rf: 88888 });
  });

  it("retorna municipio_codigo_rf null para cidade sem correspondência", async () => {
    const result = await findByCodigoIbge(9990002);
    expect(result).toEqual({ municipio_codigo_rf: null });
  });

  it("retorna null para codigo_ibge inexistente", async () => {
    // 999999999 tem 9 dígitos — códigos IBGE reais sempre têm 7, nunca colide.
    const result = await findByCodigoIbge(999999999);
    expect(result).toBeNull();
  });
});
