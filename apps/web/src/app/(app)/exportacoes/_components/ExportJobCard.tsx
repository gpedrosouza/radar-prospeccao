"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { SerializedExportJob, ExportJobStatus } from "./types";

// ── Utilities ─────────────────────────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffH = Math.floor(diffMin / 60);
  const diffD = Math.floor(diffH / 24);
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `há ${diffMin} min`;
  if (diffH < 24) return `há ${diffH}h`;
  if (diffD === 1) return "ontem";
  if (diffD < 7) return `há ${diffD} dias`;
  return new Date(dateStr).toLocaleDateString("pt-BR");
}

function formatBytes(bytesStr: string | null): string {
  if (!bytesStr) return "—";
  const n = Number(bytesStr);
  if (n < 1024) return `${n} B`;
  if (n < 1_048_576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1_048_576).toFixed(1)} MB`;
}

function formatDuration(start: string, end: string | null): string {
  if (!end) return "—";
  const s = Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function generateJobName(filtros: Record<string, unknown>, criadoEm: string): string {
  const parts: string[] = [];
  if (filtros.uf) parts.push(String(filtros.uf));
  if (filtros.situacao) parts.push(String(filtros.situacao));
  if (filtros.cnae_prefixo) parts.push(String(filtros.cnae_prefixo));
  if (filtros.raio_km) parts.push(`${filtros.raio_km}km`);
  const date = new Date(criadoEm).toISOString().slice(0, 10);
  const base = parts.length > 0 ? parts.join("_") : "exportacao";
  return `${base}_${date}.csv.gz`;
}

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_CFG: Record<ExportJobStatus, { label: string; cssColor: string }> = {
  queued:    { label: "Na fila",     cssColor: "var(--warning)" },
  running:   { label: "Processando", cssColor: "var(--warning)" },
  completed: { label: "Concluído",   cssColor: "var(--success)" },
  failed:    { label: "Falhou",      cssColor: "var(--danger)"  },
};

function StatusBadge({ status }: { status: ExportJobStatus }) {
  const { label, cssColor } = STATUS_CFG[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold flex-shrink-0"
      style={{
        background: `${cssColor}1a`,
        color: cssColor,
        border: `1px solid ${cssColor}44`,
      }}
    >
      {status === "running" && (
        <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
      )}
      {status === "queued" && (
        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <circle cx="12" cy="12" r="10" /><path d="M12 6v6l3 3" />
        </svg>
      )}
      {status === "completed" && (
        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      )}
      {status === "failed" && (
        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      )}
      {label}
    </span>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Progresso</span>
        <span className="text-xs font-bold tabular-nums" style={{ color: "var(--warning)" }}>
          {pct}%
        </span>
      </div>
      <div
        className="h-2 rounded-full overflow-hidden"
        style={{ background: "var(--border)" }}
      >
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${Math.max(pct, 2)}%`,
            background: "linear-gradient(90deg, var(--gr-teal), var(--gr-teal-dark))",
          }}
        />
      </div>
    </div>
  );
}

// ── Stat pill ─────────────────────────────────────────────────────────────────

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>
        {label}
      </p>
      <p className="text-xs font-semibold tabular-nums mt-0.5" style={{ color: "var(--text-2)" }}>
        {value}
      </p>
    </div>
  );
}

// ── SSE payload shape ─────────────────────────────────────────────────────────

interface SsePayload {
  status: ExportJobStatus;
  progresso_pct: number;
  linhas?: number | null;
  downloadUrl?: string;
  erro?: string;
}

// ── Main card ─────────────────────────────────────────────────────────────────

interface ExportJobCardProps {
  job: SerializedExportJob;
}

