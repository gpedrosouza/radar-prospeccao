"use client";

import { useEffect, useRef, useState } from "react";

interface Option {
  value: string;
  label: string;
}

interface Props {
  options: readonly Option[];
  selected: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
  /** Largura do botão — mesma convenção de largura fixa usada nos outros campos compactos da FilterBar. */
  width?: number;
}

/**
 * Multi-seleção via popover de checkboxes — para listas curtas e fixas (UF,
 * Porte). Estilizado como os outros campos compactos (CompactSelect), só que
 * abre um painel em vez de um <select> nativo, porque <select multiple> tem
 * UX ruim (precisa Ctrl+clique, sem indicação visual clara do que já foi
 * escolhido). Os valores escolhidos aparecem como chips na barra de filtros
 * ativos já existente — este componente não duplica essa exibição.
 */
export function MultiSelectDropdown({
  options,
  selected,
  onChange,
  placeholder,
  width,
}: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  function toggle(value: string) {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value]
    );
  }

  const label =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? options.find((o) => o.value === selected[0])?.label ?? selected[0]
        : `${selected.length} selecionados`;

  return (
    <div ref={containerRef} className="relative" style={width ? { width } : undefined}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-9 w-full rounded-lg border px-3 pr-7 text-sm text-left focus:outline-none focus:ring-2 transition-shadow relative"
        style={{
          borderColor: open ? "var(--gr-teal)" : "var(--border)",
          color: selected.length > 0 ? "var(--text)" : "var(--text-muted)",
          background: "var(--surface)",
          minWidth: "fit-content",
        }}
      >
        {label}
        <svg
          className="w-3 h-3 absolute right-2.5 top-1/2 -translate-y-1/2 transition-transform"
          style={{ color: "#94a3b8", transform: open ? "translateY(-50%) rotate(180deg)" : "translateY(-50%)" }}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute z-20 mt-1 rounded-lg shadow-lg overflow-y-auto"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            minWidth: "160px",
            maxHeight: "280px",
          }}
        >
          {options.map((opt) => (
            <label
              key={opt.value}
              className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:opacity-80 select-none"
              style={{ color: "var(--text)" }}
            >
              <input
                type="checkbox"
                checked={selected.includes(opt.value)}
                onChange={() => toggle(opt.value)}
                className="w-3.5 h-3.5 rounded flex-shrink-0"
                style={{ accentColor: "var(--gr-teal)" }}
              />
              {opt.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
