/**
 * Thin wrapper — a lógica de lookup vive em packages/db/src/repositories/socio-lookup.ts
 * para que apps/workers possa importar sem cruzar apps/ (CLAUDE.md regra 1).
 *
 * Mesmo padrão de cnae.repository.ts: liga as funções ao singleton Prisma desta
 * aplicação, para que os serviços não toquem o Prisma diretamente.
 */

import {
  getSocioAggFor,
  getGrupoEconomicoFor,
  getQsaEnrichmentFor,
  getSociosDoCnpj,
} from "@radar/db";
import { prisma } from "@/lib/prisma";

export type { SocioAgg, GrupoEconomico, QsaEnrichment, SocioDaFicha } from "@radar/db";
export { basicoFromCnpj } from "@radar/db";

export const socioAggFor = (basicos: string[]) => getSocioAggFor(prisma, basicos);
export const grupoEconomicoFor = (basicos: string[]) =>
  getGrupoEconomicoFor(prisma, basicos);
export const qsaEnrichmentFor = (cnpjs: string[]) => getQsaEnrichmentFor(prisma, cnpjs);
export const sociosDoCnpj = (cnpj: string) => getSociosDoCnpj(prisma, cnpj);
