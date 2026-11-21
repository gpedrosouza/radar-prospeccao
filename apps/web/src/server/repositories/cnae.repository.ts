/**
 * Thin wrapper — a lógica de lookup vive em packages/db/src/repositories/cnae-lookup.ts
 * para que apps/workers possa importar sem cruzar apps/ (CLAUDE.md regra 1).
 *
 * Mesmo padrão de cnpj.repository.ts: liga as funções ao singleton Prisma desta
 * aplicação, para que os serviços não toquem o Prisma diretamente.
 */

import {
  getCnaeDescricaoMap,
  getCnaeEstruturaMap,
  getCnaeSecoes,
  divisoesDasSecoes,
  resolveCnaePrefixos,
  getCnaeSecundarioFor,
  getCnaeSecundarioDoCnpj,
} from "@radar/db";
import { prisma } from "@/lib/prisma";

export type { CnaeEstrutura, CnaeSecao } from "@radar/db";
export { classeFromCnae } from "@radar/db";

export const descricaoMap = () => getCnaeDescricaoMap(prisma);
/**
 * CNAEs secundários por lote — NÃO é um Map cacheado como os dois acima.
 * company_cnae_secundario tem dezenas de milhões de linhas; a leitura é sempre
 * dos CNPJs da página atual. Ver cnae-secundario-lookup.ts.
 */
export const secundariosPara = (cnpjs: string[]) =>
  getCnaeSecundarioFor(prisma, cnpjs);
export const secundariosDoCnpj = (cnpj: string) =>
  getCnaeSecundarioDoCnpj(prisma, cnpj);
export const estruturaMap = () => getCnaeEstruturaMap(prisma);
export const secoes = () => getCnaeSecoes(prisma);
export const divisoesDe = (secoesSelecionadas: string[]) =>
  divisoesDasSecoes(prisma, secoesSelecionadas);
export const resolvePrefixos = (filtros: {
  cnae_prefixo?: string;
  cnae_prefixos?: string[];
  cnae_secoes?: string[];
}) => resolveCnaePrefixos(prisma, filtros);
