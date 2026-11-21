import type { CnpjTableItem } from "./types";

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  accent: string;
}

function StatCard({ label, value, sub, accent }: StatCardProps) {
  return (
    <div
      className="flex-1 flex items-stretch rounded-xl overflow-hidden"
      style={{ background: "var(--surface)", border: "1px solid var(--border)", minWidth: 0 }}
    >
      <div className="w-1 flex-shrink-0" style={{ background: accent }} />
      <div className="flex-1 px-4 py-3 min-w-0">
        <p className="text-xs font-medium truncate" style={{ color: "var(--text-muted)" }}>
          {label}
        </p>
        <p className="text-xl font-bold leading-tight mt-1 tabular-nums" style={{ color: "var(--text)" }}>
          {value}
        </p>
        {sub && (
          <p className="text-xs mt-0.5 truncate" style={{ color: "var(--text-muted)" }}>
            {sub}
          </p>
        )}
      </div>
    </div>
  );
}

interface StatsBarProps {
  items: CnpjTableItem[];
  count: number;
  countExact: boolean;
  searched: boolean;
  /** Total exato calculado em background quando count bate no teto de 10.000 (ver useExactCount). */
  exactCount: number | null;
  isCalculatingExact: boolean;
}

export function StatsBar({
  items,
  count,
  countExact,
  searched,
  exactCount,
  isCalculatingExact,
}: StatsBarProps) {
  const n = items.length;
  const withEmail = items.filter((i) => Boolean(i.email)).length;
  const simples = items.filter((i) => i.opcao_simples).length;
  const pct = (x: number) =>
    n > 0 ? `${Math.round((x / n) * 100)}% desta pág.` : "—";

  const totalValue = !searched
    ? "—"
    : exactCount !== null
      ? exactCount.toLocaleString("pt-BR")
      : countExact
        ? count.toLocaleString("pt-BR")
        : `${count.toLocaleString("pt-BR")}+`;

  const totalSub =
    !countExact && exactCount === null && count > 0
      ? isCalculatingExact
        ? "calculando total exato…"
        : "mais de 10.000 resultados"
      : undefined;

  return (
    <div className="flex gap-3 px-4 pt-4 pb-0">
      <StatCard
        label="Total no Filtro"
        value={totalValue}
        sub={totalSub}
        accent="var(--gr-navy)"
      />
      <StatCard
        label="Com E-mail"
        value={searched && n > 0 ? withEmail.toLocaleString("pt-BR") : "—"}
        sub={searched && n > 0 ? pct(withEmail) : undefined}
        accent="var(--gr-teal)"
      />
      <StatCard
        label="Simples Nacional"
        value={searched && n > 0 ? simples.toLocaleString("pt-BR") : "—"}
        sub={searched && n > 0 ? pct(simples) : undefined}
        accent="var(--success)"
      />
      <StatCard
        label="Capital Médio"
        value="—"
        sub="fase futura"
        accent="var(--warning)"
      />
      <StatCard
        label="Match Places"
        value="—"
        sub="fase futura"
        accent="var(--text-muted)"
      />
    </div>
  );
}
