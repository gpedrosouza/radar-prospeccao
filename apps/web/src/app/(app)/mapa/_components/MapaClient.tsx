"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { FilterPanel } from "./FilterPanel";
import { MapView } from "./MapView";
import {
  paramsToFilters,
  filtersToUrlParams,
  filtersToApiParams,
  filtersToApiBody,
  hasActiveFilters,
} from "./utils";
import { DEFAULT_FILTERS, type MapaFilterState, type SearchResult, type CnpjMapItem } from "./types";
import { useCnpjFilters } from "@/hooks/useCnpjFilters";
import { useExactCount } from "@/hooks/useExactCount";

interface MapaClientProps {
  initialParams: Record<string, string>;
}

export function MapaClient({ initialParams }: MapaClientProps) {
  const router = useRouter();
  const { removeFilter } = useCnpjFilters();

  // Draft state: what's shown in the filter panel (not yet searched)
  const [filters, setFilters] = useState<MapaFilterState>(() =>
    paramsToFilters(initialParams)
  );

  // Search results
  const [items, setItems] = useState<CnpjMapItem[]>([]);
  const [count, setCount] = useState(0);
  const [countExact, setCountExact] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track if we've done an initial search (to avoid empty state flash)
  const didInitialSearch = useRef(false);

  const { exactCount, isCalculating: isCalculatingExact, requestExactCount, reset: resetExactCount } =
    useExactCount();

  function updateFilter(key: keyof MapaFilterState, value: unknown) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  const doSearch = useCallback(async (f: MapaFilterState) => {
    setIsLoading(true);
    setError(null);
    resetExactCount();
    try {
      const params = filtersToApiParams(f);
      const res = await fetch(`/api/cnpj/companies?${params}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as SearchResult & { items: CnpjMapItem[] };
      setItems(data.items);
      setCount(data.count);
      setCountExact(data.countExact);
      // Estimado bateu no teto (10.000) — busca o total exato em background,
      // sem travar a tela.
      if (!data.countExact) requestExactCount(filtersToApiBody(f));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao buscar empresas");
      setItems([]);
      setCount(0);
    } finally {
      setIsLoading(false);
    }
  }, [requestExactCount, resetExactCount]);

  // On mount: if URL already has filters, run the search immediately
  useEffect(() => {
    if (didInitialSearch.current) return;
    didInitialSearch.current = true;

    const initial = paramsToFilters(initialParams);
    if (hasActiveFilters(initial)) doSearch(initial);
    // Runs once on mount — initialParams is stable (passed from a Server Component)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doSearch]);

  function handleSearch() {
    const urlParams = filtersToUrlParams(filters);
    const qs = urlParams.toString();
    router.push(qs ? `/mapa?${qs}` : "/mapa", { scroll: false });
    doSearch(filters);
  }

  function handleClear() {
    setFilters(DEFAULT_FILTERS);
    setItems([]);
    setCount(0);
    setCountExact(true);
    setError(null);
    resetExactCount();
    router.push("/mapa", { scroll: false });
  }

  const origin =
    filters.lat !== null && filters.lng !== null
      ? { lat: filters.lat, lng: filters.lng }
      : null;

  return (
    <div
      className="flex overflow-hidden"
      style={{ height: "calc(100vh - 64px)", marginTop: 0 }}
    >
      <FilterPanel
        filters={filters}
        onChange={updateFilter}
        onSearch={handleSearch}
        onClear={handleClear}
        isLoading={isLoading}
        count={count}
        countExact={countExact}
        exactCount={exactCount}
        isCalculatingExact={isCalculatingExact}
        resultItems={items}
        removeFilter={removeFilter}
      />

      <div className="flex-1 relative flex flex-col overflow-hidden">
        {/* Error banner */}
        {error && (
          <div
            className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm shadow-md"
            style={{ background: "#fff1f2", border: "1px solid #fecdd3", color: "#be123c", zIndex: 20 }}
          >
            <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4m0 4h.01" />
            </svg>
            {error}
            <button
              type="button"
              onClick={() => setError(null)}
              className="ml-2 opacity-70 hover:opacity-100"
              aria-label="Fechar erro"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        <MapView
          origin={origin}
          radiusKm={filters.raioKm}
          companies={items}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
