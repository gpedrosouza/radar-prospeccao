import { describe, it, expect } from "vitest";
import { classificarTipoPessoa } from "./classificacao";

describe("classificarTipoPessoa", () => {
  it("retorna MEI quando a flag está ligada, independente da natureza", () => {
    expect(classificarTipoPessoa("2135", true)).toBe("MEI");
    expect(classificarTipoPessoa("Sociedade Empresária Limitada", true)).toBe("MEI");
    expect(classificarTipoPessoa(null, true)).toBe("MEI");
  });

  it("retorna Indefinido para natureza nula, vazia ou não informada", () => {
    expect(classificarTipoPessoa(null, false)).toBe("Indefinido");
    expect(classificarTipoPessoa("", false)).toBe("Indefinido");
    expect(classificarTipoPessoa("   ", false)).toBe("Indefinido");
    expect(classificarTipoPessoa("Natureza Jurídica não informada", false)).toBe("Indefinido");
  });

  describe("por código", () => {
    it("classifica 2135 como empresário individual, com e sem hífen", () => {
      expect(classificarTipoPessoa("2135", false)).toBe("Empresário Individual");
      expect(classificarTipoPessoa("213-5", false)).toBe("Empresário Individual");
      expect(classificarTipoPessoa(" 2135 ", false)).toBe("Empresário Individual");
    });

    it("classifica as naturezas de titular único como empresa unipessoal", () => {
      for (const codigo of ["2305", "2313", "2321"]) {
        expect(classificarTipoPessoa(codigo, false)).toBe("Empresa (unipessoal)");
      }
      expect(classificarTipoPessoa("230-5", false)).toBe("Empresa (unipessoal)");
    });

    it("classifica o restante do grupo 2 como sociedade", () => {
      expect(classificarTipoPessoa("2062", false)).toBe("Empresa (sociedade)");
      expect(classificarTipoPessoa("2054", false)).toBe("Empresa (sociedade)");
    });

    it("separa os demais grupos CONCLA de entidades empresariais", () => {
      expect(classificarTipoPessoa("1015", false)).toBe("Administração Pública");
      expect(classificarTipoPessoa("3999", false)).toBe("Entidade sem fins lucrativos");
      expect(classificarTipoPessoa("4120", false)).toBe("Pessoa Física");
      expect(classificarTipoPessoa("5010", false)).toBe("Organização Internacional");
    });

    it("4014 é pessoa física apesar do nome 'Empresa Individual Imobiliária'", () => {
      expect(classificarTipoPessoa("4014", false)).toBe("Pessoa Física");
    });

    it("trata código fora dos grupos conhecidos como indefinido", () => {
      expect(classificarTipoPessoa("9999", false)).toBe("Indefinido");
    });
  });

  describe("por descrição (formato realmente gravado em company_cnpj)", () => {
    it("classifica Empresário (Individual)", () => {
      expect(classificarTipoPessoa("Empresário (Individual)", false)).toBe(
        "Empresário Individual"
      );
      // Sem acento e em caixa alta — variações possíveis do dicionário
      expect(classificarTipoPessoa("EMPRESARIO (INDIVIDUAL)", false)).toBe(
        "Empresário Individual"
      );
    });

    it("classifica EIRELI, sociedade unipessoal e empresa individual imobiliária", () => {
      expect(
        classificarTipoPessoa(
          "Empresa Individual de Responsabilidade Limitada (de Natureza Empresária)",
          false
        )
      ).toBe("Empresa (unipessoal)");
      expect(
        classificarTipoPessoa(
          "Empresa Individual de Responsabilidade Limitada (de Natureza Simples)",
          false
        )
      ).toBe("Empresa (unipessoal)");
      expect(classificarTipoPessoa("Sociedade Unipessoal de Advocacia", false)).toBe(
        "Empresa (unipessoal)"
      );
    });

    it("classifica as demais descrições do grupo 2 como sociedade", () => {
      expect(classificarTipoPessoa("Sociedade Empresária Limitada", false)).toBe(
        "Empresa (sociedade)"
      );
      expect(classificarTipoPessoa("Sociedade Anônima Fechada", false)).toBe(
        "Empresa (sociedade)"
      );
      expect(classificarTipoPessoa("Cooperativa", false)).toBe("Empresa (sociedade)");
    });

    // O caso que motivou classificar por grupo: as descrições abaixo somam ~1,4M
    // registros que antes caíam em "Empresa (sociedade)".
    it("não rotula como empresa quem não é do grupo empresarial", () => {
      expect(classificarTipoPessoa("Produtor Rural (Pessoa Física)", false)).toBe(
        "Pessoa Física"
      );
      expect(classificarTipoPessoa("Empresa Individual Imobiliária", false)).toBe(
        "Pessoa Física"
      );
      expect(classificarTipoPessoa("Associação Privada", false)).toBe(
        "Entidade sem fins lucrativos"
      );
      expect(classificarTipoPessoa("Condomínio Edilício", false)).toBe(
        "Entidade sem fins lucrativos"
      );
      expect(classificarTipoPessoa("Organização Religiosa", false)).toBe(
        "Entidade sem fins lucrativos"
      );
      expect(classificarTipoPessoa("Órgão de Direção Local de Partido Político", false)).toBe(
        "Entidade sem fins lucrativos"
      );
      expect(classificarTipoPessoa("Serviço Notarial e Registral (Cartório)", false)).toBe(
        "Entidade sem fins lucrativos"
      );
      expect(classificarTipoPessoa("Município", false)).toBe("Administração Pública");
      expect(classificarTipoPessoa("Organização Internacional", false)).toBe(
        "Organização Internacional"
      );
    });

    it("aceita a descrição em caixa alta do dicionário", () => {
      expect(classificarTipoPessoa("ENTIDADE PÚBLICA SOB REGIME ESPECIAL", false)).toBe(
        "Administração Pública"
      );
    });
  });

  // Só ocorre se a Receita revisar a tabela CONCLA antes do dicionário embutido
  // ser regenerado — degrada em vez de devolver "Indefinido" para tudo.
  describe("descrição fora do dicionário embutido", () => {
    it("ainda reconhece empresário individual e unipessoal pelo texto", () => {
      expect(classificarTipoPessoa("Empresário Rural Individual (novo)", false)).toBe(
        "Empresário Individual"
      );
      expect(classificarTipoPessoa("Sociedade Limitada Unipessoal", false)).toBe(
        "Empresa (unipessoal)"
      );
      expect(classificarTipoPessoa("Autônomo (Pessoa Física)", false)).toBe("Pessoa Física");
    });

    it("cai em sociedade quando nada mais se aplica", () => {
      expect(classificarTipoPessoa("Sociedade Cooperativa de Inovação", false)).toBe(
        "Empresa (sociedade)"
      );
    });
  });
});
