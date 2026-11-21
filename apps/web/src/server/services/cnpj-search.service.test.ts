/**
 * Testes do cnpj-search.service.
 *
 * Repositories mockados via vi.mock — não requerem banco rodando.
 *
 * Cenário central: lógica de "cidades no raio como filtro primário vs
 * cidade de referência como fallback".
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ZodError } from "zod";

// vi.mock é hoisted pelo Vitest antes dos imports, portanto a ordem é segura.
vi.mock("@/server/repositories/city.repository");
vi.mock("@/server/repositories/cnpj.repository");
// Dicionários de CNAE: factory explícita porque o módulo real importa o
// singleton do Prisma só por ser carregado.
vi.mock("@/server/repositories/cnae.repository", () => ({
  classeFromCnae: (cnae: string) =>
    cnae.replace(/\D/g, "").padStart(7, "0").slice(0, 5),
  descricaoMap: vi.fn(async () => new Map<string, string>()),
  estruturaMap: vi.fn(async () => new Map()),
  secoes: vi.fn(async () => []),
  divisoesDe: vi.fn(async () => []),
  resolvePrefixos: vi.fn(),
  secundariosPara: vi.fn(async () => new Map<string, string[]>()),
  secundariosDoCnpj: vi.fn(async () => []),
}));
// QSA: mesma razão da factory de cnae.repository — o módulo real importa o
// singleton do Prisma só por ser carregado, e sem o mock o enriquecimento
// bateria no banco de verdade dentro de um teste unitário.
vi.mock("@/server/repositories/socio.repository", () => ({
  basicoFromCnpj: (cnpj: string) =>
    cnpj.replace(/\D/g, "").padStart(14, "0").slice(0, 8),
  qsaEnrichmentFor: vi.fn(async () => new Map()),
  socioAggFor: vi.fn(async () => new Map()),
  grupoEconomicoFor: vi.fn(async () => new Map()),
  sociosDoCnpj: vi.fn(async () => []),
}));
// evita conexão real ao Redis só por importar o service
vi.mock("@/server/queue/geocode-enrichment-queue", () => ({
  geocodeEnrichmentQueue: { add: vi.fn().mockResolvedValue(undefined) },
}));

import * as cityRepo from "@/server/repositories/city.repository";
import * as cnpjRepo from "@/server/repositories/cnpj.repository";
import * as cnaeRepo from "@/server/repositories/cnae.repository";
import * as socioRepo from "@/server/repositories/socio.repository";
import { geocodeEnrichmentQueue } from "@/server/queue/geocode-enrichment-queue";
import { searchCnpjs, countCnpjs, resolveSearchContext, enqueueGeocodeEnrichment } from "./cnpj-search.service";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const EMPTY_PAGE = { items: [], nextCursor: null };
const EMPTY_COUNT = { count: 0, exact: true };

// municipio_codigo_rf simula o código de município da Receita Federal — um
// sistema de numeração independente do codigo_ibge (ver cnpj-search.service.ts).
const SAO_PAULO   = { codigo_ibge: 3550308, nome: "São Paulo",       uf: "SP", distancia_km: 0,  municipio_codigo_rf: 7107 };
const BARUERI     = { codigo_ibge: 3506300, nome: "Barueri",        uf: "SP", distancia_km: 18.5, municipio_codigo_rf: 1029 };
const POCOS_MG    = { codigo_ibge: 3151800, nome: "Poços de Caldas", uf: "MG", distancia_km: 30,  municipio_codigo_rf: 5232 };
/** Cidade sem correspondência RF (matching de nome+UF não achou par). */
const SEM_RF      = { codigo_ibge: 9999999, nome: "Sem Match",       uf: "SP", distancia_km: 5,  municipio_codigo_rf: null };

const GEO = { lat: -23.5489, lng: -46.6388, raio_km: 25 } as const;

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(cnpjRepo.findByFilters).mockResolvedValue(EMPTY_PAGE);
  vi.mocked(cnpjRepo.countByFiltersCapped).mockResolvedValue(EMPTY_COUNT);
  // Espelha a precedência de resolveCnaePrefixos (@radar/db): prefixo digitado
  // vence o setor. Testes de setor sobrescrevem com as divisões resolvidas.
  vi.mocked(cnaeRepo.resolvePrefixos).mockImplementation(async (f) =>
    f.cnae_prefixos !== undefined && f.cnae_prefixos.length > 0
      ? f.cnae_prefixos
      : undefined
  );
  vi.mocked(cnaeRepo.descricaoMap).mockResolvedValue(new Map());
  vi.mocked(cnaeRepo.estruturaMap).mockResolvedValue(new Map());
});

