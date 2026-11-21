"use client";

import { useState } from "react";
import type { CnpjsFilterState } from "./types";
import { FilterChips, type ChipDef } from "@/components/filters/FilterChips";
import { MultiSelectDropdown } from "@/components/filters/MultiSelectDropdown";
import { TagInput } from "@/components/filters/TagInput";
import {
  NATUREZA_JURIDICA_OPTIONS,
  naturezaJuridicaLabel,
} from "@/lib/naturezas-juridicas";
import { CNAE_SECAO_OPTIONS, cnaeSecaoLabel } from "@/lib/cnae-secoes";

// ── Constants ─────────────────────────────────────────────────────────────────

const UFS = [
  "AC","AL","AM","AP","BA","CE","DF","ES","GO","MA",
  "MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN",
  "RO","RR","RS","SC","SE","SP","TO",
] as const;
const UF_OPTIONS = UFS.map((uf) => ({ value: uf, label: uf }));

// "Teste" nunca vem da Receita Federal (valores reais: Ativa/Inapta/Baixada/
// Suspensa/Nula) — é o marcador usado por seed-test-emails.ts pra CNPJs fake
// de teste. Remover da lista quando não precisar mais selecioná-los aqui.
const SITUACOES = ["Ativa", "Inapta", "Baixada", "Suspensa", "Nula", "Teste"] as const;

// Valores batem com company_cnpj.porte (dado bruto da Receita Federal) —
// não são as siglas ME/EPP/DEMAIS que apareciam antes aqui (bug: filtro de
// porte nunca retornava nada, porque "ME" nunca é igual a "Micro" no banco).
const PORTES = [
  { value: "Micro",   label: "Microempresa" },
  { value: "Pequena", label: "Pequeno Porte" },
  { value: "Demais",  label: "Demais" },
] as const;

// ── Sub-components ────────────────────────────────────────────────────────────

function CompactSelect({
  value,
  onChange,
  placeholder,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 rounded-lg border px-3 pr-7 text-sm appearance-none focus:outline-none focus:ring-2 transition-shadow"
      style={{
        borderColor: "var(--border)",
        color: value ? "var(--text)" : "var(--text-muted)",
        background: "var(--surface)",
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 8px center",
        minWidth: "fit-content",
      }}
      aria-label={placeholder}
    >
      <option value="">{placeholder}</option>
      {children}
    </select>
  );
}

// ── Active chips factory ──────────────────────────────────────────────────────

function buildChips(
  filters: CnpjsFilterState,
  onChange: (k: keyof CnpjsFilterState, v: unknown) => void,
  removeFilter: (urlKeys: string[]) => void
): ChipDef[] {
  const chips: ChipDef[] = [];

  if (filters.lat !== null) {
    const dist = `${filters.raioKm}km`;
    const loc = filters.label || `${filters.lat.toFixed(4)}, ${filters.lng?.toFixed(4)}`;
    chips.push({
      key: "geo",
      label: `Raio: ${dist} em ${loc}`,
      onRemove: () => {
        onChange("lat", null);
        onChange("lng", null);
        onChange("label", "");
        removeFilter(["lat", "lng", "label"]);
      },
    });
  }
  filters.ufs.forEach((uf) => chips.push({
    key: `uf-${uf}`, label: `UF: ${uf}`,
    onRemove: () => {
      const rest = filters.ufs.filter((v) => v !== uf);
      onChange("ufs", rest);
      if (rest.length === 0) removeFilter(["uf"]);
    },
  }));
  filters.cidades.forEach((cidade) => chips.push({
    key: `cidade-${cidade}`, label: `Cidade: ${cidade}`,
    onRemove: () => {
      const rest = filters.cidades.filter((v) => v !== cidade);
      onChange("cidades", rest);
      if (rest.length === 0) removeFilter(["cidade"]);
    },
  }));
  if (filters.situacao) chips.push({
    key: "sit", label: `Situação: ${filters.situacao}`,
    onRemove: () => { onChange("situacao", ""); removeFilter(["sit"]); },
  });
  filters.cnaePrefixos.forEach((cnae) => chips.push({
    key: `cnae-${cnae}`, label: `CNAE: ${cnae}`,
    onRemove: () => {
      const rest = filters.cnaePrefixos.filter((v) => v !== cnae);
      onChange("cnaePrefixos", rest);
      if (rest.length === 0) removeFilter(["cnae"]);
    },
  }));
  filters.portes.forEach((porte) => chips.push({
    key: `porte-${porte}`, label: `Porte: ${porte}`,
    onRemove: () => {
      const rest = filters.portes.filter((v) => v !== porte);
      onChange("portes", rest);
      if (rest.length === 0) removeFilter(["porte"]);
    },
  }));
  filters.cnaeSecoes.forEach((sec) => chips.push({
    key: `setor-${sec}`, label: `Setor: ${cnaeSecaoLabel(sec)}`,
    onRemove: () => {
      const rest = filters.cnaeSecoes.filter((v) => v !== sec);
      onChange("cnaeSecoes", rest);
      if (rest.length === 0) removeFilter(["setor"]);
    },
  }));
  filters.naturezasJuridicas.forEach((cod) => chips.push({
    key: `nat-${cod}`, label: `Natureza: ${naturezaJuridicaLabel(cod)}`,
    onRemove: () => {
      const rest = filters.naturezasJuridicas.filter((v) => v !== cod);
      onChange("naturezasJuridicas", rest);
      if (rest.length === 0) removeFilter(["nat"]);
    },
  }));
  if (filters.matrizFilial) chips.push({
    key: "tipo", label: filters.matrizFilial,
    onRemove: () => { onChange("matrizFilial", ""); removeFilter(["tipo"]); },
  });
  if (filters.fazParteDeGrupo) chips.push({
    key: "grupo", label: "Em grupo econômico",
    onRemove: () => { onChange("fazParteDeGrupo", false); removeFilter(["grupo"]); },
  });
  if (filters.opcaoSimples) chips.push({
    key: "simples", label: "Simples Nacional",
    onRemove: () => { onChange("opcaoSimples", false); removeFilter(["simples"]); },
  });
  if (filters.opcaoMei) chips.push({
    key: "mei", label: "MEI",
    onRemove: () => { onChange("opcaoMei", false); removeFilter(["mei"]); },
  });
  if (filters.dataAberturaDE || filters.dataAberturaATE) {
    const de = filters.dataAberturaDE || "…";
    const ate = filters.dataAberturaATE || "…";
    chips.push({
      key: "datas",
      label: `Abertura: ${de} → ${ate}`,
      onRemove: () => {
        onChange("dataAberturaDE", "");
        onChange("dataAberturaATE", "");
        removeFilter(["de", "ate"]);
      },
    });
  }

  return chips;
}

