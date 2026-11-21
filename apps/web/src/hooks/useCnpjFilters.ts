"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useMemo, useCallback } from "react";
import { cnpjsParamsToFilters, cnpjsFiltersToUrlParams } from "@/app/(app)/cnpjs/_components/utils";
import type { CnpjsFilterState } from "@/app/(app)/cnpjs/_components/types";

// ── Pure helper (exported for testing) ───────────────────────────────────────

/**
 * Returns a new URLSearchParams with the given keys removed.
 * All other keys remain unchanged.
 */
export function computeRemovedParams(
  currentParams: URLSearchParams,
  keysToRemove: string[]
): URLSearchParams {
  const next = new URLSearchParams(currentParams.toString());
  for (const key of keysToRemove) next.delete(key);
  return next;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useCnpjFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  // Parse URL params → filter state. Sanitização por campo já acontece em
  // paramsToFilters/cnpjsParamsToFilters — não há validação Zod adicional
  // aqui (nunca teve efeito real: o bloco antigo retornava `parsed` nos dois
  // branches do safeParse, então foi removido).
  const filters = useMemo<CnpjsFilterState>(() => {
    const raw: Record<string, string> = {};
    searchParams.forEach((v, k) => { raw[k] = v; });
    return cnpjsParamsToFilters(raw);
  }, [searchParams]);

  // Remove specific URL params (used by chip removal buttons)
  const removeFilter = useCallback((urlKeys: string[]) => {
    const next = computeRemovedParams(searchParams as unknown as URLSearchParams, urlKeys);
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [router, searchParams, pathname]);

  // Clear all filter params from URL
  const clearFilters = useCallback(() => {
    router.push(pathname, { scroll: false });
  }, [router, pathname]);

  // Update a single filter field in URL (rebuilds params from current + updated value)
  const updateFilter = useCallback(<K extends keyof CnpjsFilterState>(
    key: K,
    value: CnpjsFilterState[K]
  ) => {
    const raw: Record<string, string> = {};
    searchParams.forEach((v, k) => { raw[k] = v; });
    const updated: CnpjsFilterState = { ...cnpjsParamsToFilters(raw), [key]: value };
    const next = cnpjsFiltersToUrlParams(updated);
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [router, searchParams, pathname]);

  return { filters, removeFilter, clearFilters, updateFilter };
}