// ── Busca por raio ────────────────────────────────────────────────────────────

describe("busca por raio", () => {
  it("quando raio retorna cidades, usa os municipio_codigo_rf delas como filtro primário", async () => {
    vi.mocked(cityRepo.findWithinRadius).mockResolvedValue([SAO_PAULO, BARUERI]);

    await searchCnpjs({ uf: "SP", ...GEO }, { limit: 50 });

    expect(cnpjRepo.findByFilters).toHaveBeenCalledWith(
      expect.objectContaining({ municipio_codigos: [7107, 1029] }),
      { limit: 50, cursor: undefined }
    );
  });

  it("ignora cidades do raio sem municipio_codigo_rf (sem correspondência)", async () => {
    vi.mocked(cityRepo.findWithinRadius).mockResolvedValue([SAO_PAULO, SEM_RF]);

    await searchCnpjs({ uf: "SP", ...GEO }, { limit: 50 });

    expect(cnpjRepo.findByFilters).toHaveBeenCalledWith(
      expect.objectContaining({ municipio_codigos: [7107] }),
      { limit: 50, cursor: undefined }
    );
  });

  it("quando raio retorna vazio + municipio_codigo presente, usa o fallback resolvido via findByCodigoIbge", async () => {
    vi.mocked(cityRepo.findWithinRadius).mockResolvedValue([]);
    vi.mocked(cityRepo.findByCodigoIbge).mockResolvedValue({ municipio_codigo_rf: 7107 });

    await searchCnpjs(
      { uf: "SP", ...GEO, raio_km: 2, municipio_codigo: 3550308 },
      { limit: 50 }
    );

    expect(cityRepo.findByCodigoIbge).toHaveBeenCalledWith(3550308);
    expect(cnpjRepo.findByFilters).toHaveBeenCalledWith(
      expect.objectContaining({ municipio_codigos: [7107] }),
      { limit: 50, cursor: undefined }
    );
  });

  it("fallback com municipio_codigo sem correspondência RF busca sem filtro de município", async () => {
    vi.mocked(cityRepo.findWithinRadius).mockResolvedValue([]);
    vi.mocked(cityRepo.findByCodigoIbge).mockResolvedValue(null);

    await searchCnpjs(
      { uf: "SP", ...GEO, raio_km: 2, municipio_codigo: 9999999 },
      { limit: 50 }
    );

    expect(cnpjRepo.findByFilters).toHaveBeenCalledWith(
      expect.objectContaining({ municipio_codigos: undefined }),
      { limit: 50, cursor: undefined }
    );
  });

  it("quando raio retorna vazio e sem fallback, busca sem filtro de município", async () => {
    vi.mocked(cityRepo.findWithinRadius).mockResolvedValue([]);

    await searchCnpjs({ uf: "SP", ...GEO, raio_km: 1 }, { limit: 50 });

    expect(cnpjRepo.findByFilters).toHaveBeenCalledWith(
      expect.objectContaining({ municipio_codigos: undefined }),
      { limit: 50, cursor: undefined }
    );
  });

  it("cidades do raio têm precedência sobre municipio_codigo", async () => {
    vi.mocked(cityRepo.findWithinRadius).mockResolvedValue([SAO_PAULO]);

    // municipio_codigo: 9999 é diferente do retorno do raio — não deve aparecer,
    // nem findByCodigoIbge deve ser chamado (raio já encontrou cidade válida).
    await searchCnpjs(
      { ...GEO, municipio_codigo: 9999 },
      { limit: 50 }
    );

    expect(cityRepo.findByCodigoIbge).not.toHaveBeenCalled();
    expect(cnpjRepo.findByFilters).toHaveBeenCalledWith(
      expect.objectContaining({ municipio_codigos: [7107] }),
      expect.any(Object)
    );
  });

  it("chama findWithinRadius com os parâmetros corretos", async () => {
    vi.mocked(cityRepo.findWithinRadius).mockResolvedValue([]);

    await searchCnpjs({ lat: -23.5, lng: -46.6, raio_km: 30 }, { limit: 10 });

    expect(cityRepo.findWithinRadius).toHaveBeenCalledWith(-23.5, -46.6, 30);
  });
});

