import { describe, it, expect } from "vitest";
import { classificarCategoriaPorCnae, temAtividadeMista } from "./categoria-cnae";

describe("classificarCategoriaPorCnae", () => {
  describe("fronteira atacado × varejo (o caso que a feature existe para resolver)", () => {
    it("classifica a divisão 46 (atacado) como B2B", () => {
      expect(classificarCategoriaPorCnae("4635402")).toBe("B2B"); // atacado de bebidas
      expect(classificarCategoriaPorCnae("4611700")).toBe("B2B"); // representante comercial
    });

    it("classifica a divisão 47 (varejo) como B2C", () => {
      expect(classificarCategoriaPorCnae("4711302")).toBe("B2C"); // supermercado
      expect(classificarCategoriaPorCnae("4781400")).toBe("B2C"); // vestuário
    });

    it("classifica indústria de transformação como B2B", () => {
      expect(classificarCategoriaPorCnae("1091102")).toBe("B2B"); // padaria industrial
      expect(classificarCategoriaPorCnae("3299099")).toBe("B2B");
    });
  });

  describe("precedência subclasse → classe → divisão", () => {
    it("usa a subclasse para separar atacado de varejo dentro da divisão 45", () => {
      // A divisão 45 inteira é B2C (balcão), mas estas subclasses são atacado.
      expect(classificarCategoriaPorCnae("4530703")).toBe("B2C"); // varejo de peças
      expect(classificarCategoriaPorCnae("4530701")).toBe("B2B"); // atacado de peças
      expect(classificarCategoriaPorCnae("4511101")).toBe("B2C"); // varejo de automóveis
      expect(classificarCategoriaPorCnae("4511104")).toBe("B2B"); // atacado de caminhões
    });

    it("usa a classe para separar transporte de passageiros do de carga", () => {
      expect(classificarCategoriaPorCnae("4930202")).toBe("B2B"); // carga rodoviária
      expect(classificarCategoriaPorCnae("4921301")).toBe("B2C"); // ônibus municipal
      expect(classificarCategoriaPorCnae("4923002")).toBe("B2C"); // táxi
      expect(classificarCategoriaPorCnae("5111100")).toBe("B2C"); // aéreo de passageiros
    });
  });

  describe("Instituição", () => {
    it("classifica administração pública e organizações associativas", () => {
      expect(classificarCategoriaPorCnae("8411600")).toBe("Instituição"); // adm pública
      expect(classificarCategoriaPorCnae("9412001")).toBe("Instituição"); // sindicato
      expect(classificarCategoriaPorCnae("9900800")).toBe("Instituição"); // organismo internacional
      expect(classificarCategoriaPorCnae("9700500")).toBe("Instituição"); // serviços domésticos
    });
  });

  describe("Revisar", () => {
    it("devolve Revisar para as divisões deliberadamente ambíguas", () => {
      expect(classificarCategoriaPorCnae("3511501")).toBe("Revisar"); // energia elétrica
      expect(classificarCategoriaPorCnae("3600601")).toBe("Revisar"); // captação de água
      expect(classificarCategoriaPorCnae("6010100")).toBe("Revisar"); // rádio
      expect(classificarCategoriaPorCnae("6422100")).toBe("Revisar"); // banco múltiplo
      expect(classificarCategoriaPorCnae("6512000")).toBe("Revisar"); // seguros
    });

    it("devolve Revisar para ausência de CNAE e código desconhecido", () => {
      expect(classificarCategoriaPorCnae(null)).toBe("Revisar");
      expect(classificarCategoriaPorCnae("")).toBe("Revisar");
      expect(classificarCategoriaPorCnae("0000000")).toBe("Revisar");
      expect(classificarCategoriaPorCnae("9999999")).toBe("Revisar");
      expect(classificarCategoriaPorCnae("0400000")).toBe("Revisar"); // divisão 04 não existe
    });
  });

  describe("normalização do código", () => {
    it("aceita máscara da Receita", () => {
      expect(classificarCategoriaPorCnae("46.35-4/02")).toBe("B2B");
      expect(classificarCategoriaPorCnae(" 4711302 ")).toBe("B2C");
    });

    it("repõe zeros à esquerda perdidos em trânsito por número", () => {
      // Sem o padStart, "810099" leria a divisão como "81" (serviços a
      // edifícios) em vez de "08" (extração de minerais não metálicos).
      expect(classificarCategoriaPorCnae("810099")).toBe("B2B");
      expect(classificarCategoriaPorCnae("0810099")).toBe("B2B");
    });
  });
});

describe("temAtividadeMista", () => {
  it("marca atacadista com secundário de varejo", () => {
    expect(temAtividadeMista("4635402", ["4712100"])).toBe(true);
  });

  it("marca indústria com secundário de varejo (fábrica com loja)", () => {
    expect(temAtividadeMista("1091102", ["4721102"])).toBe(true);
  });

  it("não marca quando todos os secundários ficam do mesmo lado", () => {
    expect(temAtividadeMista("4635402", ["4611700", "4649408"])).toBe(false);
    expect(temAtividadeMista("4711302", [])).toBe(false);
  });

  it("ignora secundários Revisar e Instituição", () => {
    expect(temAtividadeMista("4635402", ["6422100", "9412001"])).toBe(false);
  });

  it("não marca quando o próprio principal é Revisar ou Instituição", () => {
    // Sem esta regra, metade dos CNPJs de mídia e financeiro apareceria como
    // mista sem que ninguém tenha afirmado nada sobre eles.
    expect(temAtividadeMista("6422100", ["4711302"])).toBe(false);
    expect(temAtividadeMista(null, ["4711302"])).toBe(false);
  });
});
