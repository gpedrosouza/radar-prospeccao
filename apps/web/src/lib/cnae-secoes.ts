/**
 * Seções da CNAE 2.0 (A–U) para o seletor de Setor no Mapa e na tela de CNPJs.
 *
 * Rótulos encurtados de propósito: a denominação oficial não cabe num chip
 * ("COMÉRCIO; REPARAÇÃO DE VEÍCULOS AUTOMOTORES E MOTOCICLETAS"). O nome
 * completo continua vindo do banco na coluna Setor da listagem e do CSV.
 *
 * As 21 seções são fixas na CNAE 2.0 — por isso constante, não fetch. O que
 * varia (quais divisões compõem cada seção) é resolvido no servidor a partir
 * de lookup_cnae_estrutura; ver GET /api/cnae/secoes e divisoesDasSecoes.
 */
export const CNAE_SECAO_OPTIONS = [
  { value: "A", label: "Agropecuária" },
  { value: "B", label: "Indústria extrativa" },
  { value: "C", label: "Indústria de transformação" },
  { value: "D", label: "Eletricidade e gás" },
  { value: "E", label: "Água, esgoto e resíduos" },
  { value: "F", label: "Construção" },
  { value: "G", label: "Comércio e reparação" },
  { value: "H", label: "Transporte e armazenagem" },
  { value: "I", label: "Alojamento e alimentação" },
  { value: "J", label: "Informação e comunicação" },
  { value: "K", label: "Financeiro e seguros" },
  { value: "L", label: "Atividades imobiliárias" },
  { value: "M", label: "Profissionais e técnicas" },
  { value: "N", label: "Administrativas e apoio" },
  { value: "O", label: "Administração pública" },
  { value: "P", label: "Educação" },
  { value: "Q", label: "Saúde e serviços sociais" },
  { value: "R", label: "Artes, cultura e esporte" },
  { value: "S", label: "Outros serviços" },
  { value: "T", label: "Serviços domésticos" },
  { value: "U", label: "Organismos internacionais" },
] as const;

const LABEL_POR_SECAO = new Map<string, string>(
  CNAE_SECAO_OPTIONS.map((o) => [o.value, o.label])
);

/** Rótulo curto para chips; cai na própria letra se a seção for desconhecida. */
export function cnaeSecaoLabel(secao: string): string {
  return LABEL_POR_SECAO.get(secao) ?? secao;
}
