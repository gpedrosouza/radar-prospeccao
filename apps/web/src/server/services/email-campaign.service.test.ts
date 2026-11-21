/**
 * Testes unitários — email-campaign.service
 *
 * Foco: provar que buildRecipientList exclui OBRIGATORIAMENTE qualquer e-mail
 * presente em EmailBounce ou EmailUnsubscribe, mesmo que o CNPJ do destinatário
 * bata com os filtros de busca.
 *
 * Estratégia:
 *   - Todos os repositórios são mockados (sem banco, sem rede).
 *   - radius-search.service mockado com getRadiusCities retornando [] para que
 *     filtros simples (sem geo) não tentem chamar o banco.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ZodError } from "zod";

vi.mock("@/server/repositories/cnpj.repository");
vi.mock("@/server/repositories/email-campaign.repository");
vi.mock("@/server/repositories/city.repository");
vi.mock("@/server/services/radius-search.service", () => ({
  getRadiusCities: vi.fn().mockResolvedValue([]),
}));
// buildRecipientList agora reaproveita resolveSearchContext/buildRepositoryFilters
// de cnpj-search.service (evita duplicar a mesma lógica dentro de apps/web) — que
// por sua vez importa a fila geocode-enrichment. Sem mock, a importação abriria
// uma conexão real ao Redis só por carregar o módulo.
vi.mock("@/server/queue/geocode-enrichment-queue", () => ({
  geocodeEnrichmentQueue: { add: vi.fn().mockResolvedValue(undefined) },
}));

import * as cnpjRepository from "@/server/repositories/cnpj.repository";
import * as emailCampaignRepo from "@/server/repositories/email-campaign.repository";
import {
  buildRecipientList,
  CampaignNotFoundError,
  CampaignAccessDeniedError,
  getCampaign,
} from "./email-campaign.service";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const EMPRESA_A = {
  cnpj: "12345678000195",
  uf: "SP",
  email: "empresa-a@example.com",
  razao_social: "Empresa A Ltda",
  nome_fantasia: null,
};

const EMPRESA_B = {
  cnpj: "98765432000100",
  uf: "SP",
  email: "empresa-b@example.com",
  razao_social: "Empresa B SA",
  nome_fantasia: "B Corp",
};

const EMPRESA_C = {
  cnpj: "11111111000191",
  uf: "RJ",
  email: "empresa-c@example.com",
  razao_social: "Empresa C ME",
  nome_fantasia: null,
};

const MOCK_CAMPAIGN = {
  id: "camp-uuid-1",
  nome: "Campanha Teste",
  usuario_id: "user-uuid-1",
  filtros_origem: { uf: "SP" },
  assunto: "Assunto",
  corpo_template: "Olá {{razao_social}}",
  status: "rascunho" as const,
  total_destinatarios: 0,
  total_enviados: 0,
  total_bounces: 0,
  criado_em: new Date("2026-06-27T12:00:00Z"),
  enviado_em: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  // Padrão: repositório de CNPJ retorna as 3 empresas
  vi.mocked(cnpjRepository.findByFiltersWithEmail).mockResolvedValue([
    EMPRESA_A,
    EMPRESA_B,
    EMPRESA_C,
  ]);
  // Padrão: nenhum bounce, nenhum unsubscribe
  vi.mocked(emailCampaignRepo.findBouncedEmails).mockResolvedValue([]);
  vi.mocked(emailCampaignRepo.findUnsubscribedEmails).mockResolvedValue([]);
});

// ── buildRecipientList — supressão de unsubscribes ───────────────────────────

describe("buildRecipientList — exclusão por EmailUnsubscribe", () => {
  it("exclui e-mail descadastrado mesmo que o CNPJ bata com os filtros", async () => {
    // empresa-a bateu no filtro, mas solicitou descadastro → deve ser excluída
    vi.mocked(emailCampaignRepo.findUnsubscribedEmails).mockResolvedValue([
      EMPRESA_A.email,
    ]);

    const result = await buildRecipientList({ uf: "SP" });

    expect(result).toHaveLength(2);
    expect(result.find((r) => r.email === EMPRESA_A.email)).toBeUndefined();
    expect(result.map((r) => r.email)).toEqual(
      expect.arrayContaining([EMPRESA_B.email, EMPRESA_C.email])
    );
  });

  it("exclui TODOS os descadastrados quando há múltiplos", async () => {
    vi.mocked(emailCampaignRepo.findUnsubscribedEmails).mockResolvedValue([
      EMPRESA_A.email,
      EMPRESA_C.email,
    ]);

    const result = await buildRecipientList({ uf: "SP" });

    expect(result).toHaveLength(1);
    expect(result[0].email).toBe(EMPRESA_B.email);
  });

  it("retorna lista vazia quando todos os destinatários estão descadastrados", async () => {
    vi.mocked(emailCampaignRepo.findUnsubscribedEmails).mockResolvedValue([
      EMPRESA_A.email,
      EMPRESA_B.email,
      EMPRESA_C.email,
    ]);

    const result = await buildRecipientList({ uf: "SP" });

    expect(result).toHaveLength(0);
  });
});

// ── buildRecipientList — supressão de bounces ────────────────────────────────

describe("buildRecipientList — exclusão por EmailBounce", () => {
  it("exclui e-mail com bounce mesmo que o CNPJ bata com os filtros", async () => {
    vi.mocked(emailCampaignRepo.findBouncedEmails).mockResolvedValue([
      EMPRESA_B.email,
    ]);

    const result = await buildRecipientList({ uf: "SP" });

    expect(result.find((r) => r.email === EMPRESA_B.email)).toBeUndefined();
    expect(result).toHaveLength(2);
  });

  it("exclui e-mail presente em ambos bounce E unsubscribe (sem duplicar remoção)", async () => {
    vi.mocked(emailCampaignRepo.findBouncedEmails).mockResolvedValue([
      EMPRESA_A.email,
    ]);
    vi.mocked(emailCampaignRepo.findUnsubscribedEmails).mockResolvedValue([
      EMPRESA_A.email,
    ]);

    const result = await buildRecipientList({ uf: "SP" });

    expect(result.find((r) => r.email === EMPRESA_A.email)).toBeUndefined();
    expect(result).toHaveLength(2);
  });

  it("exclui e-mails de diferentes fontes (bounce + unsubscribe) simultaneamente", async () => {
    vi.mocked(emailCampaignRepo.findBouncedEmails).mockResolvedValue([
      EMPRESA_A.email,
    ]);
    vi.mocked(emailCampaignRepo.findUnsubscribedEmails).mockResolvedValue([
      EMPRESA_B.email,
    ]);

    const result = await buildRecipientList({ uf: "SP" });

    expect(result).toHaveLength(1);
    expect(result[0].email).toBe(EMPRESA_C.email);
  });
});

// ── buildRecipientList — happy path ──────────────────────────────────────────

describe("buildRecipientList — fluxo normal", () => {
  it("retorna todos os destinatários quando não há suppression list", async () => {
    const result = await buildRecipientList({ uf: "SP" });

    expect(result).toHaveLength(3);
    expect(cnpjRepository.findByFiltersWithEmail).toHaveBeenCalledOnce();
    expect(emailCampaignRepo.findBouncedEmails).toHaveBeenCalledOnce();
    expect(emailCampaignRepo.findUnsubscribedEmails).toHaveBeenCalledOnce();
  });

  it("consulta bounce E unsubscribe em paralelo (ambos sempre chamados)", async () => {
    await buildRecipientList({ uf: "SP" });

    expect(emailCampaignRepo.findBouncedEmails).toHaveBeenCalledOnce();
    expect(emailCampaignRepo.findUnsubscribedEmails).toHaveBeenCalledOnce();
  });

  it("preserva os campos do destinatário (cnpj, uf, email, razao_social)", async () => {
    vi.mocked(cnpjRepository.findByFiltersWithEmail).mockResolvedValue([
      EMPRESA_A,
    ]);

    const result = await buildRecipientList({ uf: "SP" });

    expect(result[0]).toMatchObject({
      cnpj: EMPRESA_A.cnpj,
      uf: EMPRESA_A.uf,
      email: EMPRESA_A.email,
      razao_social: EMPRESA_A.razao_social,
    });
  });

  it("retorna lista vazia quando nenhuma empresa tem e-mail preenchido", async () => {
    vi.mocked(cnpjRepository.findByFiltersWithEmail).mockResolvedValue([]);

    const result = await buildRecipientList({ uf: "SP" });

    expect(result).toHaveLength(0);
  });

  it("lança ZodError para filtros inválidos (geo incompleto)", async () => {
    await expect(
      buildRecipientList({ lat: -23.5, lng: -46.6 /* sem raio_km */ })
    ).rejects.toBeInstanceOf(ZodError);

    expect(cnpjRepository.findByFiltersWithEmail).not.toHaveBeenCalled();
  });
});

// ── getCampaign ───────────────────────────────────────────────────────────────

describe("getCampaign", () => {
  it("retorna campanha quando pertence ao usuário", async () => {
    vi.mocked(emailCampaignRepo.findCampaignById).mockResolvedValue(
      MOCK_CAMPAIGN
    );

    const result = await getCampaign("camp-uuid-1", "user-uuid-1");

    expect(result).toEqual(MOCK_CAMPAIGN);
  });

  it("lança CampaignNotFoundError quando campanha não existe", async () => {
    vi.mocked(emailCampaignRepo.findCampaignById).mockResolvedValue(null);

    await expect(getCampaign("nao-existe", "user-uuid-1")).rejects.toBeInstanceOf(
      CampaignNotFoundError
    );
  });

  it("lança CampaignAccessDeniedError quando campanha pertence a outro usuário", async () => {
    vi.mocked(emailCampaignRepo.findCampaignById).mockResolvedValue(
      MOCK_CAMPAIGN
    );

    await expect(
      getCampaign("camp-uuid-1", "outro-user-uuid")
    ).rejects.toBeInstanceOf(CampaignAccessDeniedError);
  });
});
