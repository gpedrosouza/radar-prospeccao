import { describe, it, expect, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  basicoFromCnpj,
  getSocioAggFor,
  getGrupoEconomicoFor,
  getQsaEnrichmentFor,
  getSociosDoCnpj,
} from "./socio-lookup";

// ── basicoFromCnpj ────────────────────────────────────────────────────────────

describe("basicoFromCnpj", () => {
  it("corta os 8 primeiros dígitos do CNPJ", () => {
    expect(basicoFromCnpj("49878038000150")).toBe("49878038");
    expect(basicoFromCnpj("62778745000133")).toBe("62778745");
  });

  it("preserva o zero à esquerda", () => {
    expect(basicoFromCnpj("00000001000191")).toBe("00000001");
  });

  it("repadroniza um CNPJ que perdeu zeros à esquerda em trânsito por number", () => {
    // 191 = 00000000000191 depois do padStart
    expect(basicoFromCnpj("191")).toBe("00000000");
  });

  it("aceita CNPJ mascarado", () => {
    expect(basicoFromCnpj("49.878.038/0001-50")).toBe("49878038");
  });

  it("matriz e filial do mesmo grupo compartilham o básico", () => {
    expect(basicoFromCnpj("49878038000150")).toBe(basicoFromCnpj("49878038000231"));
  });
});

// ── Leitura por lote ──────────────────────────────────────────────────────────

/** Prisma mínimo: só $queryRaw, que é tudo que socio-lookup usa. */
function fakePrisma(rows: unknown[]): {
  prisma: PrismaClient;
  queryRaw: ReturnType<typeof vi.fn>;
} {
  const queryRaw = vi.fn().mockResolvedValue(rows);
  return { prisma: { $queryRaw: queryRaw } as unknown as PrismaClient, queryRaw };
}

describe("getSocioAggFor", () => {
  it("não vai ao banco com lista vazia", async () => {
    const { prisma, queryRaw } = fakePrisma([]);
    await expect(getSocioAggFor(prisma, [])).resolves.toEqual(new Map());
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("indexa por cnpj_basico e tira o padding do CHAR(8)", async () => {
    const { prisma } = fakePrisma([
      {
        cnpj_basico: "49878038",
        qtd_socios: 2,
        socio_administrador: "JOAO SILVA",
        qualificacao_admin: "Sócio-Administrador",
        tem_socio_estrangeiro: false,
        tem_socio_pj: false,
        data_entrada_admin: null,
      },
    ]);

    const map = await getSocioAggFor(prisma, ["49878038"]);

    expect(map.get("49878038")?.socio_administrador).toBe("JOAO SILVA");
    expect(map.get("49878038")?.qtd_socios).toBe(2);
  });

  it("deduplica os básicos antes de consultar (filiais repetem o mesmo)", async () => {
    const { prisma, queryRaw } = fakePrisma([]);

    await getSocioAggFor(prisma, ["49878038", "49878038", "49878038"]);

    // uma query só, e não três
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });
});

describe("getGrupoEconomicoFor", () => {
  it("converte grupo_tamanho para number", async () => {
    const { prisma } = fakePrisma([
      { cnpj_basico: "49878038", grupo_id: "10000001", grupo_tamanho: 4 },
    ]);

    const map = await getGrupoEconomicoFor(prisma, ["49878038"]);

    expect(map.get("49878038")).toEqual({
      cnpj_basico: "49878038",
      grupo_id: "10000001",
      grupo_tamanho: 4,
    });
  });
});

describe("getQsaEnrichmentFor", () => {
  it("une QSA e grupo pelo básico, aceitando CNPJ de 14 dígitos na entrada", async () => {
    const queryRaw = vi
      .fn()
      // getSocioAggFor
      .mockResolvedValueOnce([
        {
          cnpj_basico: "49878038",
          qtd_socios: 3,
          socio_administrador: "MARIA SOUZA",
          qualificacao_admin: "Administrador",
          tem_socio_estrangeiro: true,
          tem_socio_pj: false,
          data_entrada_admin: null,
        },
      ])
      // getGrupoEconomicoFor
      .mockResolvedValueOnce([
        { cnpj_basico: "49878038", grupo_id: "49878038", grupo_tamanho: 5 },
      ]);
    const prisma = { $queryRaw: queryRaw } as unknown as PrismaClient;

    const map = await getQsaEnrichmentFor(prisma, ["49878038000150"]);

    expect(map.get("49878038")).toEqual({
      qtd_socios: 3,
      socio_administrador: "MARIA SOUZA",
      qualificacao_admin: "Administrador",
      tem_socio_estrangeiro: true,
      tem_socio_pj: false,
      grupo_tamanho: 5,
    });
  });

  it("grupo_tamanho fica null quando o CNPJ não pertence a grupo", async () => {
    const queryRaw = vi
      .fn()
      .mockResolvedValueOnce([
        {
          cnpj_basico: "49878038",
          qtd_socios: 1,
          socio_administrador: "JOAO SILVA",
          qualificacao_admin: "Sócio-Administrador",
          tem_socio_estrangeiro: false,
          tem_socio_pj: false,
          data_entrada_admin: null,
        },
      ])
      .mockResolvedValueOnce([]);
    const prisma = { $queryRaw: queryRaw } as unknown as PrismaClient;

    const map = await getQsaEnrichmentFor(prisma, ["49878038000150"]);

    expect(map.get("49878038")?.grupo_tamanho).toBeNull();
  });

  it("CNPJ sem QSA nenhum não entra no Map (empresário individual)", async () => {
    const queryRaw = vi.fn().mockResolvedValue([]);
    const prisma = { $queryRaw: queryRaw } as unknown as PrismaClient;

    const map = await getQsaEnrichmentFor(prisma, ["49878038000150"]);

    expect(map.has("49878038")).toBe(false);
  });

  it("resolve QSA e grupo em duas queries por página, não por linha", async () => {
    const queryRaw = vi.fn().mockResolvedValue([]);
    const prisma = { $queryRaw: queryRaw } as unknown as PrismaClient;

    const cnpjs = Array.from({ length: 200 }, (_, i) =>
      String(10000000 + i).padStart(8, "0") + "000150"
    );
    await getQsaEnrichmentFor(prisma, cnpjs);

    expect(queryRaw).toHaveBeenCalledTimes(2);
  });
});

describe("getSociosDoCnpj", () => {
  it("traduz identificador_socio em rótulo legível", async () => {
    const { prisma } = fakePrisma([
      { nome: "JOAO SILVA", qualificacao: "Sócio-Administrador", identificador: "2", data_entrada: null },
      { nome: "HOLDING X LTDA", qualificacao: "Sócio", identificador: "1", data_entrada: null },
      { nome: "HANS MULLER", qualificacao: "Sócio", identificador: "3", data_entrada: null },
      { nome: "SEM TIPO", qualificacao: null, identificador: null, data_entrada: null },
    ]);

    const socios = await getSociosDoCnpj(prisma, "49878038000150");

    expect(socios.map((s) => s.tipo)).toEqual([
      "PF",
      "PJ",
      "Estrangeiro",
      "Não informado",
    ]);
  });

  it("não seleciona CPF em lugar nenhum (LGPD)", async () => {
    const { prisma, queryRaw } = fakePrisma([]);

    await getSociosDoCnpj(prisma, "49878038000150");

    // o template literal do Prisma chega como array de fragmentos SQL
    const sql = (queryRaw.mock.calls[0][0] as string[]).join(" ");
    expect(sql).not.toContain("cpf_cnpj_socio");
    expect(sql).not.toContain("representante_legal");
  });
});
