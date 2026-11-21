/**
 * Opções de natureza jurídica oferecidas nos filtros de Mapa e CNPJs.
 *
 * Recorte curado das naturezas que realmente aparecem em volume na base (ver
 * distribuição real em company_cnpj) — o dicionário completo tem 91 entradas,
 * a maioria com centenas de linhas ou de órgãos públicos, irrelevantes para
 * prospecção. Não vem de endpoint porque o dicionário da Receita é estático
 * entre importações.
 *
 * Os códigos são o contrato da API (natureza_juridica/naturezas_juridicas); a
 * tradução código → descrição gravada em company_cnpj acontece no repositório.
 */
export const NATUREZA_JURIDICA_OPTIONS = [
  { value: "2135", label: "Empresário Individual" },
  { value: "2062", label: "Sociedade Empresária Ltda." },
  { value: "2240", label: "Sociedade Simples Ltda." },
  { value: "2232", label: "Sociedade Simples Pura" },
  { value: "2054", label: "S.A. Fechada" },
  { value: "2046", label: "S.A. Aberta" },
  { value: "2305", label: "EIRELI (Empresária)" },
  { value: "2313", label: "EIRELI (Simples)" },
  { value: "2321", label: "Soc. Unipessoal de Advocacia" },
  { value: "4120", label: "Produtor Rural (Pessoa Física)" },
  { value: "3999", label: "Associação Privada" },
  { value: "2127", label: "Soc. em Conta de Participação" },
] as const;

const LABEL_POR_CODIGO = new Map<string, string>(
  NATUREZA_JURIDICA_OPTIONS.map((o) => [o.value, o.label])
);

/** Rótulo curto para chips; cai no próprio código quando não é uma opção conhecida. */
export function naturezaJuridicaLabel(codigo: string): string {
  return LABEL_POR_CODIGO.get(codigo) ?? codigo;
}