// ── Main FilterBar ────────────────────────────────────────────────────────────

interface FilterBarProps {
  filters: CnpjsFilterState;
  onChange: (key: keyof CnpjsFilterState, value: unknown) => void;
  onSearch: () => void;
  onClear: () => void;
  isLoading: boolean;
  removeFilter: (urlKeys: string[]) => void;
}

export function FilterBar({
  filters,
  onChange,
  onSearch,
  onClear,
  isLoading,
  removeFilter,
}: FilterBarProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const chips = buildChips(filters, onChange, removeFilter);
  const hasChips = chips.length > 0;
  // A API exige ao menos um filtro de escopo geográfico (uf, cidade ou
  // origem+raio) — sem isso a query varreria as 27 partições inteiras.
  // Desabilitar aqui evita o usuário bater num 400 sem entender por quê.
  const hasScope =
    filters.ufs.length > 0 ||
    filters.cidades.length > 0 ||
    (filters.lat !== null && filters.lng !== null);

  return (
    <div
      className="flex-shrink-0 px-4 pt-3 pb-0"
      style={{ borderBottom: "1px solid var(--border)" }}
    >
      {/* ── Primary row ── */}
      <div className="flex items-center gap-2 pb-3 flex-wrap">
        {/* Text search */}
        <div className="relative flex-1" style={{ minWidth: 200, maxWidth: 320 }}>
          <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
            <svg className="w-4 h-4" style={{ color: "var(--text-muted)" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
          </div>
          <input
            type="text"
            value={filters.textoLivre}
            onChange={(e) => onChange("textoLivre", e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSearch()}
            placeholder="Buscar por nome ou CNPJ..."
            className="w-full h-9 pl-9 pr-3 rounded-lg border text-sm focus:outline-none focus:ring-2 transition-shadow"
            style={{ borderColor: "var(--border)", color: "var(--text)", background: "var(--surface)" }}
          />
        </div>

        {/* UF — múltiplas = OR */}
        <MultiSelectDropdown
          options={UF_OPTIONS}
          selected={filters.ufs}
          onChange={(v) => onChange("ufs", v)}
          placeholder="UF"
          width={90}
        />

        {/* Cidade — Enter ou vírgula adiciona; múltiplas = OR */}
        <TagInput
          values={filters.cidades}
          onChange={(v) => onChange("cidades", v)}
          placeholder="Cidade"
          width={130}
        />

        {/* Situação */}
        <CompactSelect value={filters.situacao} onChange={(v) => onChange("situacao", v)} placeholder="Situação">
          {SITUACOES.map((s) => <option key={s} value={s}>{s}</option>)}
        </CompactSelect>

        {/* Setor — seção da CNAE 2.0. Ignorado quando há CNAE explícito (o
            servidor dá precedência ao prefixo digitado). */}
        <MultiSelectDropdown
          options={CNAE_SECAO_OPTIONS}
          selected={filters.cnaeSecoes}
          onChange={(v) => onChange("cnaeSecoes", v)}
          placeholder="Setor"
          width={140}
        />

        {/* CNAE — Enter ou vírgula adiciona; múltiplos prefixos = OR */}
        <TagInput
          values={filters.cnaePrefixos}
          onChange={(v) => onChange("cnaePrefixos", v)}
          placeholder="CNAE"
          width={90}
          transform={(raw) => raw.replace(/\D/g, "")}
        />

        {/* Porte — múltiplos = OR */}
        <MultiSelectDropdown
          options={PORTES}
          selected={filters.portes}
          onChange={(v) => onChange("portes", v)}
          placeholder="Porte"
          width={100}
        />

        {/* Natureza jurídica — separa empresário individual de empresa (2135) */}
        <MultiSelectDropdown
          options={NATUREZA_JURIDICA_OPTIONS}
          selected={filters.naturezasJuridicas}
          onChange={(v) => onChange("naturezasJuridicas", v)}
          placeholder="Natureza"
          width={130}
        />

        {/* Avançado toggle */}
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border text-sm font-medium transition-colors"
          style={{
            borderColor: showAdvanced ? "var(--gr-teal)" : "var(--border)",
            color: showAdvanced ? "var(--gr-teal)" : "var(--text-2)",
            background: showAdvanced ? "var(--gr-teal)10" : "var(--surface)",
          }}
        >
          Avançado
          <svg
            className="w-3.5 h-3.5 transition-transform"
            style={{ transform: showAdvanced ? "rotate(180deg)" : "none" }}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>

        {/* Spacer + Buscar */}
        <div className="ml-auto flex items-center gap-2">
          {hasChips && (
            <button
              type="button"
              onClick={onClear}
              className="h-9 px-3 rounded-lg border text-sm font-medium transition-colors hover:opacity-80"
              style={{ borderColor: "var(--border)", color: "var(--text-2)", background: "transparent" }}
            >
              Limpar
            </button>
          )}
          <button
            type="button"
            onClick={onSearch}
            disabled={isLoading || !hasScope}
            title={hasScope ? undefined : "Selecione UF, cidade ou origem+raio para buscar"}
            className="h-9 px-4 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-60"
            style={{ background: "var(--gr-teal)" }}
          >
            {isLoading ? "Buscando…" : "Buscar"}
          </button>
        </div>
      </div>

      {!hasScope && (
        <p className="text-xs pb-3" style={{ color: "var(--text-muted)" }}>
          Selecione UF, cidade ou uma origem no Mapa (raio) antes de buscar.
        </p>
      )}

      {/* ── Advanced filters ── */}
      {showAdvanced && (
        <div
          className="flex flex-wrap items-center gap-3 px-1 pb-3"
          style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}
        >
          {/* Tipo */}
          <div className="flex items-center gap-2 text-sm">
            <span style={{ color: "var(--text-muted)" }}>Tipo:</span>
            {(["", "MATRIZ", "FILIAL"] as const).map((v) => (
              <label key={v || "all"} className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="matrizFilial"
                  value={v}
                  checked={filters.matrizFilial === v}
                  onChange={() => onChange("matrizFilial", v)}
                  className="w-3.5 h-3.5"
                  style={{ accentColor: "var(--gr-teal)" }}
                />
                <span style={{ color: "var(--text-2)" }}>{v || "Ambos"}</span>
              </label>
            ))}
          </div>

          <div className="w-px h-5 flex-shrink-0" style={{ background: "var(--border)" }} />

          {/* Checkboxes */}
          {[
            { key: "opcaoSimples" as const, label: "Simples Nacional" },
            { key: "opcaoMei" as const, label: "MEI" },
            // QSA: sócio em comum com outro CNPJ → conta de grupo, não lead avulso
            { key: "fazParteDeGrupo" as const, label: "Em grupo econômico" },
          ].map(({ key, label }) => (
            <label key={key} className="inline-flex items-center gap-1.5 cursor-pointer select-none text-sm">
              <input
                type="checkbox"
                checked={filters[key] as boolean}
                onChange={(e) => onChange(key, e.target.checked)}
                className="w-3.5 h-3.5 rounded"
                style={{ accentColor: "var(--gr-teal)" }}
              />
              <span style={{ color: "var(--text-2)" }}>{label}</span>
            </label>
          ))}

          <div className="w-px h-5 flex-shrink-0" style={{ background: "var(--border)" }} />

          {/* Data abertura */}
          <div className="flex items-center gap-2 text-sm">
            <span style={{ color: "var(--text-muted)" }}>Abertura:</span>
            <input
              type="date"
              value={filters.dataAberturaDE}
              onChange={(e) => onChange("dataAberturaDE", e.target.value)}
              className="h-8 rounded-lg border px-2 text-xs focus:outline-none focus:ring-2"
              style={{ borderColor: "var(--border)", color: "var(--text)", background: "var(--surface)" }}
            />
            <span style={{ color: "var(--text-muted)" }}>até</span>
            <input
              type="date"
              value={filters.dataAberturaATE}
              onChange={(e) => onChange("dataAberturaATE", e.target.value)}
              className="h-8 rounded-lg border px-2 text-xs focus:outline-none focus:ring-2"
              style={{ borderColor: "var(--border)", color: "var(--text)", background: "var(--surface)" }}
            />
          </div>
        </div>
      )}

      {/* ── Active chips ── */}
      {hasChips && <FilterChips chips={chips} className="pb-3" />}
    </div>
  );
}