// ── Busca sem raio ────────────────────────────────────────────────────────────

describe("busca por cidade única (sem raio)", () => {
  it("resolve municipio_codigo (IBGE) para o código RF via findByCodigoIbge, sem chamar findWithinRadius", async () => {
    vi.mocked(cityRepo.findByCodigoIbge).mockResolvedValue({ municipio_codigo_rf: 7107 });

    await searchCnpjs(
      { uf: "SP", municipio_codigo: 3550308 },
      { limit: 50 }
    );

    expect(cityRepo.findWithinRadius).not.toHaveBeenCalled();
    expect(cityRepo.findByCodigoIbge).toHaveBeenCalledWith(3550308);
    expect(cnpjRepo.findByFilters).toHaveBeenCalledWith(
      expect.objectContaining({ municipio_codigos: [7107] }),
      expect.any(Object)
    );
  });

  it("sem cidade e sem raio, busca sem filtro de município", async () => {
    await searchCnpjs({ uf: "SP" }, { limit: 50 });

    expect(cityRepo.findWithinRadius).not.toHaveBeenCalled();
    expect(cnpjRepo.findByFilters).toHaveBeenCalledWith(
      expect.objectContaining({ municipio_codigos: undefined }),
      expect.any(Object)
    );
  });
});

// ── Filtros de negócio ────────────────────────────────────────────────────────

describe("filtros de negócio", () => {
  it("repassa todos os filtros opcionais para o repository", async () => {
    await searchCnpjs(
      {
        uf:                "SP",
        situacao:          "Ativa",
        cnae_prefixo:      "6201",
        porte:             "ME",
        matriz_filial:     "MATRIZ",
        opcao_simples:     true,
        data_abertura_de:  "2020-01-01",
        data_abertura_ate: "2023-12-31",
      },
      { limit: 100, cursor: 99999n }
    );

    expect(cnpjRepo.findByFilters).toHaveBeenCalledWith(
      expect.objectContaining({
        uf:                "SP",
        situacao:          "Ativa",
        cnae_prefixo:      "6201",
        porte:             "ME",
        matriz_filial:     "MATRIZ",
        opcao_simples:     true,
        data_abertura_de:  "2020-01-01",
        data_abertura_ate: "2023-12-31",
      }),
      { limit: 100, cursor: 99999n }
    );
  });

  it("repassa municipio_nome ao repository, independente de municipio_codigo", async () => {
    await searchCnpjs(
      { uf: "SP", municipio_nome: "SAO PAULO" },
      { limit: 50 }
    );

    expect(cityRepo.findWithinRadius).not.toHaveBeenCalled();
    expect(cnpjRepo.findByFilters).toHaveBeenCalledWith(
      expect.objectContaining({ municipio_nome: "SAO PAULO", municipio_codigos: undefined }),
      expect.any(Object)
    );
  });
});

// ── Contexto de busca compartilhado (evitar dupla resolução de raio) ──────────

describe("resolveSearchContext", () => {
  it("chama findWithinRadius apenas uma vez quando o contexto é reaproveitado por search+count", async () => {
    vi.mocked(cityRepo.findWithinRadius).mockResolvedValue([SAO_PAULO, BARUERI]);

    const context = await resolveSearchContext({ ...GEO });
    await Promise.all([
      searchCnpjs({ ...GEO }, { limit: 50 }, context),
      countCnpjs({ ...GEO }, 10_000, context),
    ]);

    expect(cityRepo.findWithinRadius).toHaveBeenCalledTimes(1);
  });

  it("sem context pré-resolvido, searchCnpjs resolve por conta própria (uso standalone)", async () => {
    vi.mocked(cityRepo.findWithinRadius).mockResolvedValue([]);

    await searchCnpjs({ uf: "SP" }, { limit: 50 });

    expect(cnpjRepo.findByFilters).toHaveBeenCalled();
  });

  it("countCnpjs aceita um context pré-resolvido e não chama findWithinRadius de novo", async () => {
    vi.mocked(cityRepo.findWithinRadius).mockResolvedValue([SAO_PAULO]);

    const context = await resolveSearchContext({ ...GEO });
    vi.mocked(cityRepo.findWithinRadius).mockClear();

    await countCnpjs({ ...GEO }, 10_000, context);

    expect(cityRepo.findWithinRadius).not.toHaveBeenCalled();
    expect(cnpjRepo.countByFiltersCapped).toHaveBeenCalledWith(
      expect.objectContaining({ municipio_codigos: [7107] }),
      10_000
    );
  });
});

