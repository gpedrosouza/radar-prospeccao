"use client";

import type { MapaFilterState, CnpjMapItem } from "./types";
import { PlaceAutocomplete } from "./PlaceAutocomplete";
import { FilterChips, type ChipDef } from "@/components/filters/FilterChips";
import { MultiSelectDropdown } from "@/components/filters/MultiSelectDropdown";
import {
  NATUREZA_JURIDICA_OPTIONS,
  naturezaJuridicaLabel,
} from "@/lib/naturezas-juridicas";
import { CNAE_SECAO_OPTIONS, cnaeSecaoLabel } from "@/lib/cnae-secoes";
import { TagInput } from "@/components/filters/TagInput";

// ── Constants ────────────────────────────────────────────────────────────────

const SITUACOES = ["Ativa", "Inapta", "Baixada", "Suspensa", "Nula"];
// Valores batem com company_cnpj.porte (dado bruto da Receita Federal) —
// não são as siglas ME/EPP/DEMAIS que apareciam antes aqui (bug: filtro de
// porte nunca retornava nada, porque "ME" nunca é igual a "Micro" no banco).
const PORTES = [
  { value: "Micro", label: "Microempresa" },
  { value: "Pequena", label: "Pequeno Porte" },
  { value: "Demais", label: "Demais" },
];

// ── Sub-components ───────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-2)" }}>
      {children}
    </label>
  );
}

function SelectField({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full h-9 rounded-lg border px-3 text-sm appearance-none bg-white focus:outline-none focus:ring-2 transition-shadow"
      style={{
        borderColor: "var(--border)",
        color: value ? "var(--text)" : "var(--text-muted)",
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 10px center",
        paddingRight: "28px",
      }}
    >
      {children}
    </select>
  );
}

function Divider() {
  return <hr style={{ borderColor: "var(--border)" }} />;
}

// ── Active filter chips ───────────────────────────────────────────────────────

