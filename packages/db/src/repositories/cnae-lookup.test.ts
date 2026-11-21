import { describe, it, expect, beforeEach, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  classeFromCnae,
  getCnaeDescricaoMap,
  getCnaeEstruturaMap,
  getCnaeSecoes,
  divisoesDasSecoes,
  resolveCnaePrefixos,
  resetCnaeLookupCache,
} from "./cnae-lookup";

// ── classeFromCnae ────────────────────────────────────────────────────────────

describe("classeFromCnae", () => {
  it("corta os 5 primeiros dígitos da subclasse", () => {
    expect(classeFromCnae("4755503")).toBe("47555");
    expect(classeFromCnae("0113000")).toBe("01130");
  });

  it("preserva o zero à esquerda", () => {
    expect(classeFromCnae("0810099")).toBe("08100");
  });

  it("repadroniza um código que perdeu o zero à esquerda", () => {
    // "810099" viria de um trânsito por number/JSON. Sem o pad viraria "81009",
    // que é outra classe (divisão 81, não 08).
    expect(classeFromCnae("810099")).toBe("08100");
  });

  it("ignora formatação", () => {
    expect(classeFromCnae("4755-5/03")).toBe("47555");
    expect(classeFromCnae(" 4755503 ")).toBe("47555");
  });
});

// ── Loaders com Prisma mockado ────────────────────────────────────────────────

const LINHAS_ESTRUTURA = [
  { classe: "47555", classe_desc: "Cama, mesa e banho", grupo: "475", grupo_desc: "Varejo especializado",
    divisao: "47", divisao_desc: "COMÉRCIO VAREJISTA", secao: "G", secao_desc: "COMÉRCIO" },
  { classe: "45110", classe_desc: "Veículos automotores", grupo: "451", grupo_desc: "Comércio de veículos",
    divisao: "45", divisao_desc: "COMÉRCIO DE VEÍCULOS", secao: "G", secao_desc: "COMÉRCIO" },
  { classe: "01130", classe_desc: "Cultivo de cereais", grupo: "011", grupo_desc: "Lavouras temporárias",
    divisao: "01", divisao_desc: "AGRICULTURA", secao: "A", secao_desc: "AGROPECUÁRIA" },
];

const LINHAS_CNAE = [
  { codigo: "4755503", descricao: "Comércio varejista de artigos de cama, mesa e banho" },
];

function fakePrisma() {
  const queryRaw = vi.fn(async (strings: TemplateStringsArray) => {
    const sql = strings.join(" ");
    if (sql.includes("lookup_cnae_estrutura")) return LINHAS_ESTRUTURA;
    if (sql.includes("lookup_cnae")) return LINHAS_CNAE;
    throw new Error(`query inesperada: ${sql}`);
  });
  return { $queryRaw: queryRaw } as unknown as PrismaClient & {
    $queryRaw: ReturnType<typeof vi.fn>;
  };
}

describe("loaders de dicionário", () => {
  beforeEach(() => resetCnaeLookupCache());

  it("monta o Map de descrição por código", async () => {
    const prisma = fakePrisma();
    const map = await getCnaeDescricaoMap(prisma);

    expect(map.get("4755503")).toBe(
      "Comércio varejista de artigos de cama, mesa e banho"
    );
  });

  it("monta o Map de estrutura por classe", async () => {
    const prisma = fakePrisma();
    const map = await getCnaeEstruturaMap(prisma);

    expect(map.get("47555")).toMatchObject({ secao: "G", divisao: "47" });
  });

  it("lê o banco uma vez só — as chamadas seguintes vêm do cache", async () => {
    const prisma = fakePrisma();

    await getCnaeEstruturaMap(prisma);
    await getCnaeEstruturaMap(prisma);
    await getCnaeSecoes(prisma);

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("resetCnaeLookupCache força nova leitura", async () => {
    const prisma = fakePrisma();

    await getCnaeEstruturaMap(prisma);
    resetCnaeLookupCache();
    await getCnaeEstruturaMap(prisma);

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
  });
});

// ── Seções e tradução para prefixos ───────────────────────────────────────────

describe("getCnaeSecoes", () => {
  beforeEach(() => resetCnaeLookupCache());

  it("agrupa as divisões por seção, ordenadas", async () => {
    const secoes = await getCnaeSecoes(fakePrisma());

    expect(secoes).toEqual([
      { secao: "A", secao_desc: "AGROPECUÁRIA", divisoes: ["01"] },
      { secao: "G", secao_desc: "COMÉRCIO", divisoes: ["45", "47"] },
    ]);
  });
});

describe("divisoesDasSecoes", () => {
  beforeEach(() => resetCnaeLookupCache());

  it("traduz seção em divisões de 2 dígitos", async () => {
    expect(await divisoesDasSecoes(fakePrisma(), ["G"])).toEqual(["45", "47"]);
  });

  it("aceita letra minúscula", async () => {
    expect(await divisoesDasSecoes(fakePrisma(), ["g"])).toEqual(["45", "47"]);
  });

  it("devolve vazio para seção sem classes conhecidas", async () => {
    expect(await divisoesDasSecoes(fakePrisma(), ["Z"])).toEqual([]);
  });
});

describe("resolveCnaePrefixos", () => {
  beforeEach(() => resetCnaeLookupCache());

  it("converte seções em divisões quando não há prefixo digitado", async () => {
    expect(await resolveCnaePrefixos(fakePrisma(), { cnae_secoes: ["G"] })).toEqual([
      "45",
      "47",
    ]);
  });

  it("prefixo digitado tem precedência sobre o setor", async () => {
    expect(
      await resolveCnaePrefixos(fakePrisma(), {
        cnae_prefixos: ["6201"],
        cnae_secoes: ["G"],
      })
    ).toEqual(["6201"]);
  });

  it("cnae_prefixo singular também vence o setor, sem virar lista", async () => {
    // O repository aplica cnae_prefixo por conta própria; devolver undefined
    // aqui evita que o setor sobrescreva o prefixo singular.
    expect(
      await resolveCnaePrefixos(fakePrisma(), {
        cnae_prefixo: "6201",
        cnae_secoes: ["G"],
      })
    ).toBeUndefined();
  });

  it("devolve undefined quando não há nem prefixo nem setor", async () => {
    expect(await resolveCnaePrefixos(fakePrisma(), {})).toBeUndefined();
  });

  it("devolve undefined quando a seção não resolve nenhuma divisão", async () => {
    expect(
      await resolveCnaePrefixos(fakePrisma(), { cnae_secoes: ["Z"] })
    ).toBeUndefined();
  });
});