describe("inferência de UF a partir do raio (partition pruning sem uf explícita)", () => {
  it("sem uf explícita, infere uf_in a partir das cidades do raio", async () => {
    vi.mocked(cityRepo.findWithinRadius).mockResolvedValue([SAO_PAULO, BARUERI]);

    await searchCnpjs({ ...GEO }, { limit: 50 });

    expect(cnpjRepo.findByFilters).toHaveBeenCalledWith(
      expect.objectContaining({ uf: undefined, uf_in: ["SP"] }),
      expect.any(Object)
    );
  });

  it("com uf explícita, uf tem precedência e uf_in não é definido", async () => {
    vi.mocked(cityRepo.findWithinRadius).mockResolvedValue([SAO_PAULO, BARUERI]);

    await searchCnpjs({ uf: "SP", ...GEO }, { limit: 50 });

    expect(cnpjRepo.findByFilters).toHaveBeenCalledWith(
      expect.objectContaining({ uf: "SP", uf_in: undefined }),
      expect.any(Object)
    );
  });

  it("raio cruzando duas UFs agrega ambas em uf_in, sem duplicar", async () => {
    vi.mocked(cityRepo.findWithinRadius).mockResolvedValue([SAO_PAULO, BARUERI, POCOS_MG]);

    await searchCnpjs({ ...GEO }, { limit: 50 });

    const call = vi.mocked(cnpjRepo.findByFilters).mock.calls.at(-1)!;
    const repoFilters = call[0] as { uf_in?: string[] };
    expect(repoFilters.uf_in).toHaveLength(2);
    expect(repoFilters.uf_in).toEqual(expect.arrayContaining(["SP", "MG"]));
  });

  it("sem raio (busca só por município), uf_in não é definido", async () => {
    await searchCnpjs({ municipio_codigo: 3550308 }, { limit: 50 });

    expect(cnpjRepo.findByFilters).toHaveBeenCalledWith(
      expect.objectContaining({ uf_in: undefined }),
      expect.any(Object)
    );
  });
});

// ── Filtros multi-valor (ufs, municipio_nomes, cnae_prefixos, portes) ─────────

