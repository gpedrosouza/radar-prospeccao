/**
 * Categoria comercial de um CNAE — B2B × B2C × Instituição.
 *
 * Compartilhado entre o CNAE principal (`company_cnpj.cnae_principal`) e os
 * secundários (`company_cnae_secundario`), e entre apps/web e apps/workers.
 * Função pura, sem I/O (CLAUDE.md regra 1): a regra existe UMA vez, aqui.
 * Quem precisar dela em SQL deve derivar da tabela exportada abaixo, nunca
 * reescrever o critério.
 *
 * ── Por que a resposta é por DIVISÃO, com exceções por classe/subclasse ──────
 * A CNAE 2.0 já separa no nível de divisão exatamente a fronteira que interessa
 * ao banker: 46 é comércio ATACADISTA (vende para empresa) e 47 é VAREJISTA
 * (vende para consumidor final). O mesmo vale para indústria (10–33, insumo
 * para outra empresa) contra alojamento/alimentação (55–56, consumo final).
 * Descer ao nível de subclasse em toda a tabela seria 1.3k decisões para ganhar
 * pouco; descer só onde a divisão realmente mistura os dois mundos (comércio de
 * veículos, transporte de carga × de passageiros) resolve os casos que doem.
 *
 * ── "Revisar" é resposta, não falha ─────────────────────────────────────────
 * Divisões cujo cliente típico depende do contrato e não do código — energia e
 * água (35–36), mídia (58–60), financeiro e seguros (64–66) — devolvem
 * "Revisar" de propósito. Rotulá-las no chute poluiria o sinal de atividade
 * mista, que é justamente o que estas categorias existem para produzir: um
 * CNPJ vira "misto" quando principal e secundário caem em B2B e B2C
 * DIFERENTES — e "Revisar"/"Instituição" nunca participam dessa comparação.
 *
 * A tabela é o botão de ajuste desta feature. Mudar a leitura de negócio =
 * mudar uma linha de DIVISAO_CATEGORIA / as exceções, e os dois lados
 * (principal e secundário, web e worker) acompanham sozinhos.
 */

export type CategoriaCnae = "B2B" | "B2C" | "Instituição" | "Revisar";

/**
 * Divisão (2 primeiros dígitos da CNAE 2.0) → categoria.
 *
 * Ausência da divisão nesta tabela significa "Revisar" — inclusive as divisões
 * deliberadamente ambíguas (35–36 utilidades, 58–60 mídia, 64–66 financeiro),
 * que não estão listadas justamente por isso.
 */
export const DIVISAO_CATEGORIA: Readonly<Record<string, CategoriaCnae>> = {
  // A — Agricultura, pecuária, produção florestal, pesca e aquicultura.
  // Escoa a produção para indústria e atacado; a venda direta ao consumidor é
  // a exceção, não a regra.
  "01": "B2B", "02": "B2B", "03": "B2B",

  // B — Indústrias extrativas.
  "05": "B2B", "06": "B2B", "07": "B2B", "08": "B2B", "09": "B2B",

  // C — Indústrias de transformação. É o lado B2B do caso clássico de
  // atividade mista: fábrica com loja/varejo como secundário.
  "10": "B2B", "11": "B2B", "12": "B2B", "13": "B2B", "14": "B2B",
  "15": "B2B", "16": "B2B", "17": "B2B", "18": "B2B", "19": "B2B",
  "20": "B2B", "21": "B2B", "22": "B2B", "23": "B2B", "24": "B2B",
  "25": "B2B", "26": "B2B", "27": "B2B", "28": "B2B", "29": "B2B",
  "30": "B2B", "31": "B2B", "32": "B2B", "33": "B2B",

  // E — Resíduos e descontaminação: contrato com empresa ou com o município.
  // (37–39; a divisão 36, captação e distribuição de água, fica em "Revisar".)
  "37": "B2B", "38": "B2B", "39": "B2B",

  // F — Construção: obra contratada, quase sempre por PJ ou poder público.
  "41": "B2B", "42": "B2B", "43": "B2B",

  // G — Comércio. A fronteira nomeada pela própria CNAE:
  //   45 veículos (balcão; as subclasses de atacado estão nas exceções)
  //   46 ATACADO   → B2B
  //   47 VAREJO    → B2C
  "45": "B2C", "46": "B2B", "47": "B2C",

  // H — Transporte e armazenagem: carga e logística. As classes de transporte
  // DE PASSAGEIROS estão nas exceções abaixo.
  "49": "B2B", "50": "B2B", "51": "B2B", "52": "B2B", "53": "B2B",

  // I — Alojamento e alimentação.
  "55": "B2C", "56": "B2C",

  // J — Informação e comunicação. 58–60 (edição, audiovisual, rádio e TV)
  // ficam em "Revisar": vivem de anunciante PJ e de audiência PF ao mesmo
  // tempo, e o código não distingue.
  "61": "B2C", // telecomunicações — base majoritariamente de assinante PF
  "62": "B2B", // TI: desenvolvimento, consultoria, suporte
  "63": "B2B", // portais, tratamento de dados, hospedagem

  // L — Atividades imobiliárias: locação e intermediação para quem mora.
  "68": "B2C",

  // M — Profissionais, científicas e técnicas. 75 (veterinária) é B2C e está
  // logo abaixo, fora do bloco.
  "69": "B2B", "70": "B2B", "71": "B2B", "72": "B2B", "73": "B2B",
  "74": "B2B",
  "75": "B2C",

  // N — Administrativas e serviços complementares. 79 (agências de viagem) é
  // B2C e está fora do bloco.
  "77": "B2B", "78": "B2B",
  "79": "B2C",
  "80": "B2B", "81": "B2B", "82": "B2B",

  // O — Administração pública, defesa e seguridade social.
  "84": "Instituição",

  // P/Q — Educação e saúde: o pagante final é a família ou o paciente.
  "85": "B2C",
  "86": "B2C", "87": "B2C", "88": "B2C",

  // R — Artes, cultura, esporte e recreação.
  "90": "B2C", "91": "B2C", "92": "B2C", "93": "B2C",

  // S — Outras atividades de serviços.
  "94": "Instituição", // organizações associativas (sindicatos, conselhos)
  "95": "B2C",         // reparação de bens pessoais e domésticos
  "96": "B2C",         // serviços pessoais

  // T/U — Serviços domésticos e organismos internacionais.
  "97": "Instituição",
  "99": "Instituição",
};