function getChips(
  filters: MapaFilterState,
  onChange: (k: keyof MapaFilterState, v: unknown) => void,
  removeFilter: (urlKeys: string[]) => void
): ChipDef[] {
  const chips: ChipDef[] = [];
  if (filters.situacao) chips.push({
    key: "situacao", label: `Situação: ${filters.situacao}`,
    onRemove: () => { onChange("situacao", ""); removeFilter(["sit"]); },
  });
  filters.cnaePrefixos.forEach((cnae) => chips.push({
    key: `cnae-${cnae}`, label: `CNAE: ${cnae}`,
    onRemove: () => {
      const rest = filters.cnaePrefixos.filter((c) => c !== cnae);
      onChange("cnaePrefixos", rest);
      if (rest.length === 0) removeFilter(["cnae"]);
    },
  }));
  filters.portes.forEach((porte) => chips.push({
    key: `porte-${porte}`, label: `Porte: ${porte}`,
    onRemove: () => {
      const rest = filters.portes.filter((p) => p !== porte);
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
      key: "datas", label: `Abertura: ${de} → ${ate}`,
      onRemove: () => {
        onChange("dataAberturaDE", "");
        onChange("dataAberturaATE", "");
        removeFilter(["de", "ate"]);
      },
    });
  }
  return chips;
}

// ── Main FilterPanel ─────────────────────────────────────────────────────────

interface FilterPanelProps {
  filters: MapaFilterState;
  onChange: (key: keyof MapaFilterState, value: unknown) => void;
  onSearch: () => void;
  onClear: () => void;
  isLoading: boolean;
  count: number;
  countExact: boolean;
  /** Total exato calculado em background quando count bate no teto de 10.000 (ver useExactCount). */
  exactCount: number | null;
  isCalculatingExact: boolean;
  resultItems: CnpjMapItem[];
  removeFilter: (urlKeys: string[]) => void;
}

export function FilterPanel({
  filters,
  onChange,
  onSearch,
  onClear,
  isLoading,
  count,
  countExact,
  exactCount,
  isCalculatingExact,
  resultItems,
  removeFilter,
}: FilterPanelProps) {
  const chips = getChips(filters, onChange, removeFilter);
  const geocodedCount = resultItems.filter((c) => c.latitude !== null).length;
  const hasSearched = count > 0 || resultItems.length > 0;
  // A API exige escopo geográfico — no Mapa isso só pode vir da origem (não
  // há seletor de UF aqui, o sistema infere a UF a partir do raio).
  const hasOrigin = filters.lat !== null && filters.lng !== null;

  function handleOriginSelect(r: { lat: number; lng: number; label: string }) {
    onChange("lat", r.lat);
    onChange("lng", r.lng);
    onChange("label", r.label);
  }

  function handleOriginClear() {
    onChange("lat", null);
    onChange("lng", null);
    onChange("label", "");
  }

  return (
    <aside
      className="flex flex-col overflow-hidden"
      style={{
        width: 296,
        flexShrink: 0,
        borderRight: "1px solid var(--border)",
        background: "var(--surface)",
      }}
    >
      {/* ── Scrollable filter area ── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* Origem */}
        <div>
          <Label>Origem</Label>
          <PlaceAutocomplete
            value={filters.label}
            onSelect={handleOriginSelect}
            onClear={handleOriginClear}
          />
        </div>

        {/* Raio */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label>Raio de busca</Label>
            <span className="text-xs font-semibold tabular-nums" style={{ color: "var(--gr-teal)" }}>
              {filters.raioKm} km
            </span>
          </div>
          <input
            type="range"
            min={10}
            max={200}
            step={5}
            value={filters.raioKm}
            onChange={(e) => onChange("raioKm", parseInt(e.target.value, 10))}
            className="w-full h-2 rounded-full cursor-pointer appearance-none"
            style={{ accentColor: "var(--gr-teal)" }}
          />
          <div className="flex justify-between text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            <span>10 km</span>
            <span>200 km</span>
          </div>
        </div>

        <Divider />

        {/* Situação */}
        <div>
          <Label>Situação Cadastral</Label>
          <SelectField value={filters.situacao} onChange={(v) => onChange("situacao", v)}>
            <option value="">Todas</option>
            {SITUACOES.map((s) => <option key={s} value={s}>{s}</option>)}
          </SelectField>
        </div>

        {/* CNAE — Enter ou vírgula adiciona; múltiplos prefixos = OR */}
        <div>
          <Label>CNAE (prefixo)</Label>
          <TagInput
            values={filters.cnaePrefixos}
            onChange={(v) => onChange("cnaePrefixos", v)}
            placeholder="Ex: 6201, 4711-3…"
            width={264}
            transform={(raw) => raw.replace(/\D/g, "")}
          />
        </div>

        {/* Porte — múltiplos = OR */}
        <div>
          <Label>Porte</Label>
          <MultiSelectDropdown
            options={PORTES}
            selected={filters.portes}
            onChange={(v) => onChange("portes", v)}
            placeholder="Todos"
            width={264}
          />
        </div>

        {/* Setor — seção da CNAE 2.0. Um CNAE explícito acima tem precedência. */}
        <div>
          <Label>Setor</Label>
          <MultiSelectDropdown
            options={CNAE_SECAO_OPTIONS}
            selected={filters.cnaeSecoes}
            onChange={(v) => onChange("cnaeSecoes", v)}
            placeholder="Todos"
            width={264}
          />
        </div>

        {/* Natureza jurídica — separa empresário individual de empresa (2135) */}
        <div>
          <Label>Natureza jurídica</Label>
          <MultiSelectDropdown
            options={NATUREZA_JURIDICA_OPTIONS}
            selected={filters.naturezasJuridicas}
            onChange={(v) => onChange("naturezasJuridicas", v)}
            placeholder="Todas"
            width={264}
          />
        </div>

        {/* Tipo */}
        <div>
          <Label>Tipo</Label>
          <SelectField value={filters.matrizFilial} onChange={(v) => onChange("matrizFilial", v as MapaFilterState["matrizFilial"])}>
            <option value="">Ambos</option>
            <option value="MATRIZ">Matriz</option>
            <option value="FILIAL">Filial</option>
          </SelectField>
        </div>

        <Divider />

        {/* Checkboxes */}
        <div className="space-y-2.5">
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={filters.opcaoSimples}
              onChange={(e) => onChange("opcaoSimples", e.target.checked)}
              className="w-4 h-4 rounded"
              style={{ accentColor: "var(--gr-teal)" }}
            />
            <span className="text-sm" style={{ color: "var(--text)" }}>Simples Nacional</span>
          </label>
          {/* QSA: sócio em comum com outro CNPJ → conta de grupo, não lead avulso */}
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={filters.fazParteDeGrupo}
              onChange={(e) => onChange("fazParteDeGrupo", e.target.checked)}
              className="w-4 h-4 rounded"
              style={{ accentColor: "var(--gr-teal)" }}
            />
            <span className="text-sm" style={{ color: "var(--text)" }}>Em grupo econômico</span>
          </label>
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={filters.opcaoMei}
              onChange={(e) => onChange("opcaoMei", e.target.checked)}
              className="w-4 h-4 rounded"
              style={{ accentColor: "var(--gr-teal)" }}
            />
            <span className="text-sm" style={{ color: "var(--text)" }}>MEI</span>
          </label>
        </div>

        <Divider />

        {/* Período de abertura */}
        <div>
          <Label>Período de abertura</Label>
          <div className="flex gap-2">
            <div className="flex-1">
              <input
                type="date"
                value={filters.dataAberturaDE}
                onChange={(e) => onChange("dataAberturaDE", e.target.value)}
                className="w-full h-9 rounded-lg border px-2 text-xs focus:outline-none focus:ring-2 transition-shadow"
                style={{ borderColor: "var(--border)", color: "var(--text)" }}
              />
            </div>
            <div className="flex items-center text-xs" style={{ color: "var(--text-muted)" }}>até</div>
            <div className="flex-1">
              <input
                type="date"
                value={filters.dataAberturaATE}
                onChange={(e) => onChange("dataAberturaATE", e.target.value)}
                className="w-full h-9 rounded-lg border px-2 text-xs focus:outline-none focus:ring-2 transition-shadow"
                style={{ borderColor: "var(--border)", color: "var(--text)" }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Sticky bottom ── */}
      <div className="flex-shrink-0 border-t p-4 space-y-3" style={{ borderColor: "var(--border)" }}>

        {/* Active filter chips */}
        <FilterChips chips={chips} />

        {/* Buscar button */}
        <button
          type="button"
          onClick={onSearch}
          disabled={isLoading || !hasOrigin}
          title={hasOrigin ? undefined : "Defina uma origem para buscar"}
          className="w-full h-10 rounded-lg font-semibold text-sm text-white transition-opacity disabled:opacity-60"
          style={{ background: isLoading || !hasOrigin ? "var(--text-muted)" : "var(--gr-teal)" }}
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
              Buscando…
            </span>
          ) : "Buscar"}
        </button>

        {/* Limpar filtros */}
        <button
          type="button"
          onClick={onClear}
          className="w-full h-9 rounded-lg text-sm font-medium transition-colors hover:opacity-80"
          style={{ color: "var(--text-2)", background: "transparent", border: "1px solid var(--border)" }}
        >
          Limpar filtros
        </button>

        {/* Summary card */}
        {hasSearched && (
          <div
            className="rounded-lg px-3 py-2.5 text-center"
            style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
          >
            <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>
              {exactCount !== null
                ? exactCount.toLocaleString("pt-BR")
                : countExact
                  ? count.toLocaleString("pt-BR")
                  : `${count.toLocaleString("pt-BR")}+`}{" "}
              CNPJs encontrados
            </p>
            {!countExact && exactCount === null && (
              <p className="text-xs mt-0.5 flex items-center justify-center gap-1.5" style={{ color: "var(--text-muted)" }}>
                {isCalculatingExact && (
                  <svg className="w-3 h-3 animate-spin flex-shrink-0" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                )}
                calculando total exato…
              </p>
            )}
            {geocodedCount > 0 && (
              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                {geocodedCount.toLocaleString("pt-BR")} com localização no mapa
              </p>
            )}
            {geocodedCount === 0 && count > 0 && (
              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                Aguardando geocodificação
              </p>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
