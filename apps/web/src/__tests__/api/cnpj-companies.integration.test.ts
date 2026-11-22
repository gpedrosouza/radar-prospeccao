/**
 * Testes de integração — GET /api/cnpj/companies
 *
 * Estratégia:
 *   - Banco real (PostgreSQL local via DATABASE_URL em .env.local)
 *   - auth() mockado com factory (evita carregamento de next-auth/next/server)
 *   - city.repository mockado para isolar testes dos dados de cidades
 *   - geocode-enrichment-queue mockado — a rota enfileira sob demanda para
 *     CNPJs sem coordenada; sem mock, o módulo tentaria conectar ao Redis
 *     real na importação (efeito colateral fora do escopo deste teste)
 *   - company_cnpj pode estar vazia (sem import de Receita Federal) — os testes
 *     verificam o shape da resposta independente do volume de dados
 *
 * Pré-requisitos:
 *   - Docker Compose rodando (PostgreSQL)
 *   - npm run seed --workspace=packages/db (ao menos 1 usuário)
 */

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";

// ── Mocks com factory ─────────────────────────────────────────────────────────

vi.mock("@/auth", () => ({ auth: vi.fn() }));
// city.repository usa PostGIS — mockamos para não depender de dados de cidades
vi.mock("@/server/repositories/city.repository");
// evita conexão real ao Redis só por importar a rota
vi.mock("@/server/queue/geocode-enrichment-queue", () => ({
  geocodeEnrichmentQueue: { add: vi.fn().mockResolvedValue(undefined) },
}));

import { auth } from "@/auth";
import * as cityRepo from "@/server/repositories/city.repository";
import { GET } from "@/app/api/cnpj/companies/route";

// ── Banco de dados ─────────────────────────────────────────────────────────────

const prisma = new PrismaClient();

// As tabelas de domínio da Receita (natureza jurídica, estrutura CNAE) são
// criadas pelo importador, não pelas migrations: sem o import (ex.: na CI),
// os testes que dependem delas são pulados em vez de falhar.
const [{ ok: hasReceitaLookups }] = await prisma.$queryRaw<Array<{ ok: boolean }>>`
  SELECT to_regclass('public.lookup_natureza_juridica') IS NOT NULL
     AND to_regclass('public.lookup_cnae_estrutura') IS NOT NULL AS ok`;

function makeRequest(url: string): Request {
  const req = new Request(url);
  (req as Record<string, unknown>).nextUrl = new URL(url);
  return req;
}

beforeAll(async () => {
  const user = await prisma.user.findFirst();
  if (!user) {
    throw new Error(
      "Nenhum usuário no banco. Execute: npm run seed --workspace=packages/db"
    );
  }

  vi.mocked(auth).mockResolvedValue({
    user: { id: user.id, email: user.email, name: user.nome },
    expires: new Date(Date.now() + 86_400_000).toISOString(),
  });

  // Raio sem cidades: cnpj-search usa municipio_codigo de fallback ou busca sem filtro
  vi.mocked(cityRepo.findWithinRadius).mockResolvedValue([]);
});

afterAll(async () => {
  await prisma.$disconnect();
});

// ── Shape da resposta ─────────────────────────────────────────────────────────

