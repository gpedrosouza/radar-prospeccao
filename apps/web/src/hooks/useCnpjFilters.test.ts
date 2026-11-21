import { describe, it, expect } from "vitest";
import { computeRemovedParams } from "./useCnpjFilters";
import {
  cnpjsParamsToFilters,
  cnpjsFiltersToUrlParams,
  cnpjsFiltersToApiParams,
  filtersToExportBody,
} from "@/app/(app)/cnpjs/_components/utils";

describe("computeRemovedParams", () => {
  it("removes only the specified key, leaving others intact", () => {
    const params = new URLSearchParams("sit=Ativa&cnae=62&uf=SP&porte=ME");

    const result = computeRemovedParams(params, ["sit"]);

    expect(result.has("sit")).toBe(false);
    expect(result.get("cnae")).toBe("62");
    expect(result.get("uf")).toBe("SP");
    expect(result.get("porte")).toBe("ME");
  });

  it("removes multiple keys at once while preserving the rest", () => {
    const params = new URLSearchParams("sit=Ativa&de=2020-01-01&ate=2024-12-31&cnae=47");

    const result = computeRemovedParams(params, ["de", "ate"]);

    expect(result.has("de")).toBe(false);
    expect(result.has("ate")).toBe(false);
    expect(result.get("sit")).toBe("Ativa");
    expect(result.get("cnae")).toBe("47");
  });

  it("is a no-op when the key is not present", () => {
    const params = new URLSearchParams("cnae=62&uf=RJ");

    const result = computeRemovedParams(params, ["sit"]);

    expect(result.get("cnae")).toBe("62");
    expect(result.get("uf")).toBe("RJ");
    expect(result.toString()).toBe(params.toString());
  });

  it("does not mutate the original URLSearchParams", () => {
    const params = new URLSearchParams("sit=Ativa&cnae=62");

    computeRemovedParams(params, ["sit"]);

    // Original must be unchanged
    expect(params.get("sit")).toBe("Ativa");
    expect(params.get("cnae")).toBe("62");
  });

  it("removes geo cluster keys (lat, lng, label) together", () => {
    const params = new URLSearchParams("lat=-23.5&lng=-46.6&label=São Paulo&sit=Ativa");

    const result = computeRemovedParams(params, ["lat", "lng", "label"]);

    expect(result.has("lat")).toBe(false);
    expect(result.has("lng")).toBe(false);
    expect(result.has("label")).toBe(false);
    expect(result.get("sit")).toBe("Ativa");
  });

  it("removes the natureza jurídica key without touching the rest", () => {
    const params = new URLSearchParams("uf=SP&nat=2135,2062&sit=Ativa");

    const result = computeRemovedParams(params, ["nat"]);

    expect(result.has("nat")).toBe(false);
    expect(result.get("uf")).toBe("SP");
    expect(result.get("sit")).toBe("Ativa");
  });
});

// ── Filtro de natureza jurídica: URL ↔ estado ↔ API ──────────────────────────

describe("natureza jurídica nos filtros de CNPJs", () => {
  it("lê o parâmetro nat da URL como lista de códigos", () => {
    const filters = cnpjsParamsToFilters({ uf: "SP", nat: "2135, 2062" });

    expect(filters.naturezasJuridicas).toEqual(["2135", "2062"]);
  });

  it("faz round-trip estado → URL → estado", () => {
    const filters = cnpjsParamsToFilters({ uf: "SP", nat: "2135" });

    const url = cnpjsFiltersToUrlParams(filters);

    expect(url.get("nat")).toBe("2135");
    expect(cnpjsParamsToFilters(Object.fromEntries(url)).naturezasJuridicas).toEqual(["2135"]);
  });

  it("omite nat da URL quando nenhuma natureza está selecionada", () => {
    const url = cnpjsFiltersToUrlParams(cnpjsParamsToFilters({ uf: "SP" }));

    expect(url.has("nat")).toBe(false);
  });

  it("envia naturezas_juridicas para a busca e para o job de exportação", () => {
    const filters = cnpjsParamsToFilters({ uf: "SP", nat: "2135,2062" });

    expect(cnpjsFiltersToApiParams(filters, {}).get("naturezas_juridicas")).toBe("2135,2062");
    expect(filtersToExportBody(filters).naturezas_juridicas).toEqual(["2135", "2062"]);
  });
});

// ── Filtro de setor (seção CNAE): URL ↔ estado ↔ API ─────────────────────────

describe("setor nos filtros de CNPJs", () => {
  it("lê o parâmetro setor da URL e normaliza para maiúsculas", () => {
    const filters = cnpjsParamsToFilters({ uf: "SP", setor: "g, a" });

    expect(filters.cnaeSecoes).toEqual(["G", "A"]);
  });

  it("faz round-trip estado → URL → estado", () => {
    const filters = cnpjsParamsToFilters({ uf: "SP", setor: "G" });
    const url = cnpjsFiltersToUrlParams(filters);

    expect(url.get("setor")).toBe("G");
    expect(cnpjsParamsToFilters(Object.fromEntries(url)).cnaeSecoes).toEqual(["G"]);
  });

  it("omite setor da URL quando nada está selecionado", () => {
    expect(cnpjsFiltersToUrlParams(cnpjsParamsToFilters({ uf: "SP" })).has("setor")).toBe(false);
  });

  it("envia cnae_secoes para a busca e para o job de exportação", () => {
    const filters = cnpjsParamsToFilters({ uf: "SP", setor: "G,A" });

    expect(cnpjsFiltersToApiParams(filters, {}).get("cnae_secoes")).toBe("G,A");
    expect(filtersToExportBody(filters).cnae_secoes).toEqual(["G", "A"]);
  });

  it("remove o filtro de setor sem afetar os demais", () => {
    const params = new URLSearchParams("uf=SP&setor=G&cnae=4711");

    const result = computeRemovedParams(params, ["setor"]);

    expect(result.has("setor")).toBe(false);
    expect(result.get("cnae")).toBe("4711");
    expect(result.get("uf")).toBe("SP");
  });
});
