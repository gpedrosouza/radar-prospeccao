"use client";

export interface ChipDef {
  key: string;
  label: string;
  onRemove: () => void;
}

interface Props {
  chips: ChipDef[];
  className?: string;
}

export function FilterChips({ chips, className = "" }: Props) {
  if (chips.length === 0) return null;
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {chips.map((chip) => (
        <span
          key={chip.key}
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium flex-shrink-0"
          style={{
            background: "var(--gr-teal)18",
            color: "var(--gr-teal)",
            border: "1px solid var(--gr-teal)40",
          }}
        >
          {chip.label}
          <button
            type="button"
            onClick={chip.onRemove}
            className="rounded-full hover:opacity-70 transition-opacity"
            aria-label={`Remover filtro ${chip.label}`}
          >
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </span>
      ))}
    </div>
  );
}