describe("GET /api/cnpj/companies — shape", () => {
  it("200 com items[], nextCursor, count e countExact", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(makeRequest("http://localhost/api/cnpj/companies?uf=SP&limit=10") as any);

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: unknown[];
      nextCursor: string | null;
      count: number;
      countExact: boolean;
    };

    expect(Array.isArray(body.items)).toBe(true);
    expect(body.nextCursor === null || typeof body.nextCursor === "string").toBe(true);
    expect(typeof body.count).toBe("number");
    expect(typeof body.countExact).toBe("boolean");
  });

  it("ids em items são strings (BigInt serializado)", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(makeRequest("http://localhost/api/cnpj/companies?uf=SP&limit=5") as any);
    const body = (await res.json()) as { items: Array<{ id: unknown }> };

    for (const item of body.items) {
      expect(typeof item.id).toBe("string");
    }
  });

  it("items trazem os campos de classificação e faturamento", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(makeRequest("http://localhost/api/cnpj/companies?uf=SP&limit=5") as any);
    const body = (await res.json()) as {
      items: Array<Record<string, unknown>>;
    };

    for (const item of body.items) {
      for (const campo of [
        "natureza_juridica",
        "capital_social",
        "data_abertura",
        "matriz_filial",
        "porte",
        "opcao_simples",
        "opcao_mei",
      ]) {
        expect(item).toHaveProperty(campo);
      }
      // Decimal precisa chegar como string — number perderia precisão
      expect(
        item.capital_social === null || typeof item.capital_social === "string"
      ).toBe(true);
    }
  });

  it.skipIf(!hasReceitaLookups)("aceita filtro por natureza jurídica (código da Receita)", async () => {
    const res = await GET(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      makeRequest("http://localhost/api/cnpj/companies?uf=SP&naturezas_juridicas=2135&limit=5") as any
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ natureza_juridica: string | null }> };
    for (const item of body.items) {
      expect(item.natureza_juridica).toBe("Empresário (Individual)");
    }
  });

  it("400 para código de natureza jurídica fora do formato da Receita", async () => {
    const res = await GET(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      makeRequest("http://localhost/api/cnpj/companies?uf=SP&natureza_juridica=abc") as any
    );
    expect(res.status).toBe(400);
  });

  it("items trazem o CNAE traduzido e o setor", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(makeRequest("http://localhost/api/cnpj/companies?uf=SP&limit=5") as any);
    const body = (await res.json()) as {
      items: Array<{
        cnae_principal: string;
        cnae_descricao: string | null;
        cnae_secao: string | null;
        cnae_divisao: string | null;
      }>;
    };

    for (const item of body.items) {
      expect(item).toHaveProperty("cnae_descricao");
      expect(item).toHaveProperty("cnae_secao");
      // 8888888 = "Atividade Econômica não informada", sentinela sem estrutura
      if (item.cnae_principal !== "8888888") {
        expect(item.cnae_descricao).toBeTruthy();
        expect(item.cnae_secao).toBeTruthy();
      }
    }
  });

  it.skipIf(!hasReceitaLookups)("filtra por setor (seção CNAE) traduzindo em divisões", async () => {
    const res = await GET(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      makeRequest("http://localhost/api/cnpj/companies?uf=SP&cnae_secoes=G&limit=20") as any
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: Array<{ cnae_principal: string; cnae_secao: string | null }>;
    };
    // Seção G = divisões 45, 46 e 47 (comércio)
    for (const item of body.items) {
      expect(["45", "46", "47"]).toContain(item.cnae_principal.slice(0, 2));
    }
  });

  it("400 para seção CNAE fora do intervalo A–U", async () => {
    const res = await GET(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      makeRequest("http://localhost/api/cnpj/companies?uf=SP&cnae_secoes=Z") as any
    );
    expect(res.status).toBe(400);
  });

  it("400 sem nenhum filtro de escopo geográfico (evita varrer as 27 partições)", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(makeRequest("http://localhost/api/cnpj/companies") as any);
    expect(res.status).toBe(400);
  });

  it("200 só com uf, sem nenhum outro filtro (usa defaults)", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(makeRequest("http://localhost/api/cnpj/companies?uf=SP") as any);
    expect(res.status).toBe(200);
  });

  it("countExact=true para tabela vazia ou pequena (< 10.000 registros)", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(makeRequest("http://localhost/api/cnpj/companies?uf=SP&limit=10") as any);
    const body = (await res.json()) as { count: number; countExact: boolean };

    // Sem dados importados, count=0 e exact=true
    expect(body.count).toBeGreaterThanOrEqual(0);
    // count <= COUNT_CAP → deve ser exato
    if (body.count < 10_000) {
      expect(body.countExact).toBe(true);
    }
  });
});

// ── Validação de parâmetros ───────────────────────────────────────────────────

describe("GET /api/cnpj/companies — validação", () => {
  it("400 para lat fora do intervalo", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(makeRequest("http://localhost/api/cnpj/companies?lat=999&lng=-46.6&raio_km=10") as any);
    expect(res.status).toBe(400);
  });

  it("400 para lat/lng sem raio_km (trio incompleto)", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(makeRequest("http://localhost/api/cnpj/companies?lat=-23.5&lng=-46.6") as any);
    expect(res.status).toBe(400);
  });

  it("400 para limit acima do máximo (2.000)", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(makeRequest("http://localhost/api/cnpj/companies?limit=9999") as any);
    expect(res.status).toBe(400);
  });

  it("400 para matriz_filial com valor inválido", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(makeRequest("http://localhost/api/cnpj/companies?matriz_filial=OUTRO") as any);
    expect(res.status).toBe(400);
  });

  it("400 para data_abertura_de com formato inválido", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(makeRequest("http://localhost/api/cnpj/companies?data_abertura_de=31/12/2023") as any);
    expect(res.status).toBe(400);
  });

  it("400 para cursor não-numérico", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(makeRequest("http://localhost/api/cnpj/companies?cursor=abc") as any);
    expect(res.status).toBe(400);
  });
});

// ── Auth ──────────────────────────────────────────────────────────────────────

describe("GET /api/cnpj/companies — auth", () => {
  it("401 sem sessão ativa", async () => {
    vi.mocked(auth).mockResolvedValueOnce(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(makeRequest("http://localhost/api/cnpj/companies") as any);
    expect(res.status).toBe(401);
  });
});

// ── Paginação ─────────────────────────────────────────────────────────────────

describe("GET /api/cnpj/companies — paginação", () => {
  it("cursor válido não gera erro (results podem ser vazios)", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(makeRequest("http://localhost/api/cnpj/companies?uf=SP&cursor=1&limit=10") as any);
    expect(res.status).toBe(200);
  });

  it("nextCursor presente na resposta e é null ou string", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(makeRequest("http://localhost/api/cnpj/companies?uf=SP&limit=5") as any);
    const body = (await res.json()) as { nextCursor: unknown };
    expect(body.nextCursor === null || typeof body.nextCursor === "string").toBe(true);
  });
});