/**
 * Exceções no nível da CLASSE (5 dígitos) — divisões que misturam os dois
 * mundos e onde a classe já resolve.
 *
 * Transporte de passageiros dentro da divisão de carga: quem leva pessoa vende
 * para pessoa, ainda que a divisão inteira seja logística B2B.
 */
export const CLASSE_CATEGORIA: Readonly<Record<string, CategoriaCnae>> = {
  "49213": "B2C", // rodoviário coletivo de passageiros, municipal/metropolitano
  "49221": "B2C", // rodoviário coletivo de passageiros, inter/estadual
  "49230": "B2C", // táxi
  "49248": "B2C", // transporte escolar
  "49299": "B2C", // fretamento e outros transportes rodoviários de passageiros
  "49124": "B2C", // metroferroviário de passageiros (4930-2 é CARGA, fica B2B)
  "50122": "B2C", // marítimo de longo curso — passageiros
  "50220": "B2C", // marítimo de cabotagem — passageiros
  "50912": "B2C", // transporte por travessia (balsa)
  "51111": "B2C", // aéreo de passageiros — regular
  "51129": "B2C", // aéreo de passageiros — não regular
};

/**
 * Exceções no nível da SUBCLASSE (7 dígitos) — divisão 45, comércio de
 * veículos, onde atacado e varejo dividem a MESMA classe e só o último par de
 * dígitos separa os dois. Sem estas linhas, uma distribuidora de autopeças
 * (4530-7/01, atacado puro) seria lida como loja de balcão.
 */
export const SUBCLASSE_CATEGORIA: Readonly<Record<string, CategoriaCnae>> = {
  "4511103": "B2B", // atacado de automóveis, camionetas e utilitários
  "4511104": "B2B", // atacado de caminhões
  "4511105": "B2B", // atacado de reboques e semirreboques
  "4511106": "B2B", // atacado de ônibus e microônibus
  "4530701": "B2B", // atacado de peças e acessórios novos
  "4530702": "B2B", // atacado de pneumáticos e câmaras de ar
  "4530706": "B2B", // representantes comerciais de peças e acessórios
  "4541201": "B2B", // atacado de motocicletas e motonetas
  "4541202": "B2B", // atacado de peças e acessórios para motocicletas
};

/** Códigos que significam "sem CNAE", não uma atividade. */
const CNAE_AUSENTE = new Set(["0000000", "9999999"]);

/**
 * Normaliza para 7 dígitos.
 *
 * Aceita máscara ("46.35-4/02") e código que perdeu zeros à esquerda em
 * trânsito por JSON/number ("810099" → "0810099"), pelo mesmo motivo de
 * classeFromCnae em @radar/db: sem o padStart, "0810099" viraria a divisão
 * "81" em vez de "08".
 */
function normalizarCnae(cnae: string): string {
  return cnae.replace(/\D/g, "").padStart(7, "0").slice(0, 7);
}

/**
 * Classifica um CNAE (subclasse de 7 dígitos) na sua categoria comercial.
 *
 * Precedência: subclasse → classe → divisão → "Revisar". O mais específico
 * vence, que é a mesma regra usada em todo o resto do código (uf vs ufs,
 * cnae_prefixo vs cnae_secoes).
 */
export function classificarCategoriaPorCnae(cnae: string | null): CategoriaCnae {
  if (cnae === null) return "Revisar";

  const codigo = normalizarCnae(cnae);
  if (codigo === "" || CNAE_AUSENTE.has(codigo)) return "Revisar";

  return (
    SUBCLASSE_CATEGORIA[codigo] ??
    CLASSE_CATEGORIA[codigo.slice(0, 5)] ??
    DIVISAO_CATEGORIA[codigo.slice(0, 2)] ??
    "Revisar"
  );
}

/**
 * O CNPJ exerce atividades dos dois lados do balcão?
 *
 * Verdadeiro só quando principal e algum secundário caem em B2B e B2C
 * DIFERENTES — atacadista com varejo, indústria com loja própria. "Revisar" e
 * "Instituição" nunca disparam a flag: seriam ruído, não informação (metade
 * dos CNPJs de mídia ou financeiro apareceriam como mistos sem que ninguém
 * tenha afirmado nada sobre eles).
 */
export function temAtividadeMista(
  cnaePrincipal: string | null,
  cnaesSecundarios: readonly string[]
): boolean {
  const principal = classificarCategoriaPorCnae(cnaePrincipal);
  if (principal !== "B2B" && principal !== "B2C") return false;

  const oposto: CategoriaCnae = principal === "B2B" ? "B2C" : "B2B";
  return cnaesSecundarios.some(
    (c) => classificarCategoriaPorCnae(c) === oposto
  );
}