describe("filtros multi-valor", () => {
  it("ufs sem uf explícita vira uf_in", async () => {
    await searchCnpjs({ ufs: ["SP", "RJ"] }, { limit: 50 });

    expect(cnpjRepo.findByFilters).toHaveBeenCalledWith(
      expect.objectContaining({ uf: undefined, uf_in: ["SP", "RJ"] }),
      expect.any(Object)
    );
  });

  it("uf explícita tem precedência sobre ufs", async () => {
    await searchCnpjs({ uf: "SP", ufs: ["RJ", "MG"] }, { limit: 50 });

    expect(cnpjRepo.findByFilters).toHaveBeenCalledWith(
      expect.objectContaining({ uf: "SP", uf_in: undefined }),
      expect.any(Object)
    );
  });

  it("ufs tem precedência sobre uf_in inferido do raio", async () => {
    vi.mocked(cityRepo.findWithinRadius).mockResolvedValue([SAO_PAULO, BARUERI]);

    await searchCnpjs({ ufs: ["MG"], ...GEO }, { limit: 50 });

    expect(cnpjRepo.findByFilters).toHaveBeenCalledWith(
      expect.objectContaining({ uf: undefined, uf_in: ["MG"] }),
      expect.any(Object)
    );
  });

  it("repassa municipio_nomes/cnae_prefixos/portes ao repository", async () => {
    await searchCnpjs(
      { uf: "SP", municipio_nomes: ["SAO PAULO", "BARUERI"], cnae_prefixos: ["6201", "4711"], portes: ["Micro", "Pequena"] },
      { limit: 50 }
    );

    expect(cnpjRepo.findByFilters).toHaveBeenCalledWith(
      expect.objectContaining({
        municipio_nomes: ["SAO PAULO", "BARUERI"],
        cnae_prefixos: ["6201", "4711"],
        portes: ["Micro", "Pequena"],
      }),
      expect.any(Object)
    );
  });

  it("repassa naturezas_juridicas ao repository", async () => {
    await searchCnpjs({ uf: "SP", naturezas_juridicas: ["2135", "2062"] }, { limit: 50 });

    expect(cnpjRepo.findByFilters).toHaveBeenCalledWith(
      expect.objectContaining({ naturezas_juridicas: ["2135", "2062"] }),
      expect.any(Object)
    );
  });

  it("repassa natureza_juridica singular ao repository e ao count", async () => {
    await searchCnpjs({ uf: "SP", natureza_juridica: "2135" }, { limit: 50 });
    await countCnpjs({ uf: "SP", natureza_juridica: "2135" });

    expect(cnpjRepo.findByFilters).toHaveBeenCalledWith(
      expect.objectContaining({ natureza_juridica: "2135" }),
      expect.any(Object)
    );
    expect(cnpjRepo.countByFiltersCapped).toHaveBeenCalledWith(
      expect.objectContaining({ natureza_juridica: "2135" }),
      expect.any(Number)
    );
  });

  it("rejeita código de natureza jurídica fora do formato da Receita", async () => {
    await expect(
      searchCnpjs({ uf: "SP", natureza_juridica: "empresário" }, { limit: 50 })
    ).rejects.toThrow();
  });
});

// ── Setor (seção CNAE) e enriquecimento ──────────────────────────────────────

describe("filtro por setor", () => {
  it("usa as divisões resolvidas da seção como cnae_prefixos", async () => {
    // Seção G (comércio) → divisões 45, 46 e 47.
    vi.mocked(cnaeRepo.resolvePrefixos).mockResolvedValue(["45", "46", "47"]);

    await searchCnpjs({ uf: "SP", cnae_secoes: ["G"] }, { limit: 50 });

    expect(cnaeRepo.resolvePrefixos).toHaveBeenCalledWith(
      expect.objectContaining({ cnae_secoes: ["G"] })
    );
    expect(cnpjRepo.findByFilters).toHaveBeenCalledWith(
      expect.objectContaining({ cnae_prefixos: ["45", "46", "47"] }),
      expect.any(Object)
    );
  });

  it("a mesma resolução vale para o count", async () => {
    vi.mocked(cnaeRepo.resolvePrefixos).mockResolvedValue(["45", "46", "47"]);

    await countCnpjs({ uf: "SP", cnae_secoes: ["G"] });

    expect(cnpjRepo.countByFiltersCapped).toHaveBeenCalledWith(
      expect.objectContaining({ cnae_prefixos: ["45", "46", "47"] }),
      expect.any(Number)
    );
  });

  it("rejeita seção fora do intervalo A–U", async () => {
    await expect(
      searchCnpjs({ uf: "SP", cnae_secoes: ["Z"] }, { limit: 50 })
    ).rejects.toThrow();
  });
});

