import { z } from "zod";

export { z };

export {
  classificarTipoPessoa,
  NATUREZA_EMPRESARIO_INDIVIDUAL,
  NATUREZAS_EMPRESA_UNIPESSOAL,
  type TipoPessoa,
} from "./classificacao";
export { NATUREZA_JURIDICA_DICIONARIO } from "./natureza-juridica-dicionario";

export {
  classificarCategoriaPorCnae,
  temAtividadeMista,
  DIVISAO_CATEGORIA,
  CLASSE_CATEGORIA,
  SUBCLASSE_CATEGORIA,
  type CategoriaCnae,
} from "./categoria-cnae";

// ── Primitivos ────────────────────────────────────────────────────────────────

export const CnpjSchema = z.string().length(14).regex(/^\d{14}$/, "CNPJ deve conter 14 dígitos numéricos");
export type Cnpj = z.infer<typeof CnpjSchema>;

export const CepSchema = z.string().length(8).regex(/^\d{8}$/, "CEP deve conter 8 dígitos numéricos");
export type Cep = z.infer<typeof CepSchema>;

// ── Filtros de busca de CNPJ ──────────────────────────────────────────────────
// Reutilizado por:
//   - apps/web: rota de API de busca
//   - apps/workers: worker de exportação (valida os filtros guardados em CnpjExportJob.filtros)

export const CnpjSearchFiltersSchema = z
  .object({
    // Partition pruning — incluir sempre que possível para evitar full scan das 27 partições
    uf: z
      .string()
      .trim()
      .length(2)
      .toUpperCase()
      .optional(),
    // Múltiplas UFs (OR) — quando presente, tem precedência sobre uf e sobre
    // qualquer UF inferida do raio. Vira uma cláusula IN, ainda com partition
    // pruning (restringe a N partições em vez de 27).
    ufs: z.array(z.string().trim().length(2).toUpperCase()).min(1).optional(),

    // Parâmetros de raio geográfico (lat + lng + raio_km devem vir juntos ou nenhum)
    lat:     z.number().min(-90).max(90).optional(),
    lng:     z.number().min(-180).max(180).optional(),
    raio_km: z.number().positive().max(500).optional(),

    // Cidade de referência: fallback quando raio não retorna resultados,
    // ou filtro direto quando lat/lng/raio_km não são fornecidos.
    // Código IBGE do município (cities.codigo_ibge).
    municipio_codigo: z.number().int().positive().optional(),

    // Busca por nome de município (contains, case-insensitive). Independente de
    // municipio_codigo — não depende da tabela cities (ainda não populada),
    // usa o texto denormalizado em company_cnpj.municipio_nome.
    municipio_nome: z.string().trim().min(1).max(100).optional(),
    // Múltiplos nomes de município (OR de contains) — precedência sobre municipio_nome.
    municipio_nomes: z.array(z.string().trim().min(1).max(100)).min(1).optional(),

    // Filtros de negócio
    situacao:      z.string().trim().optional(),
    cnae_prefixo:  z.string().trim().min(1).max(7).optional(),
    // Múltiplos prefixos CNAE (OR de "prefixo%") — precedência sobre cnae_prefixo.
    cnae_prefixos: z.array(z.string().trim().min(1).max(7)).min(1).optional(),
    porte:         z.string().trim().optional(),
    // Múltiplos portes (IN) — precedência sobre porte.
    portes:        z.array(z.string().trim()).min(1).optional(),

    // Setor econômico = seção da CNAE 2.0 (letra A–U). Não é uma coluna de
    // company_cnpj: o service traduz cada seção nas divisões que a compõem
    // (2 dígitos) e passa como cnae_prefixos, caindo no índice de prefixo que
    // já existe. Ver divisoesDasSecoes em @radar/db.
    cnae_secoes: z
      .array(z.string().trim().length(1).toUpperCase().regex(/^[A-U]$/, "Seção CNAE inválida"))
      .min(1)
      .optional(),
    matriz_filial: z.enum(["MATRIZ", "FILIAL"]).optional(),
    opcao_simples: z.boolean().optional(),
    opcao_mei:     z.boolean().optional(),

    // Natureza jurídica por CÓDIGO da Receita (ex: "2135" = Empresário
    // Individual). O repositório traduz para a descrição antes de filtrar,
    // porque company_cnpj.natureza_juridica guarda o texto do dicionário e não
    // o código — ver classificacao.ts e resolveNaturezasJuridicas em @radar/db.
    natureza_juridica:   z.string().trim().regex(/^\d{3}-?\d$/, "Código de natureza jurídica inválido").optional(),
    // Múltiplos códigos (IN) — precedência sobre natureza_juridica.
    naturezas_juridicas: z
      .array(z.string().trim().regex(/^\d{3}-?\d$/, "Código de natureza jurídica inválido"))
      .min(1)
      .optional(),

    // Busca livre por razão social, nome fantasia ou CNPJ (contains,
    // case-insensitive) — aplicada no servidor, sobre TODO o resultado já
    // filtrado por uf/município/raio/etc, não só a página atual carregada
    // no cliente (era um filtro só-cliente antes, por isso só achava nomes
    // dentro dos 50 itens da página em vez dos milhares do filtro completo).
    texto_livre: z.string().trim().min(1).max(200).optional(),

    // ── QSA (Quadro de Sócios) ────────────────────────────────────────────
    // Resolvidos contra company_socio_agg / analytics.grupo_economico, unidas
    // a company_cnpj por cnpj_basico. Não removem o filtro geográfico
    // obrigatório abaixo — o partition pruning por uf continua valendo.

    /** true = só CNPJs que dividem sócio com outro; false = só os isolados. */
    faz_parte_de_grupo: z.boolean().optional(),
    /** Mínimo de sócios no quadro. CNPJ sem QSA nunca satisfaz. */
    qtd_socios_min: z.number().int().min(1).max(999).optional(),

    // Intervalo de data de abertura (ISO 8601: "YYYY-MM-DD")
    data_abertura_de:  z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Formato esperado: YYYY-MM-DD")
      .optional(),
    data_abertura_ate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Formato esperado: YYYY-MM-DD")
      .optional(),
  })
  .refine(
    (d) => {
      const geoFields = [d.lat, d.lng, d.raio_km].filter((v) => v !== undefined);
      return geoFields.length === 0 || geoFields.length === 3;
    },
    { message: "lat, lng e raio_km devem ser informados juntos ou nenhum deles" }
  )
  .refine(
    (d) =>
      d.data_abertura_de === undefined ||
      d.data_abertura_ate === undefined ||
      d.data_abertura_de <= d.data_abertura_ate,
    { message: "data_abertura_de deve ser anterior ou igual a data_abertura_ate" }
  )
  .refine(
    // Pelo menos um filtro que restrinja o escopo geográfico — sem isso a
    // query varre as 27 partições de company_cnpj (66M linhas) inteiras.
    // uf sozinho já é suficiente (restringe a uma partição via partition
    // pruning); raio exige lat+lng+raio_km, já garantido pelo refine acima.
    (d) =>
      d.uf !== undefined ||
      (d.ufs !== undefined && d.ufs.length > 0) ||
      d.municipio_codigo !== undefined ||
      d.municipio_nome !== undefined ||
      (d.municipio_nomes !== undefined && d.municipio_nomes.length > 0) ||
      (d.lat !== undefined && d.lng !== undefined && d.raio_km !== undefined),
    {
      message:
        "Informe ao menos um filtro de escopo geográfico (uf, município ou raio) — busca sem nenhum deles varreria a base inteira",
    }
  );