export function ExportJobCard({ job }: ExportJobCardProps) {
  const router = useRouter();

  // Local live state — updated by SSE for active jobs
  const [status, setStatus]           = useState<ExportJobStatus>(job.status);
  const [progresso, setProgresso]     = useState(job.progresso_pct);
  const [linhas, setLinhas]           = useState(job.linhas);
  const [erro, setErro]               = useState(job.erro);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [concluido, setConcluido]     = useState(job.concluido_em);
  const [retrying, setRetrying]       = useState(false);
  const [retryError, setRetryError]   = useState<string | null>(null);

  const esRef = useRef<EventSource | null>(null);

  // ── SSE — only for active jobs at mount time ───────────────────────────────
  useEffect(() => {
    // Status is captured from initial job.status; only open for active jobs
    if (job.status !== "queued" && job.status !== "running") return;

    const es = new EventSource(`/api/cnpj/export-jobs/${job.id}/stream`);
    esRef.current = es;

    es.onmessage = (e: MessageEvent) => {
      let payload: SsePayload;
      try { payload = JSON.parse(e.data as string) as SsePayload; }
      catch { return; }

      setStatus(payload.status);
      setProgresso(payload.progresso_pct);
      if (payload.linhas !== undefined) setLinhas(payload.linhas ?? null);

      if (payload.status === "completed") {
        if (payload.downloadUrl) setDownloadUrl(payload.downloadUrl);
        setConcluido(new Date().toISOString());
        es.close();
        esRef.current = null;
      }
      if (payload.status === "failed") {
        if (payload.erro) setErro(payload.erro);
        es.close();
        esRef.current = null;
      }
    };

    es.onerror = () => { es.close(); esRef.current = null; };

    return () => { es.close(); esRef.current = null; };
    // Intentionally empty — runs once on mount, based on initial job.status.
    // O card é renderizado com key={job.id} em ExportacoesClient, então trocar
    // de job remonta o componente e reabre o SSE em vez de deixá-lo obsoleto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Retry ─────────────────────────────────────────────────────────────────
  async function handleRetry() {
    setRetrying(true);
    setRetryError(null);
    try {
      const res = await fetch("/api/cnpj/export-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(job.filtros),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      router.refresh();
    } catch (err) {
      setRetryError(err instanceof Error ? err.message : "Erro ao criar job");
      setRetrying(false);
    }
  }

  // ── Derived values ────────────────────────────────────────────────────────
  const jobName    = generateJobName(job.filtros, job.criado_em);
  const isActive   = status === "queued" || status === "running";
  const accentColor =
    status === "completed" ? "var(--success)" :
    status === "failed"    ? "var(--danger)"  :
                             "var(--warning)";

  // For completed with no SSE URL, fall back to the redirect endpoint
  const effectiveDownloadUrl = downloadUrl ?? (job.storage_key ? `/api/cnpj/export-jobs/${job.id}/download` : null);

  return (
    <div
      className="flex items-stretch rounded-2xl overflow-hidden transition-shadow hover:shadow-md"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        boxShadow: "0 1px 3px 0 rgba(0,0,0,0.05)",
      }}
    >
      {/* Left accent bar */}
      <div className="w-1 flex-shrink-0 transition-colors duration-500" style={{ background: accentColor }} />

      <div className="flex-1 p-5 space-y-4 min-w-0">
        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
            >
              <svg
                className="w-5 h-5"
                style={{ color: "var(--text-muted)" }}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate" style={{ color: "var(--text)" }}>
                {jobName}
              </p>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                {relativeTime(job.criado_em)}
              </p>
            </div>
          </div>
          <StatusBadge status={status} />
        </div>

        {/* ── Progress bar (queued / running) ── */}
        {isActive && <ProgressBar pct={progresso} />}

        {/* ── Error message ── */}
        {(status === "failed" && erro) && (
          <div
            className="rounded-lg px-3 py-2 text-xs leading-relaxed"
            style={{
              background: "var(--danger)0d",
              color: "var(--danger)",
              border: "1px solid var(--danger)33",
            }}
          >
            {erro}
          </div>
        )}
        {retryError && (
          <div
            className="rounded-lg px-3 py-2 text-xs"
            style={{
              background: "var(--danger)0d",
              color: "var(--danger)",
              border: "1px solid var(--danger)33",
            }}
          >
            {retryError}
          </div>
        )}

        {/* ── Stats + actions footer ── */}
        <div
          className="flex items-end justify-between gap-4 pt-3"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <div className="flex items-center gap-5">
            <Stat
              label="Linhas"
              value={linhas !== null && linhas !== undefined ? linhas.toLocaleString("pt-BR") : "—"}
            />
            <Stat label="Tamanho" value={formatBytes(job.tamanho_bytes)} />
            <Stat label="Duração" value={formatDuration(job.criado_em, concluido)} />
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {status === "completed" && (
              <a
                href={effectiveDownloadUrl ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90"
                style={{
                  background: effectiveDownloadUrl ? "var(--gr-teal)" : "var(--text-muted)",
                  pointerEvents: effectiveDownloadUrl ? "auto" : "none",
                }}
                title={!effectiveDownloadUrl ? "Storage não configurado" : undefined}
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download
              </a>
            )}
            {status === "failed" && (
              <button
                type="button"
                onClick={handleRetry}
                disabled={retrying}
                className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-medium transition-colors hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ border: "1px solid var(--border)", color: "var(--text-2)", background: "var(--surface)" }}
              >
                <svg
                  className={`w-3.5 h-3.5 ${retrying ? "animate-spin" : ""}`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path d="M1 4v6h6M23 20v-6h-6" />
                  <path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15" />
                </svg>
                {retrying ? "Criando…" : "Tentar novamente"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