describe("enriquecimento de CNAE", () => {
  const ITEM = {
    id: 1n,
    uf: "SP",
    cnpj: "00000000000191",
    razao_social: "TESTE LTDA",
    nome_fantasia: null,
    municipio_codigo: 7107,
    municipio_nome: "SAO PAULO",
    cnae_principal: "4755503",
    situacao: "Ativa",
    porte: "Micro",
    natureza_juridica: "Sociedade Empresária Limitada",
    capital_social: "10000",
    data_abertura: null,
    matriz_filial: "Matriz",
    email: null,
    telefone: null,
    endereco: null,
    opcao_simples: true,
    opcao_mei: false,
    latitude: null,
    longitude: null,
  };

  it("anexa decisor, nº de sócios e grupo econômico vindos do QSA", async () => {
    vi.mocked(cnpjRepo.findByFilters).mockResolvedValue({
      items: [ITEM],
      nextCursor: null,
    });
    vi.mocked(cnaeRepo.descricaoMap).mockResolvedValue(new Map());
    vi.mocked(cnaeRepo.estruturaMap).mockResolvedValue(new Map());
    vi.mocked(socioRepo.qsaEnrichmentFor).mockResolvedValue(
      new Map([
        [
          "00000000",
          {
            qtd_socios: 3,
            socio_administrador: "JOAO SILVA",
            qualificacao_admin: "Sócio-Administrador",
            tem_socio_estrangeiro: false,
            tem_socio_pj: true,
            grupo_tamanho: 4,
          },
        ],
      ])
    );

    const page = await searchCnpjs({ uf: "SP" }, { limit: 50 });

    expect(page.items[0].socio_administrador).toBe("JOAO SILVA");
    expect(page.items[0].qualificacao_admin).toBe("Sócio-Administrador");
    expect(page.items[0].qtd_socios).toBe(3);
    expect(page.items[0].grupo_tamanho).toBe(4);
  });

  it("deixa os campos de QSA nulos quando o CNPJ não tem quadro societário", async () => {
    vi.mocked(cnpjRepo.findByFilters).mockResolvedValue({
      items: [ITEM],
      nextCursor: null,
    });
    vi.mocked(cnaeRepo.descricaoMap).mockResolvedValue(new Map());
    vi.mocked(cnaeRepo.estruturaMap).mockResolvedValue(new Map());
    vi.mocked(socioRepo.qsaEnrichmentFor).mockResolvedValue(new Map());

    const page = await searchCnpjs({ uf: "SP" }, { limit: 50 });

    expect(page.items[0].socio_administrador).toBeNull();
    expect(page.items[0].qtd_socios).toBeNull();
    expect(page.items[0].grupo_tamanho).toBeNull();
  });

  it("resolve o QSA uma vez por página, não por item", async () => {
    vi.mocked(cnpjRepo.findByFilters).mockResolvedValue({
      items: [ITEM, { ...ITEM, id: BigInt(2), cnpj: "00000000000272" }],
      nextCursor: null,
    });
    vi.mocked(cnaeRepo.descricaoMap).mockResolvedValue(new Map());
    vi.mocked(cnaeRepo.estruturaMap).mockResolvedValue(new Map());
    vi.mocked(socioRepo.qsaEnrichmentFor).mockClear();
    vi.mocked(socioRepo.qsaEnrichmentFor).mockResolvedValue(new Map());

    await searchCnpjs({ uf: "SP" }, { limit: 50 });

    expect(socioRepo.qsaEnrichmentFor).toHaveBeenCalledTimes(1);
  });

  it("anexa os CNAEs secundários e marca atividade mista", async () => {
    // Principal 4755-5/03 é varejo (B2C); o secundário 4641-9/01 é atacado
    // (B2B) — a loja que também distribui, o caso que a coluna existe para
    // revelar.
    vi.mocked(cnpjRepo.findByFilters).mockResolvedValue({
      items: [ITEM],
      nextCursor: null,
    });
    vi.mocked(cnaeRepo.descricaoMap).mockResolvedValue(new Map());
    vi.mocked(cnaeRepo.estruturaMap).mockResolvedValue(new Map());
    vi.mocked(socioRepo.qsaEnrichmentFor).mockResolvedValue(new Map());
    vi.mocked(cnaeRepo.secundariosPara).mockResolvedValue(
      new Map([["00000000000191", ["4641901", "4789099"]]])
    );

    const page = await searchCnpjs({ uf: "SP" }, { limit: 50 });

    expect(page.items[0].cnaes_secundarios).toEqual(["4641901", "4789099"]);
    expect(page.items[0].atividade_mista).toBe(true);
  });

  it("não marca atividade mista quando os secundários ficam do mesmo lado", async () => {
    vi.mocked(cnpjRepo.findByFilters).mockResolvedValue({
      items: [ITEM],
      nextCursor: null,
    });
    vi.mocked(cnaeRepo.descricaoMap).mockResolvedValue(new Map());
    vi.mocked(cnaeRepo.estruturaMap).mockResolvedValue(new Map());
    vi.mocked(socioRepo.qsaEnrichmentFor).mockResolvedValue(new Map());
    vi.mocked(cnaeRepo.secundariosPara).mockResolvedValue(
      new Map([["00000000000191", ["4789099"]]])
    );

    const page = await searchCnpjs({ uf: "SP" }, { limit: 50 });

    expect(page.items[0].atividade_mista).toBe(false);
  });

  it("devolve lista vazia quando o CNPJ não declara secundário", async () => {
    vi.mocked(cnpjRepo.findByFilters).mockResolvedValue({
      items: [ITEM],
      nextCursor: null,
    });
    vi.mocked(cnaeRepo.descricaoMap).mockResolvedValue(new Map());
    vi.mocked(cnaeRepo.estruturaMap).mockResolvedValue(new Map());
    vi.mocked(socioRepo.qsaEnrichmentFor).mockResolvedValue(new Map());
    vi.mocked(cnaeRepo.secundariosPara).mockResolvedValue(new Map());

    const page = await searchCnpjs({ uf: "SP" }, { limit: 50 });

    expect(page.items[0].cnaes_secundarios).toEqual([]);
    expect(page.items[0].atividade_mista).toBe(false);
  });

  it("resolve os CNAEs secundários uma vez por página, não por item", async () => {
    vi.mocked(cnpjRepo.findByFilters).mockResolvedValue({
      items: [ITEM, { ...ITEM, id: BigInt(2), cnpj: "00000000000272" }],
      nextCursor: null,
    });
    vi.mocked(cnaeRepo.descricaoMap).mockResolvedValue(new Map());
    vi.mocked(cnaeRepo.estruturaMap).mockResolvedValue(new Map());
    vi.mocked(socioRepo.qsaEnrichmentFor).mockResolvedValue(new Map());
    vi.mocked(cnaeRepo.secundariosPara).mockClear();
    vi.mocked(cnaeRepo.secundariosPara).mockResolvedValue(new Map());

    await searchCnpjs({ uf: "SP" }, { limit: 50 });

    expect(cnaeRepo.secundariosPara).toHaveBeenCalledTimes(1);
  });

  it("repassa os filtros de QSA ao repository", async () => {
    vi.mocked(cnpjRepo.findByFilters).mockResolvedValue(EMPTY_PAGE);

    await searchCnpjs(
      { uf: "SP", faz_parte_de_grupo: true, qtd_socios_min: 2 },
      { limit: 50 }
    );

    expect(cnpjRepo.findByFilters).toHaveBeenCalledWith(
      expect.objectContaining({ faz_parte_de_grupo: true, qtd_socios_min: 2 }),
      expect.anything()
    );
  });

  it("anexa descrição, setor e divisão a cada item", async () => {
    vi.mocked(cnpjRepo.findByFilters).mockResolvedValue({
      items: [ITEM],
      nextCursor: null,
    });
    vi.mocked(cnaeRepo.descricaoMap).mockResolvedValue(
      new Map([["4755503", "Comércio varejista de artigos de cama, mesa e banho"]])
    );
    vi.mocked(cnaeRepo.estruturaMap).mockResolvedValue(
      new Map([
        [
          "47555",
          {
            classe: "47555",
            classe_desc: "Comércio varejista de artigos de cama, mesa e banho",
            grupo: "475",
            grupo_desc: "Comércio varejista de equipamentos de informática",
            divisao: "47",
            divisao_desc: "COMÉRCIO VAREJISTA",
            secao: "G",
            secao_desc: "COMÉRCIO; REPARAÇÃO DE VEÍCULOS AUTOMOTORES E MOTOCICLETAS",
          },
        ],
      ])
    );

    const page = await searchCnpjs({ uf: "SP" }, { limit: 50 });

    expect(page.items[0]).toMatchObject({
      cnae_principal: "4755503",
      cnae_descricao: "Comércio varejista de artigos de cama, mesa e banho",
      cnae_secao: "COMÉRCIO; REPARAÇÃO DE VEÍCULOS AUTOMOTORES E MOTOCICLETAS",
      cnae_divisao: "COMÉRCIO VAREJISTA",
    });
  });

  it("devolve null quando o CNAE não está nos dicionários (ex: 8888888)", async () => {
    vi.mocked(cnpjRepo.findByFilters).mockResolvedValue({
      items: [{ ...ITEM, cnae_principal: "8888888" }],
      nextCursor: null,
    });

    const page = await searchCnpjs({ uf: "SP" }, { limit: 50 });

    expect(page.items[0]).toMatchObject({
      cnae_descricao: null,
      cnae_secao: null,
      cnae_divisao: null,
    });
  });

  it("não consulta os dicionários quando a página vem vazia", async () => {
    vi.mocked(cnpjRepo.findByFilters).mockResolvedValue(EMPTY_PAGE);

    await searchCnpjs({ uf: "SP" }, { limit: 50 });

    expect(cnaeRepo.descricaoMap).not.toHaveBeenCalled();
  });
});

