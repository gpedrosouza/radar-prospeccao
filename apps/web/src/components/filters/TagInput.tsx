"use client";

import { useState } from "react";

interface Props {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
  width?: number;
  /** Aplicado a cada valor antes de adicionar — ex: remover não-dígitos no CNAE. */
  transform?: (raw: string) => string;
}

/**
 * Multi-valor via texto livre — para campos sem lista fixa (cidade, prefixo
 * CNAE). Enter ou vírgula adiciona o valor digitado; os valores já
 * adicionados aparecem como chips na barra de filtros ativos existente
 * (FilterBar já tem esse mecanismo para o filtro singular — só passamos a
 * gerar um chip por item em vez de um chip pro campo inteiro).
 */
export function TagInput({ values, onChange, placeholder, width, transform }: Props) {
  const [draft, setDraft] = useState("");

  function commit() {
    const clean = (transform ? transform(draft) : draft).trim();
    setDraft("");
    if (!clean || values.includes(clean)) return;
    onChange([...values, clean]);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit();
    } else if (e.key === "Backspace" && draft === "" && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  }

  return (
    <input
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={commit}
      placeholder={values.length > 0 ? "+ adicionar..." : placeholder}
      className="h-9 rounded-lg border px-3 text-sm focus:outline-none focus:ring-2 transition-shadow"
      style={{
        borderColor: "var(--border)",
        color: "var(--text)",
        background: "var(--surface)",
        width: width ?? 130,
      }}
    />
  );
}
