import { DEFAULT_FILTERS, type MapaFilterState } from "../../mapa/_components/types";

export interface CnpjsFilterState extends MapaFilterState {
  /** Múltiplas UFs (OR) — a tela de CNPJs (diferente do Mapa) tem seletor próprio de UF. */
  ufs: string[];
  textoLivre: string;
  /** Múltiplos nomes de município (OR). */
  cidades: string[];
}

export const DEFAULT_CNPJS_FILTERS: CnpjsFilterState = {
  ...DEFAULT_FILTERS,
  ufs: [],
  textoLivre: "",
  cidades: [],
};

export interface CnpjTableItem {
  id: string;
  cnpj: string;
  razao_social: string;
  nome_fantasia: string | null;
  municipio_nome: string;
  uf: string;
  cnae_principal: string;
  /** Denominação da subclasse (lookup_cnae) — resolvida no servidor. */
  cnae_descricao: string | null;
  /** Seção da CNAE 2.0 = setor econômico. */
  cnae_secao: string | null;
  cnae_divisao: string | null;
  /** Atividades secundárias declaradas (7 díg). Vazio é o caso majoritário. */
  cnaes_secundarios: string[];
  /**
   * Principal e algum secundário em lados opostos do balcão — atacadista que
   * também faz varejo, indústria com loja. Derivado no servidor pela regra de
   * @radar/shared, a mesma do CSV exportado.
   */
  atividade_mista: boolean;
  situacao: string;
  porte: string | null;
  /** Descrição da natureza jurídica, como gravada em company_cnpj. */
  natureza_juridica: string | null;
  /** Decimal serializado como string pela API — nunca number. */
  capital_social: string | null;
  /** ISO 8601 vindo do JSON da API (Date serializado). */
  data_abertura: string | null;
  email: string | null;
  /**
   * QSA vindo da API (company_socio_agg). null = sem quadro societário
   * registrado — normal em empresário individual, não é erro.
   *
   * LGPD: só nome e qualificação do decisor. A API nunca envia CPF de sócio.
   */
  socio_administrador: string | null;
  qualificacao_admin: string | null;
  qtd_socios: number | null;
  tem_socio_estrangeiro: boolean | null;
  /** nº de CNPJs do grupo econômico; null quando não pertence a nenhum. */
  grupo_tamanho: number | null;
  opcao_simples: boolean;
  opcao_mei: boolean;
  latitude: number | null;
  longitude: number | null;
}

export interface CnpjsPageResult {
  items: CnpjTableItem[];
  nextCursor: string | null;
  count: number;
  countExact: boolean;
}
