export interface MapaFilterState {
  lat: number | null;
  lng: number | null;
  label: string;
  raioKm: number;
  situacao: string;
  /** Múltiplos prefixos CNAE (OR) — o Mapa só edita o 1º elemento na UI, mas o tipo é
   *  compartilhado com a tela de CNPJs (multi-seleção completa). Ver cnpjs/types.ts. */
  cnaePrefixos: string[];
  /** Múltiplos portes (OR) — mesma observação de cnaePrefixos acima. */
  portes: string[];
  /** Códigos de natureza jurídica da Receita (OR) — ex: ["2135"]. */
  naturezasJuridicas: string[];
  /** Seções da CNAE 2.0 (OR) — ex: ["G"]. O servidor traduz em prefixos de CNAE. */
  cnaeSecoes: string[];
  matrizFilial: "" | "MATRIZ" | "FILIAL";
  /** QSA: só CNPJs que dividem sócio com outro (grupo econômico). */
  fazParteDeGrupo: boolean;
  opcaoSimples: boolean;
  opcaoMei: boolean;
  dataAberturaDE: string;
  dataAberturaATE: string;
}

export const DEFAULT_RAIO_KM = 40;

export const DEFAULT_FILTERS: MapaFilterState = {
  lat: null,
  lng: null,
  label: "",
  raioKm: DEFAULT_RAIO_KM,
  situacao: "",
  cnaePrefixos: [],
  portes: [],
  naturezasJuridicas: [],
  cnaeSecoes: [],
  matrizFilial: "",
  fazParteDeGrupo: false,
  opcaoSimples: false,
  opcaoMei: false,
  dataAberturaDE: "",
  dataAberturaATE: "",
};

export interface CnpjMapItem {
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
  situacao: string;
  porte: string | null;
  /** Descrição da natureza jurídica — ver classificarTipoPessoa em @radar/shared. */
  natureza_juridica: string | null;
  email: string | null;
  telefone: string | null;
  endereco: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface SearchResult {
  items: CnpjMapItem[];
  count: number;
  countExact: boolean;
}