export type CnpjSearchFilters = z.infer<typeof CnpjSearchFiltersSchema>;

// ── Fila de exportação BullMQ ─────────────────────────────────────────────────

/** Nomes das filas BullMQ compartilhados entre producers (apps/web) e consumers (apps/workers). */
export const EXPORT_QUEUE_NAME             = "cnpj-export"        as const;
export const EMAIL_CAMPAIGN_QUEUE_NAME     = "email-campaign"     as const;
export const GEOCODE_ENRICHMENT_QUEUE_NAME = "geocode-enrichment" as const;
export const COUNT_QUEUE_NAME              = "cnpj-count"         as const;

/**
 * Payload serializado no BullMQ para cada job de exportação.
 * Contém todos os dados que o worker precisa — sem depender do banco para
 * re-buscar os filtros (evita race condition se o registro for atualizado).
 */
/** Payload do job de e-mail na fila BullMQ. O worker busca todos os dados pelo campaignId. */
export interface EmailCampaignJobPayload {
  campaignId: string;
}

export interface ExportJobPayload {
  /** UUID do registro CnpjExportJob — chave de correlação entre BullMQ e banco. */
  exportJobId: string;
  usuarioId: string;
  filtros: CnpjSearchFilters;
}

/**
 * Payload do job de enriquecimento (geocodificação sob demanda). Carrega só
 * id+uf — nunca o registro completo — o worker rebusca endereco/municipio_nome
 * no banco antes de geocodificar (evita payload grande e race condition se o
 * registro mudar entre o enfileiramento e o processamento).
 */
export interface GeocodeEnrichmentJobPayload {
  /** id de CompanyCnpj serializado como string (BigInt não é JSON-serializable). */
  items: Array<{ id: string; uf: string }>;
}

/**
 * Payload do job de contagem exata (fila cnpj-count) — usado quando o cap
 * síncrono de countByFiltersCapped não é suficiente (ex: usuário pede o
 * total exato de uma busca ampla). Sem tabela própria no banco: o job é
 * efêmero, consultado só pelo próprio BullMQ (Job.getState()/returnvalue)
 * via SSE, sem histórico — diferente de CnpjExportJob, que precisa
 * sobreviver a reload de página e aparecer na tela de Exportações.
 */
export interface CountJobPayload {
  filtros: CnpjSearchFilters;
}

export interface CountJobResult {
  count: number;
}

// Token de descadastro: movido para @radar/shared/server (usa node:crypto,
// não pode ser importado em contextos browser/edge).
