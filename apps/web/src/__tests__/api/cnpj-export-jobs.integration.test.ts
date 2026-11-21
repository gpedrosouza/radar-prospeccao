/**
 * Testes de integração — /api/cnpj/export-jobs (GET + POST)
 *
 * Estratégia:
 *   - Banco real (PostgreSQL local via DATABASE_URL em .env.local)
 *   - auth() mockado com FACTORY para evitar carregamento do next-auth
 *     (que por sua vez importa next/server — indisponível no contexto Vitest/Node.js).
 *     Usar vi.mock("@/auth") sem factory causaria auto-mock que tenta carregar o
 *     módulo real, quebrando com "Cannot find module 'next/server'".
 *   - exportQueue mockado para evitar dependência de Redis
 *   - Requisições criadas com Request global + nextUrl patchado (NextRequest extends
 *     Request — o patch basta para os route handlers que usam request.nextUrl.searchParams)
 *   - Limpeza explícita em afterAll
 *
 * Pré-requisitos:
 *   - Docker Compose rodando (PostgreSQL)
 *   - npm run seed --workspace=packages/db (ao menos 1 usuário)
 */

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";

// ── Mocks com factory (impedem carregamento do módulo original) ───────────────

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/server/queue/export-queue", () => ({
  exportQueue: { add: vi.fn().mockResolvedValue({ id: "bullmq-fake-id" }) },
}));
// Redis mockado para isolar o rate limit horário (testamos apenas o limite de concorrência aqui)
vi.mock("@/server/lib/redis-client", () => ({
  redis: {
    incr: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
  },
}));

import { auth } from "@/auth";
import { GET, POST } from "@/app/api/cnpj/export-jobs/route";

// ── Banco de dados ─────────────────────────────────────────────────────────────

const prisma = new PrismaClient();
const createdJobIds: string[] = [];

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Cria um Request compatível com handlers Next.js App Router.
 * NextRequest extends Request e adiciona .nextUrl; patchamos esse campo
 * para que request.nextUrl.searchParams funcione nos route handlers.
 */
function makeRequest(url: string, options?: RequestInit): Request {
  const req = new Request(url, options);
  (req as Record<string, unknown>).nextUrl = new URL(url);
  return req;
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

let testUserId: string;

beforeAll(async () => {
  const user = await prisma.user.findFirst();
  if (!user) {
    throw new Error(
      "Nenhum usuário no banco. Execute: npm run seed --workspace=packages/db"
    );
  }
  testUserId = user.id;

  vi.mocked(auth).mockResolvedValue({
    user: { id: testUserId, email: user.email, name: user.nome },
    expires: new Date(Date.now() + 86_400_000).toISOString(),
  });
});

afterAll(async () => {
  if (createdJobIds.length > 0) {
    await prisma.cnpjExportJob.deleteMany({
      where: { id: { in: createdJobIds } },
    });
  }
  await prisma.$disconnect();
});

// ── POST /api/cnpj/export-jobs ────────────────────────────────────────────────

describe("POST /api/cnpj/export-jobs", () => {
  it("cria job com filtros válidos e retorna 201 com id + status", async () => {
    const req = makeRequest("http://localhost/api/cnpj/export-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uf: "SP", situacao: "Ativa" }),
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(req as any);

    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; status: string };
    expect(body.status).toBe("queued");
    expect(typeof body.id).toBe("string");

    createdJobIds.push(body.id);

    // Verifica persistência real no banco
    const dbJob = await prisma.cnpjExportJob.findUnique({ where: { id: body.id } });
    expect(dbJob).not.toBeNull();
    expect(dbJob?.usuario_id).toBe(testUserId);
    expect(dbJob?.status).toBe("queued");
  });

  it("aceita filtros mínimos (só uf)", async () => {
    const req = makeRequest("http://localhost/api/cnpj/export-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uf: "SP" }),
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(req as any);

    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string };
    createdJobIds.push(body.id);
  });

  it("retorna 400 para body vazio (sem escopo geográfico)", async () => {
    const req = makeRequest("http://localhost/api/cnpj/export-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(req as any);

    expect(res.status).toBe(400);
  });

  it("retorna 400 para filtros geo incompletos (lat sem raio_km)", async () => {
    const req = makeRequest("http://localhost/api/cnpj/export-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat: -23.5, lng: -46.6 }),
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(req as any);

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("filtros_inválidos");
  });

  it("retorna 400 para JSON mal-formado no body", async () => {
    const req = makeRequest("http://localhost/api/cnpj/export-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "isso-nao-e-json",
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(req as any);

    expect(res.status).toBe(400);
  });

  it("retorna 401 quando não há sessão ativa", async () => {
    vi.mocked(auth).mockResolvedValueOnce(null);

    const req = makeRequest("http://localhost/api/cnpj/export-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uf: "SP" }),
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(req as any);

    expect(res.status).toBe(401);
  });
});

// ── POST /api/cnpj/export-jobs — rate limiting ────────────────────────────────

describe("POST /api/cnpj/export-jobs — rate limiting", () => {
  const rateLimitJobIds: string[] = [];

  afterAll(async () => {
    if (rateLimitJobIds.length > 0) {
      await prisma.cnpjExportJob.deleteMany({
        where: { id: { in: rateLimitJobIds } },
      });
    }
  });

  it("retorna 429 ao tentar criar 6º job simultâneo além do limite de 5", async () => {
    // Cria 5 jobs com status 'queued' diretamente no banco para simular o limite
    const activeJobs = await Promise.all(
      Array.from({ length: 5 }, () =>
        prisma.cnpjExportJob.create({
          data: { usuario_id: testUserId, filtros: {}, status: "queued" },
        })
      )
    );
    rateLimitJobIds.push(...activeJobs.map((j) => j.id));

    // Tenta criar o 6º job via rota da API
    const req = makeRequest("http://localhost/api/cnpj/export-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uf: "SP" }),
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(req as any);

    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: string; detail: string };
    expect(body.error).toBe("rate_limit_excedido");
    expect(body.detail).toContain("simultâneas");
  });
});

// ── GET /api/cnpj/export-jobs ─────────────────────────────────────────────────

describe("GET /api/cnpj/export-jobs", () => {
  it("retorna 200 com lista de jobs e total", async () => {
    const res = await GET();

    expect(res.status).toBe(200);
    const body = (await res.json()) as { jobs: unknown[]; total: number };
    expect(Array.isArray(body.jobs)).toBe(true);
    expect(typeof body.total).toBe("number");
    expect(body.total).toBe(body.jobs.length);
  });

  it("retorna 401 quando não há sessão ativa", async () => {
    vi.mocked(auth).mockResolvedValueOnce(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });
});
