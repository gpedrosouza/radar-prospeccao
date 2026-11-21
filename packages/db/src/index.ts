// Execute `npm run db:generate --workspace=packages/db` para gerar o Prisma Client
// Execute `npm run db:push --workspace=packages/db` para sincronizar o schema

export { PrismaClient } from "@prisma/client";
export type { Prisma } from "@prisma/client";

export {
  classeFromCnae,
  getCnaeDescricaoMap,
  getCnaeEstruturaMap,
  getCnaeSecoes,
  divisoesDasSecoes,
  resolveCnaePrefixos,
  resetCnaeLookupCache,
} from "./repositories/cnae-lookup";
export type { CnaeEstrutura, CnaeSecao } from "./repositories/cnae-lookup";

export {
  getCnaeSecundarioFor,
  getCnaeSecundarioDoCnpj,
} from "./repositories/cnae-secundario-lookup";

export { createCnpjRepository } from "./repositories/cnpj.repository";
export type {
  CnpjListItem,
  CnpjEmailItem,
  FindByFiltersInput,
  PageResult,
  CnpjRepository,
} from "./repositories/cnpj.repository";

export {
  basicoFromCnpj,
  getSocioAggFor,
  getGrupoEconomicoFor,
  getQsaEnrichmentFor,
  getSociosDoCnpj,
} from "./repositories/socio-lookup";
export type {
  SocioAgg,
  GrupoEconomico,
  QsaEnrichment,
  SocioDaFicha,
} from "./repositories/socio-lookup";
