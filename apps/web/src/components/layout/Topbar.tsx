"use client";

import { useSelectedLayoutSegment } from "next/navigation";
import { useTopbarActions } from "./TopbarActionsProvider";

const SEGMENT_TITLES: Record<string, string> = {
  mapa:        "Mapa",
  cnpjs:       "CNPJs",
  exportacoes: "Exportações",
  campanhas:   "Campanhas",
  analytics:   "Analytics",
};

export function Topbar() {
  const segment = useSelectedLayoutSegment() ?? "";
  const title = SEGMENT_TITLES[segment] ?? "Radar Prospecção";
  const { actions } = useTopbarActions();

  return (
    <header className="h-16 bg-surface border-b flex items-center px-6 gap-4 flex-shrink-0" style={{ borderColor: "var(--border)" }}>
      <h1 className="text-gr-navy font-semibold text-lg">{title}</h1>
      {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
    </header>
  );
}
