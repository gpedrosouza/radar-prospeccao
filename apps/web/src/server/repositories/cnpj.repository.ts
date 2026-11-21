/**
 * Thin wrapper — a lógica de query vive em packages/db/src/repositories/cnpj.repository.ts
 * para que apps/workers possa importar sem cruzar apps/ (CLAUDE.md regra 1).
 *
 * Re-exporta os tipos e liga o factory ao singleton Prisma desta aplicação.
 * Os serviços em apps/web importam daqui e não precisam mudar.
 */

import { createCnpjRepository } from "@radar/db";
import { prisma } from "@/lib/prisma";

export type { CnpjListItem, CnpjEmailItem, FindByFiltersInput, PageResult } from "@radar/db";

const _repo = createCnpjRepository(prisma);

export const findByFilters          = _repo.findByFilters.bind(_repo);
export const findByFiltersNearOrigin = _repo.findByFiltersNearOrigin.bind(_repo);
export const countByFilters         = _repo.countByFilters.bind(_repo);
export const countByFiltersCapped   = _repo.countByFiltersCapped.bind(_repo);
export const findByFiltersWithEmail = _repo.findByFiltersWithEmail.bind(_repo);
