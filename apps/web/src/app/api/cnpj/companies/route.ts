/**
 * GET /api/cnpj/companies
 *
 * Busca paginada de empresas com filtros de negócio + geolocalização.
 *
 * Parâmetros de query:
 *   uf, lat, lng, raio_km, municipio_codigo, municipio_nome, situacao, cnae_prefixo, porte,
 *   ufs, municipio_nomes, cnae_prefixos, portes, naturezas_juridicas (CSV — ex: "SP,RJ,MG"
 *     — precedência sobre os singulares acima, ver CnpjSearchFiltersSchema),
 *   matriz_filial, natureza_juridica (código da Receita, ex: "2135"),
 *   faz_parte_de_grupo, qtd_socios_min (QSA),
 *   opcao_simples, opcao_mei, data_abertura_de, data_abertura_ate, texto_livre,
 *   cursor (BigInt serializado como string), limit (default 100, máx 8.000),
 *   sort ("id" | "distance", default "id" — "distance" exige lat/lng e ignora
 *        cursor, ver searchCnpjs)
 *
 * Resposta:
 *   {
 *     items:        CnpjListItem[], -- id como string (BigInt não é JSON-serializable)
 *     nextCursor:   string | null,
 *     count:        number,         -- ver nota abaixo
 *     countExact:   boolean
 *   }
 *
 * Decisão de COUNT:
 *   countByFiltersCapped com cap=10.000 via findMany({ take: cap+1, select: { id, uf } }).
 *   Mantém a lógica buildWhere do Prisma (incluindo partition pruning por uf) sem
 *   duplicar cláusulas WHERE em SQL raw. Se há mais de 10.000 resultados, retorna
 *   { count: 10000, countExact: false }.
 *   Um COUNT(*) exato sem cap em tabela particionada com 66M registros e sem filtro de
 *   uf pode levar segundos — inaceitável para uma resposta de UI síncrona.
 */

import type { NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { auth } from "@/auth";
import {
  searchCnpjs,
  countCnpjs,
  resolveSearchContext,
  enqueueGeocodeEnrichment,
} from "@/server/services/cnpj-search.service";

export const dynamic = "force-dynamic";

// Antes 2.000 — o Mapa agora clusteriza (@googlemaps/markerclusterer), então
// aguenta bem mais marcadores simultâneos sem travar o navegador.
const MAX_LIMIT    = 8_000;
const DEFAULT_LIMIT = 100;
const COUNT_CAP     = 10_000;

// Query string não tem array nativo — múltiplos valores vêm como CSV
// ("SP,RJ,MG"). Object.fromEntries(searchParams) abaixo já perderia valores
// repetidos (uf=SP&uf=RJ) mantendo só o último, então CSV é a única forma
// seguro de mandar múltiplos valores num único parâmetro com esse parsing.
const csvArray = z
  .string()
  .trim()
  .transform((v) => v.split(",").map((s) => s.trim()).filter(Boolean))
  .refine((arr) => arr.length > 0, "lista vazia")
  .optional();

const QuerySchema = z.object({
  uf:               z.string().trim().length(2).toUpperCase().optional(),
  // Uppercase/validação de tamanho por item ficam a cargo de
  // CnpjSearchFiltersSchema (reaplicado dentro de searchCnpjs/countCnpjs) —
  // aqui só split de CSV.
  ufs:              csvArray,
  lat:              z.coerce.number().min(-90).max(90).optional(),
  lng:              z.coerce.number().min(-180).max(180).optional(),
  raio_km:          z.coerce.number().positive().max(500).optional(),
  municipio_codigo: z.coerce.number().int().positive().optional(),
  municipio_nome:   z.string().trim().min(1).max(100).optional(),
  municipio_nomes:  csvArray,
  situacao:         z.string().trim().optional(),
  cnae_prefixo:     z.string().trim().min(1).max(7).optional(),
  cnae_prefixos:    csvArray,
  porte:            z.string().trim().optional(),
  portes:           csvArray,
  // Seções da CNAE 2.0 (letras A–U) — traduzidas em divisões pelo service.
  cnae_secoes:      csvArray,
  matriz_filial:    z.enum(["MATRIZ", "FILIAL"]).optional(),
  // Códigos da Receita (ex: "2135"). Validação do formato fica em
  // CnpjSearchFiltersSchema, reaplicado dentro de searchCnpjs/countCnpjs.
  natureza_juridica:   z.string().trim().optional(),
  naturezas_juridicas: csvArray,
  opcao_simples:    z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  opcao_mei: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  // QSA — resolvidos contra company_socio_agg / analytics.grupo_economico.
  faz_parte_de_grupo: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  qtd_socios_min: z.coerce.number().int().min(1).max(999).optional(),
  data_abertura_de:  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Formato esperado: YYYY-MM-DD")
    .optional(),
  data_abertura_ate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Formato esperado: YYYY-MM-DD")
    .optional(),
  // Busca livre por razão social, nome fantasia ou CNPJ — roda no servidor,
  // sobre o resultado inteiro (não só a página atual). Ver texto_livre em
  // CnpjSearchFiltersSchema.
  texto_livre: z.string().trim().min(1).max(200).optional(),
  cursor: z
    .string()
    .regex(/^\d+$/, "cursor deve ser um número positivo")
    .transform((v) => BigInt(v))
    .optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_LIMIT)
    .default(DEFAULT_LIMIT),
  // "distance" só é honrado com lat/lng presentes e sem cursor — ver
  // searchCnpjs. O Mapa manda isso explicitamente; a tela de CNPJs e a
  // exportação nunca mandam, preservando id ASC + paginação por cursor.
  sort: z.enum(["id", "distance"]).default("id"),
});

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = QuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams)
  );
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_params", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { cursor, limit, sort, ...filterParams } = parsed.data;

  // searchCnpjs e countCnpjs recebem os mesmos filtros brutos (antes da resolução
  // de municípios), pois o service valida com Zod internamente.
  // ZodError pode vir do service quando o cross-field refine do CnpjSearchFiltersSchema
  // rejeita combinações inválidas (ex: lat+lng sem raio_km) que passaram pelo
  // QuerySchema acima mas não pelo schema compartilhado.
  try {
    // Resolve a busca por raio (se houver) uma única vez e reaproveita o
    // resultado em searchCnpjs e countCnpjs — antes cada uma resolvia por
    // conta própria, rodando a query geoespacial duas vezes por requisição.
    const context = await resolveSearchContext(filterParams);

    const [page, countResult] = await Promise.all([
      searchCnpjs(filterParams, { cursor, limit }, context, sort),
      countCnpjs(filterParams, COUNT_CAP, context),
    ]);

    // Geocodificação sob demanda: CNPJs retornados sem coordenada entram na
    // fila geocode-enrichment (fire-and-forget — não atrasa esta resposta).
    enqueueGeocodeEnrichment(
      page.items
        .filter((item) => item.latitude === null)
        .map((item) => ({ id: item.id.toString(), uf: item.uf }))
    );

    // BigInt não é JSON-serializable — converte para string antes de enviar.
    return Response.json({
      items: page.items.map((item) => ({
        ...item,
        id: item.id.toString(),
      })),
      nextCursor: page.nextCursor !== null ? page.nextCursor.toString() : null,
      count: countResult.count,
      countExact: countResult.exact,
    });
  } catch (err) {
    if (err instanceof ZodError) {
      return Response.json(
        { error: "filtros_inválidos", details: err.flatten() },
        { status: 400 }
      );
    }
    throw err;
  }
}
