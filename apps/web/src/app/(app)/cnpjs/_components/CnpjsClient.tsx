"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { StatsBar } from "./StatsBar";
import { FilterBar } from "./FilterBar";
import { CnpjTable } from "./CnpjTable";
import {
  cnpjsParamsToFilters,
  cnpjsFiltersToUrlParams,
  cnpjsFiltersToApiParams,
  filtersToExportBody,
} from "./utils";
import {
  DEFAULT_CNPJS_FILTERS,
  type CnpjsFilterState,
  type CnpjTableItem,
  type CnpjsPageResult,
} from "./types";
import { useTopbarActions } from "@/components/layout/TopbarActionsProvider";
import { useCnpjFilters } from "@/hooks/useCnpjFilters";
import { useExactCount } from "@/hooks/useExactCount";

const PAGE_LIMIT = 50;

interface Props {
  initialParams: Record<string, string>;
}

export function CnpjsClient({ initialParams }: Props) {
  const router = useRouter();
  const { setActions } = useTopbarActions();
  const { removeFilter } = useCnpjFilters();

  // ── Filter draft state ─────────────────────────────────────────────────────
  const [filters, setFilters] = useState<CnpjsFilterState>(() =>
    cnpjsParamsToFilters(initialParams)
  );

  // ── Search results ─────────────────────────────────────────────────────────
  const [items, setItems] = useState<CnpjTableItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const [countExact, setCountExact] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  // ── Cursor-based pagination state ──────────────────────────────────────────
  // cursorStack[i] is the cursor that produced page i+2 (page 1 has no cursor)
  const [cursorStack, setCursorStack] = useState<string[]>([]);
  const [page, setPage] = useState(1);

  // ── Toast ──────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const didInitialSearch = useRef(false);

  const { exactCount, isCalculating: isCalculatingExact, requestExactCount, reset: resetExactCount } =
    useExactCount();

  // ── Stable refs for action handlers (avoid stale closures in Topbar) ──────
  const filtersRef = useRef(filters);
  const itemsRef = useRef(items);
  const pageRef = useRef(page);
  useEffect(() => { filtersRef.current = filters; }, [filters]);
  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => { pageRef.current = page; }, [page]);

  // ── Core search ───────────────────────────────────────────────────────────
  const doSearch = useCallback(async (f: CnpjsFilterState, cursor?: string) => {
    setIsLoading(true);
    setError(null);
    // Só reseta/recalcula o total exato numa busca nova (página 1) — trocar
    // de página com os mesmos filtros não muda a contagem.
    if (cursor === undefined) resetExactCount();
    try {
      const params = cnpjsFiltersToApiParams(f, { cursor, limit: PAGE_LIMIT });
      const res = await fetch(`/api/cnpj/companies?${params}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as CnpjsPageResult;
      setItems(data.items);
      setNextCursor(data.nextCursor);
      setCount(data.count);
      setCountExact(data.countExact);
      setSearched(true);
      if (cursor === undefined && !data.countExact) {
        requestExactCount(filtersToExportBody(f));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao buscar empresas");
      setItems([]);
      setCount(0);
    } finally {
      setIsLoading(false);
    }
  }, [requestExactCount, resetExactCount]);

  // ── Initial search from URL params ─────────────────────────────────────────
  useEffect(() => {
    if (didInitialSearch.current) return;
    didInitialSearch.current = true;
    const initial = cnpjsParamsToFilters(initialParams);
    const hasFilters =
      initial.lat !== null ||
      initial.ufs.length > 0 ||
      initial.cidades.length > 0 ||
      initial.situacao !== "" ||
      initial.cnaePrefixos.length > 0 ||
      initial.portes.length > 0 ||
      initial.naturezasJuridicas.length > 0 ||
      initial.cnaeSecoes.length > 0 ||
      initial.matrizFilial !== "" ||
      initial.opcaoSimples ||
      initial.opcaoMei ||
      initial.dataAberturaDE !== "" ||
      initial.dataAberturaATE !== "";
    if (hasFilters) doSearch(initial);
    // Roda uma vez no mount — initialParams é estável (vem de um Server
    // Component). A enumeração acima é manual porque hasActiveFilters de
    // mapa/utils não checa uf.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doSearch]);

  // ── User actions ───────────────────────────────────────────────────────────
  function updateFilter(key: keyof CnpjsFilterState, value: unknown) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function handleSearch() {
    const urlParams = cnpjsFiltersToUrlParams(filters);
    const qs = urlParams.toString();
    router.push(qs ? `/cnpjs?${qs}` : "/cnpjs", { scroll: false });
    setCursorStack([]);
    setPage(1);
    doSearch(filters);
  }

  function handleClear() {
    setFilters(DEFAULT_CNPJS_FILTERS);
    setItems([]);
    setCount(0);
    setCountExact(true);
    setError(null);
    setSearched(false);
    setCursorStack([]);
    setPage(1);
    setNextCursor(null);
    resetExactCount();
    router.push("/cnpjs", { scroll: false });
  }

  function handleNext() {
    if (!nextCursor) return;
    const newStack = [...cursorStack, nextCursor];
    setCursorStack(newStack);
    setPage((p) => p + 1);
    doSearch(filters, nextCursor);
  }

  function handlePrev() {
    const newStack = cursorStack.slice(0, -1);
    const prevCursor = newStack[newStack.length - 1];
    setCursorStack(newStack);
    setPage((p) => p - 1);
    doSearch(filters, prevCursor);
  }

  // ── Stable Topbar action handlers ─────────────────────────────────────────

  const handleExportCsv = useCallback(() => {
    const its = itemsRef.current;
    const pg = pageRef.current;
    const headers = ["CNPJ", "Razão Social", "Município", "UF", "CNAE", "Situação", "Porte", "E-mail"];
    const rows = its.map((i) => [
      i.cnpj,
      i.razao_social,
      i.municipio_nome,
      i.uf,
      i.cnae_principal,
      i.situacao,
      i.porte ?? "",
      i.email ?? "",
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cnpjs-pagina-${pg}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleCsvCompleto = useCallback(async () => {
    const body = filtersToExportBody(filtersRef.current);
    try {
      const res = await fetch("/api/cnpj/export-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setToast({ msg: "Job criado! Acompanhe o progresso em Exportações.", type: "success" });
    } catch {
      setToast({ msg: "Erro ao criar job de exportação. Tente novamente.", type: "error" });
    }
    setTimeout(() => setToast(null), 5000);
  }, []);

  const handleCampanha = useCallback(() => {
    const urlParams = cnpjsFiltersToUrlParams(filtersRef.current);
    const qs = urlParams.toString();
    router.push(qs ? `/campanhas?${qs}` : "/campanhas");
  }, [router]);

  // ── Inject action buttons into Topbar ─────────────────────────────────────
  const hasItems = items.length > 0;
  useEffect(() => {
    setActions(
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleExportCsv}
          disabled={!hasItems}
          className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ border: "1px solid var(--border)", color: "var(--text-2)", background: "var(--surface)" }}
          title="Exportar página atual como CSV"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Exportar CSV
        </button>
        <button
          type="button"
          onClick={handleCampanha}
          className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-medium transition-colors"
          style={{ border: "1px solid var(--border)", color: "var(--text-2)", background: "var(--surface)" }}
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          Campanha
        </button>
        <button
          type="button"
          onClick={handleCsvCompleto}
          className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: "var(--gr-teal)" }}
          title="Criar job de exportação completa"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          CSV Completo
        </button>
      </div>
    );
    return () => setActions(null);
  }, [hasItems, setActions, handleExportCsv, handleCampanha, handleCsvCompleto]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Stats bar */}
      <StatsBar
        items={items}
        count={count}
        countExact={countExact}
        searched={searched}
        exactCount={exactCount}
        isCalculatingExact={isCalculatingExact}
      />

      {/* Filter bar */}
      <FilterBar
        filters={filters}
        onChange={updateFilter}
        onSearch={handleSearch}
        onClear={handleClear}
        isLoading={isLoading}
        removeFilter={removeFilter}
      />

      {/* Error banner */}
      {error && (
        <div
          className="mx-4 mt-3 flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm flex-shrink-0"
          style={{ background: "#fff1f2", border: "1px solid #fecdd3", color: "#be123c" }}
        >
          <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4m0 4h.01" />
          </svg>
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError(null)} className="opacity-70 hover:opacity-100 flex-shrink-0">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Table card */}
      <div
        className="flex-1 flex flex-col overflow-hidden mx-4 mt-3 mb-4 rounded-xl"
        style={{ border: "1px solid var(--border)", background: "var(--surface)", minHeight: 0 }}
      >
        <CnpjTable
          items={items}
          isLoading={isLoading}
          count={count}
          countExact={countExact}
          exactCount={exactCount}
          page={page}
          limit={PAGE_LIMIT}
          hasNext={Boolean(nextCursor)}
          hasPrev={page > 1}
          searched={searched}
          onNext={handleNext}
          onPrev={handlePrev}
        />
      </div>

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-6 right-6 flex items-center gap-3 rounded-xl px-5 py-3 shadow-xl z-50"
          style={{
            background: toast.type === "success" ? "var(--gr-navy)" : "#be123c",
            color: "white",
            maxWidth: 400,
            animation: "slideIn 0.2s ease",
          }}
        >
          {toast.type === "success" ? (
            <svg className="w-4 h-4 flex-shrink-0" style={{ color: "var(--gr-teal)" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          ) : (
            <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4m0 4h.01" />
            </svg>
          )}
          <span className="text-sm flex-1">{toast.msg}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="opacity-70 hover:opacity-100 flex-shrink-0"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
