/**
 * Testes unitários — campaign-import.service
 *
 * Foco: o roteamento da coluna MODELO para o template correto (uma campanha por
 * modelo) e a supressão obrigatória de bounces/unsubscribes na montagem da lista.
 *
 * Estratégia: o repositório é mockado por completo (sem banco, sem rede).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/server/repositories/email-campaign.repository");

import * as repo from "@/server/repositories/email-campaign.repository";
import { DEFAULT_CAMPAIGN_SUBJECT, DEFAULT_CAMPAIGN_BODY } from "@/app/(app)/campanhas/_components/defaultTemplate";
import { MAQUININHA_CAMPAIGN_SUBJECT, MAQUININHA_CAMPAIGN_BODY } from "@/app/(app)/campanhas/_components/maquininhaTemplate";
import { CROSSSELL_CAMPAIGN_SUBJECT, CROSSSELL_CAMPAIGN_BODY } from "@/app/(app)/campanhas/_components/crossSellTemplate";
import { importCampaigns, normalizeRow, MODELOS, type ImportRow } from "./campaign-import.service";

const USER_ID = "user-1";

function row(over: Partial<ImportRow> & Pick<ImportRow, "modelo" | "email">): ImportRow {
  return {
    linha: 2,
    cnpj: "12345678000195",
    uf: "SP",
    responsavel_nome: "",
    indicante_nome: "",
    indicante_empresa: "",
    banco: "",
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(repo.findBouncedEmails).mockResolvedValue([]);
  vi.mocked(repo.findUnsubscribedEmails).mockResolvedValue([]);
  vi.mocked(repo.createRecipients).mockImplementation(async (_id, rs) => rs.length);
  vi.mocked(repo.updateCampaignStatus).mockResolvedValue(undefined as never);
  let n = 0;
  vi.mocked(repo.createCampaign).mockImplementation(
    async () => ({ id: `camp-${++n}` }) as never
  );
});

describe("normalizeRow", () => {
  it("aceita os novos modelos maquininha e crosssell", () => {
    expect(normalizeRow({ MODELO: "maquininha", CNPJ: "1", UF: "sp", EMAIL: "A@X.com" }, 2).modelo).toBe("maquininha");
    expect(normalizeRow({ MODELO: "CrossSell", CNPJ: "1", UF: "sp", EMAIL: "a@x.com" }, 3).modelo).toBe("crosssell");
  });

  it("cai no fallback padrao para modelo desconhecido", () => {
    expect(normalizeRow({ MODELO: "inexistente", CNPJ: "1", UF: "sp", EMAIL: "a@x.com" }, 2).modelo).toBe("padrao");
  });

  it("expõe os cinco modelos suportados", () => {
    expect(MODELOS).toEqual(["padrao", "indicacao", "relacionamento", "maquininha", "crosssell"]);
  });
});

describe("importCampaigns — roteamento de template", () => {
  it("cria campanha rascunho de maquininha com assunto e corpo do template B2C", async () => {
    const res = await importCampaigns(USER_ID, [row({ modelo: "maquininha", email: "loja@example.com" })], {
      nomeBase: "Araraquara",
    });

    expect(res.created).toEqual([{ modelo: "maquininha", id: "camp-1", total: 1, suprimidos: 0 }]);
    expect(repo.createCampaign).toHaveBeenCalledWith(
      expect.objectContaining({
        nome: "Araraquara · maquininha",
        assunto: MAQUININHA_CAMPAIGN_SUBJECT,
        corpo_template: MAQUININHA_CAMPAIGN_BODY,
        origem_lista: true,
        banco_relacionamento: null,
        indicado_por_nome: null,
      })
    );
    expect(repo.updateCampaignStatus).toHaveBeenCalledWith("camp-1", "rascunho", { total_destinatarios: 1 });
  });

  it("cria campanha rascunho de crosssell com o template misto", async () => {
    const res = await importCampaigns(USER_ID, [row({ modelo: "crosssell", email: "mista@example.com" })], {
      nomeBase: "Araraquara",
    });

    expect(res.created).toEqual([{ modelo: "crosssell", id: "camp-1", total: 1, suprimidos: 0 }]);
    expect(repo.createCampaign).toHaveBeenCalledWith(
      expect.objectContaining({
        nome: "Araraquara · crosssell",
        assunto: CROSSSELL_CAMPAIGN_SUBJECT,
        corpo_template: CROSSSELL_CAMPAIGN_BODY,
      })
    );
  });

  it("separa uma campanha por modelo e não contamina o template padrão", async () => {
    const res = await importCampaigns(
      USER_ID,
      [
        row({ modelo: "padrao", email: "b2b@example.com" }),
        row({ modelo: "maquininha", email: "loja@example.com", linha: 3 }),
        row({ modelo: "crosssell", email: "mista@example.com", linha: 4 }),
      ],
      { nomeBase: "Lista" }
    );

    expect(res.created.map((c) => c.modelo)).toEqual(["padrao", "maquininha", "crosssell"]);
    expect(repo.createCampaign).toHaveBeenCalledWith(
      expect.objectContaining({ assunto: DEFAULT_CAMPAIGN_SUBJECT, corpo_template: DEFAULT_CAMPAIGN_BODY })
    );
  });

  it("os novos modelos não exigem colunas extras (nada é pulado por falta de variável)", async () => {
    const res = await importCampaigns(
      USER_ID,
      [
        row({ modelo: "maquininha", email: "loja@example.com" }),
        row({ modelo: "crosssell", email: "mista@example.com", linha: 3 }),
      ],
      { nomeBase: "Lista" }
    );

    expect(res.skipped).toEqual([]);
    expect(res.totalValidas).toBe(2);
  });

  it("suprime bounces e unsubscribes também nos novos modelos", async () => {
    vi.mocked(repo.findBouncedEmails).mockResolvedValue(["Loja@Example.com"]);
    vi.mocked(repo.findUnsubscribedEmails).mockResolvedValue(["mista@example.com"]);

    const res = await importCampaigns(
      USER_ID,
      [
        row({ modelo: "maquininha", email: "loja@example.com" }),
        row({ modelo: "maquininha", email: "outra@example.com", linha: 3 }),
        row({ modelo: "crosssell", email: "mista@example.com", linha: 4 }),
      ],
      { nomeBase: "Lista" }
    );

    expect(res.created).toEqual([{ modelo: "maquininha", id: "camp-1", total: 1, suprimidos: 1 }]);
    expect(vi.mocked(repo.createRecipients).mock.calls[0]![1]).toEqual([
      expect.objectContaining({ email: "outra@example.com" }),
    ]);
  });
});