// ── enqueueGeocodeEnrichment ──────────────────────────────────────────────────

describe("enqueueGeocodeEnrichment", () => {
  it("enfileira um job com os items informados", () => {
    enqueueGeocodeEnrichment([{ id: "1", uf: "SP" }, { id: "2", uf: "SP" }]);

    expect(geocodeEnrichmentQueue.add).toHaveBeenCalledWith("enrich", {
      items: [{ id: "1", uf: "SP" }, { id: "2", uf: "SP" }],
    });
  });

  it("não enfileira nada quando a lista está vazia", () => {
    enqueueGeocodeEnrichment([]);
    expect(geocodeEnrichmentQueue.add).not.toHaveBeenCalled();
  });

  it("não lança quando o enqueue falha (fire-and-forget)", async () => {
    vi.mocked(geocodeEnrichmentQueue.add).mockRejectedValueOnce(new Error("redis fora"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => enqueueGeocodeEnrichment([{ id: "1", uf: "SP" }])).not.toThrow();
    // deixa o .catch() interno rodar antes de checar
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});

// ── Paginação ─────────────────────────────────────────────────────────────────

describe("paginação por cursor", () => {
  it("passa cursor e limit para o repository", async () => {
    await searchCnpjs({ uf: "SP" }, { limit: 200, cursor: 88888n });

    expect(cnpjRepo.findByFilters).toHaveBeenCalledWith(
      expect.any(Object),
      { limit: 200, cursor: 88888n }
    );
  });

  it("cursor undefined quando não passado", async () => {
    await searchCnpjs({ uf: "SP" }, { limit: 50 });

    expect(cnpjRepo.findByFilters).toHaveBeenCalledWith(
      expect.any(Object),
      { limit: 50, cursor: undefined }
    );
  });
});

// ── Validação Zod ─────────────────────────────────────────────────────────────

describe("validação de filtros", () => {
  it("lat + lng sem raio_km lança ZodError", async () => {
    await expect(
      searchCnpjs({ lat: -23.5, lng: -46.6 }, { limit: 50 })
    ).rejects.toBeInstanceOf(ZodError);
  });

  it("raio_km sem lat/lng lança ZodError", async () => {
    await expect(
      searchCnpjs({ raio_km: 10 }, { limit: 50 })
    ).rejects.toBeInstanceOf(ZodError);
  });

  it("data_abertura_de > data_abertura_ate lança ZodError", async () => {
    await expect(
      searchCnpjs(
        { data_abertura_de: "2023-12-31", data_abertura_ate: "2020-01-01" },
        { limit: 50 }
      )
    ).rejects.toBeInstanceOf(ZodError);
  });

  it("data_abertura com formato inválido lança ZodError", async () => {
    await expect(
      searchCnpjs({ data_abertura_de: "31/12/2023" }, { limit: 50 })
    ).rejects.toBeInstanceOf(ZodError);
  });

  it("matriz_filial com valor inválido lança ZodError", async () => {
    await expect(
      searchCnpjs({ matriz_filial: "OUTRO" }, { limit: 50 })
    ).rejects.toBeInstanceOf(ZodError);
  });

  it("objeto vazio (sem escopo geográfico) lança ZodError — evitaria varrer as 27 partições", async () => {
    await expect(searchCnpjs({}, { limit: 50 })).rejects.toBeInstanceOf(ZodError);
  });

  it("uf sozinho já é escopo suficiente", async () => {
    await expect(searchCnpjs({ uf: "SP" }, { limit: 50 })).resolves.toBeDefined();
  });
});
