/**
 * Classificação de CNPJ por natureza jurídica — empresário individual × empresa
 * × pessoa física × entidade sem fins lucrativos × poder público.
 *
 * Compartilhado entre apps/web (coluna Tipo na tela de CNPJs) e apps/workers
 * (coluna Tipo no CSV exportado). Função pura, sem I/O (CLAUDE.md regra 1).
 *
 * IMPORTANTE — formato do dado: o importador da Receita resolve o código da
 * natureza jurídica para o texto do dicionário antes de gravar (LEFT JOIN com
 * lookup_natureza_juridica em import-receita/loaders/estabelecimentos.ts), então
 * `company_cnpj.natureza_juridica` guarda a DESCRIÇÃO ("Empresário (Individual)"),
 * não o código ("2135"). Esta função aceita as duas formas: o código para quem
 * já o tem em mãos (filtros da API) e a descrição para o valor que vem direto
 * da linha do banco — a descrição é resolvida para código pelo dicionário
 * embutido em natureza-juridica-dicionario.ts.
 *
 * A classificação segue os GRUPOS da tabela CONCLA/IBGE, indicados pelo
 * primeiro dígito do código. Classificar só por código individual deixaria
 * ~1,4 milhão de registros (associações, condomínios, produtores rurais,
 * órgãos públicos) rotulados como empresa, que é justamente o erro que esta
 * função existe para evitar.
 */

import { NATUREZA_JURIDICA_DICIONARIO } from "./natureza-juridica-dicionario";

export type TipoPessoa =
  | "Empresário Individual"
  | "Empresa (unipessoal)"
  | "Empresa (sociedade)"
  | "MEI"
  | "Pessoa Física"
  | "Entidade sem fins lucrativos"
  | "Administração Pública"
  | "Organização Internacional"
  | "Indefinido";

/** Empresário (Individual) — o discriminador central de pessoa física × empresa. */
export const NATUREZA_EMPRESARIO_INDIVIDUAL = "2135";

/**
 * Naturezas do grupo empresarial com titular único:
 *   2305 EIRELI (de Natureza Empresária)
 *   2313 EIRELI (de Natureza Simples)
 *   2321 Sociedade Unipessoal de Advocacia
 * São pessoa jurídica de fato — separadas de 2135 por terem patrimônio apartado.
 * 4014 (Empresa Individual Imobiliária) NÃO entra aqui: apesar do nome, a
 * Receita a classifica no grupo 4 (Pessoas Físicas).
 */
export const NATUREZAS_EMPRESA_UNIPESSOAL = ["2305", "2313", "2321"] as const;

/** Códigos que significam ausência de informação (não são um grupo CONCLA). */
const CODIGOS_NAO_INFORMADA = new Set(["0000", "8885"]);

const UNIPESSOAL = new Set<string>(NATUREZAS_EMPRESA_UNIPESSOAL);

/** Grupo CONCLA (1º dígito do código) → bucket de negócio. */
const TIPO_POR_GRUPO: Record<string, TipoPessoa> = {
  "1": "Administração Pública",
  "2": "Empresa (sociedade)",
  "3": "Entidade sem fins lucrativos",
  "4": "Pessoa Física",
  "5": "Organização Internacional",
};

/** Aceita "2135" e "213-5" (formato com hífen usado em alguns layouts da Receita). */
const CODIGO_RE = /^(\d{3})-?(\d)$/;

const DIACRITICOS_RE = /[̀-ͯ]/g;

function normalizarDescricao(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(DIACRITICOS_RE, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

const CODIGO_POR_DESCRICAO = new Map<string, string>(
  NATUREZA_JURIDICA_DICIONARIO.map(([codigo, descricao]) => [
    normalizarDescricao(descricao),
    codigo,
  ])
);

function extrairCodigo(valor: string): string | null {
  const m = CODIGO_RE.exec(valor);
  return m === null ? null : `${m[1]}${m[2]}`;
}

function classificarPorCodigo(codigo: string): TipoPessoa {
  if (CODIGOS_NAO_INFORMADA.has(codigo)) return "Indefinido";
  if (codigo === NATUREZA_EMPRESARIO_INDIVIDUAL) return "Empresário Individual";
  if (UNIPESSOAL.has(codigo)) return "Empresa (unipessoal)";
  return TIPO_POR_GRUPO[codigo[0]] ?? "Indefinido";
}

/**
 * Descrição fora do dicionário embutido — só acontece se a Receita publicar
 * uma revisão da tabela CONCLA antes deste arquivo ser regenerado. Degrada
 * para o mínimo que dá pra afirmar pelo texto, em vez de "Indefinido".
 */
function classificarPorHeuristica(desc: string): TipoPessoa {
  if (desc.includes("NAO INFORMADA")) return "Indefinido";
  // O \b evita casar com "EMPRESA INDIVIDUAL DE RESPONSABILIDADE LIMITADA".
  if (/^EMPRESARIO\b/.test(desc)) return "Empresário Individual";
  if (
    desc.includes("INDIVIDUAL DE RESPONSABILIDADE LIMITADA") ||
    desc.includes("UNIPESSOAL")
  ) {
    return "Empresa (unipessoal)";
  }
  if (desc.includes("PESSOA FISICA")) return "Pessoa Física";
  return "Empresa (sociedade)";
}

/**
 * Classifica o CNPJ a partir da natureza jurídica (código ou descrição da
 * Receita) e da flag MEI.
 *
 * MEI é excluído já na carga (`opcao_mei != 'S'` no importador), então na
 * prática a função nunca devolve "MEI" — mas a flag é tratada por correção,
 * para o caso de a regra de carga mudar.
 */
export function classificarTipoPessoa(
  naturezaJuridica: string | null,
  opcaoMei: boolean
): TipoPessoa {
  if (opcaoMei) return "MEI";

  const valor = (naturezaJuridica ?? "").trim();
  if (valor === "") return "Indefinido";

  const codigoDireto = extrairCodigo(valor);
  if (codigoDireto !== null) return classificarPorCodigo(codigoDireto);

  const desc = normalizarDescricao(valor);
  const codigo = CODIGO_POR_DESCRICAO.get(desc);
  return codigo !== undefined
    ? classificarPorCodigo(codigo)
    : classificarPorHeuristica(desc);
}
