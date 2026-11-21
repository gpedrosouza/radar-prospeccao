import { describe, it, expect, vi, beforeEach } from "vitest";
import { ZodError } from "zod";

vi.mock("@/server/repositories/export-job.repository");
// Substitui o módulo inteiro: a conexão Redis nunca é estabelecida em testes.
vi.mock("@/server/queue/export-queue", () => ({
  exportQueue: { add: vi.fn().mockResolvedValue({ id: "bullmq-job-id" }) },
}));
vi.mock("@/server/lib/redis-client", () => ({
  redis: {
    incr: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
  },
}));

import * as exportJobRepo from "@/server/repositories/export-job.repository";
import { exportQueue } from "@/server/queue/export-queue";
import { redis } from "@/server/lib/redis-client";
import {
  createExportJob,
  getJob,
  getUserJobs,
  JobNotFoundError,
  JobAccessDeniedError,
  ExportConcurrentLimitError,
  ExportHourlyLimitError,
} from "./export.service";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const USER_ID = "user-123-uuid";
const OTHER_USER_ID = "other-user-uuid";
const JOB_ID = "job-456-uuid";

const MOCK_JOB = {
  id: JOB_ID,
  usuario_id: USER_ID,
  filtros: { uf: "SP" },
  status: "queued" as const,
  linhas: null,
  tamanho_bytes: null,
  storage_key: null,
  progresso_pct: 0,
  erro: null,
  criado_em: new Date("2026-06-27T12:00:00Z"),
  concluido_em: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  // Padrão: abaixo do limite em todas as verificações
  vi.mocked(exportJobRepo.countActiveByUserId).mockResolvedValue(0);
  vi.mocked(redis.incr).mockResolvedValue(1);
  vi.mocked(redis.expire).mockResolvedValue(1);
});

// ── createExportJob ───────────────────────────────────────────────────────────

describe("createExportJob", () => {
  it("cria registro no banco e enfileira no BullMQ", async () => {
    vi.mocked(exportJobRepo.create).mockResolvedValue(MOCK_JOB);

    const job = await createExportJob(USER_ID, { uf: "SP", situacao: "Ativa" });

    // 1. Persiste no banco
    expect(exportJobRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        usuario_id: USER_ID,
        filtros: expect.objectContaining({ uf: "SP", situacao: "Ativa" }),
      })
    );

    // 2. Enfileira com jobId = UUID do registro (correlação)
    expect(exportQueue.add).toHaveBeenCalledWith(
      "export-cnpj",
      expect.objectContaining({
        exportJobId: JOB_ID,
        usuarioId: USER_ID,
        filtros: expect.objectContaining({ uf: "SP" }),
      }),
      expect.objectContaining({ jobId: JOB_ID })
    );

    // 3. Retorna imediatamente o registro criado
    expect(job).toEqual(MOCK_JOB);
  });

  it("aceita filtros mínimos (só uf, sem nenhum outro filtro de negócio)", async () => {
    vi.mocked(exportJobRepo.create).mockResolvedValue(MOCK_JOB);

    await expect(createExportJob(USER_ID, { uf: "SP" })).resolves.toBeDefined();
    expect(exportQueue.add).toHaveBeenCalledOnce();
  });

  it("objeto vazio (sem escopo geográfico) lança ZodError — evitaria varrer as 27 partições", async () => {
    await expect(createExportJob(USER_ID, {})).rejects.toBeInstanceOf(ZodError);

    expect(exportJobRepo.create).not.toHaveBeenCalled();
    expect(exportQueue.add).not.toHaveBeenCalled();
  });

  it("filtros inválidos lançam ZodError sem tocar banco nem fila", async () => {
    await expect(
      createExportJob(USER_ID, { lat: -23.5, lng: -46.6 /* sem raio_km */ })
    ).rejects.toBeInstanceOf(ZodError);

    expect(exportJobRepo.create).not.toHaveBeenCalled();
    expect(exportQueue.add).not.toHaveBeenCalled();
  });

  it("falha no banco não enfileira no BullMQ", async () => {
    vi.mocked(exportJobRepo.create).mockRejectedValue(new Error("DB error"));

    await expect(createExportJob(USER_ID, { uf: "SP" })).rejects.toThrow("DB error");

    expect(exportQueue.add).not.toHaveBeenCalled();
  });

  it("lança ExportConcurrentLimitError quando usuário tem 5 jobs ativos", async () => {
    vi.mocked(exportJobRepo.countActiveByUserId).mockResolvedValue(5);

    await expect(createExportJob(USER_ID, { uf: "SP" })).rejects.toBeInstanceOf(
      ExportConcurrentLimitError
    );

    expect(exportJobRepo.create).not.toHaveBeenCalled();
    expect(exportQueue.add).not.toHaveBeenCalled();
  });

  it("lança ExportHourlyLimitError quando usuário atingiu 10 jobs na hora", async () => {
    vi.mocked(redis.incr).mockResolvedValue(11); // além do limite

    await expect(createExportJob(USER_ID, { uf: "SP" })).rejects.toBeInstanceOf(
      ExportHourlyLimitError
    );

    expect(exportJobRepo.create).not.toHaveBeenCalled();
    expect(exportQueue.add).not.toHaveBeenCalled();
  });
});

// ── getJob ────────────────────────────────────────────────────────────────────

describe("getJob", () => {
  it("retorna o job quando pertence ao usuário", async () => {
    vi.mocked(exportJobRepo.findById).mockResolvedValue(MOCK_JOB);

    const job = await getJob(JOB_ID, USER_ID);

    expect(job).toEqual(MOCK_JOB);
  });

  it("lança JobNotFoundError quando job não existe", async () => {
    vi.mocked(exportJobRepo.findById).mockResolvedValue(null);

    await expect(getJob("nao-existe", USER_ID)).rejects.toBeInstanceOf(
      JobNotFoundError
    );
  });

  it("lança JobAccessDeniedError quando job pertence a outro usuário", async () => {
    vi.mocked(exportJobRepo.findById).mockResolvedValue(MOCK_JOB);

    await expect(getJob(JOB_ID, OTHER_USER_ID)).rejects.toBeInstanceOf(
      JobAccessDeniedError
    );
  });
});

// ── getUserJobs ───────────────────────────────────────────────────────────────

describe("getUserJobs", () => {
  it("delega ao repository e retorna a lista", async () => {
    vi.mocked(exportJobRepo.findByUserId).mockResolvedValue([MOCK_JOB]);

    const jobs = await getUserJobs(USER_ID);

    expect(exportJobRepo.findByUserId).toHaveBeenCalledWith(USER_ID);
    expect(jobs).toHaveLength(1);
  });

  it("retorna array vazio quando usuário não tem jobs", async () => {
    vi.mocked(exportJobRepo.findByUserId).mockResolvedValue([]);

    expect(await getUserJobs(USER_ID)).toHaveLength(0);
  });
});
