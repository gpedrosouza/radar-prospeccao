"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useTopbarActions } from "@/components/layout/TopbarActionsProvider";
import { ExportJobCard } from "./ExportJobCard";
import type { SerializedExportJob } from "./types";

interface Props {
  jobs: SerializedExportJob[];
}

export function ExportacoesClient({ jobs }: Props) {
  const { setActions } = useTopbarActions();

  // ── "+ Nova Exportação" no Topbar ─────────────────────────────────────────
  // Leva para /cnpjs onde o usuário define filtros e clica em "CSV Completo".
  // Não abre modal — o fluxo de seleção de filtros já existe na tela de CNPJs.
  useEffect(() => {
    setActions(
      <Link
        href="/cnpjs"
        className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90"
        style={{ background: "var(--gr-teal)" }}
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M12 5v14M5 12h14" />
        </svg>
        Nova Exportação
      </Link>
    );
    return () => setActions(null);
  }, [setActions]);

  // ── Empty state ───────────────────────────────────────────────────────────
  if (jobs.length === 0) {
    return (
      <div className="flex-1 overflow-auto p-6 flex flex-col items-center justify-center gap-4">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <svg
            className="w-8 h-8"
            style={{ color: "var(--text-muted)" }}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
        </div>
        <div className="text-center">
          <p className="font-semibold" style={{ color: "var(--text)" }}>
            Nenhuma exportação ainda
          </p>
          <p className="text-sm mt-1 max-w-xs" style={{ color: "var(--text-muted)" }}>
            Crie uma exportação na tela de CNPJs usando o botão &ldquo;CSV Completo&rdquo;
          </p>
        </div>
        <Link
          href="/cnpjs"
          className="inline-flex items-center gap-2 px-4 h-9 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{ background: "var(--gr-teal)" }}
        >
          Ir para CNPJs
        </Link>
      </div>
    );
  }

  // ── List of job cards ─────────────────────────────────────────────────────
  const active    = jobs.filter((j) => j.status === "queued" || j.status === "running");
  const finished  = jobs.filter((j) => j.status === "completed" || j.status === "failed");

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Active jobs section */}
        {active.length > 0 && (
          <section>
            <h2
              className="text-xs font-semibold uppercase tracking-wider mb-3"
              style={{ color: "var(--text-muted)" }}
            >
              Em andamento ({active.length})
            </h2>
            <div className="space-y-3">
              {active.map((job) => (
                <ExportJobCard key={job.id} job={job} />
              ))}
            </div>
          </section>
        )}

        {/* Finished jobs section */}
        {finished.length > 0 && (
          <section>
            <h2
              className="text-xs font-semibold uppercase tracking-wider mb-3"
              style={{ color: "var(--text-muted)" }}
            >
              Histórico ({finished.length})
            </h2>
            <div className="space-y-3">
              {finished.map((job) => (
                <ExportJobCard key={job.id} job={job} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
