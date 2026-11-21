"use client";

import { classificarTipoPessoa, type TipoPessoa } from "@radar/shared";
import { formatCnpj, getSituacaoColor } from "../../mapa/_components/utils";
import type { CnpjTableItem } from "./types";

// ── Tipo (empresário individual × empresa) ────────────────────────────────────

// Derivado no cliente a partir de natureza_juridica + opcao_mei pela MESMA
// função que o worker usa no CSV (@radar/shared) — uma única definição de
// classificação para as duas superfícies.
const TIPO_COLORS: Record<TipoPessoa, string> = {
  "Empresário Individual":        "#f59e0b",
  "Empresa (unipessoal)":         "#6366f1",
  "Empresa (sociedade)":          "#0ea5e9",
  MEI:                            "#a855f7",
  // Não-alvos de prospecção empresarial ficam em cinza, visualmente recuados.
  "Pessoa Física":                "#64748b",
  "Entidade sem fins lucrativos": "#94a3b8",
  "Administração Pública":        "#94a3b8",
  "Organização Internacional":    "#94a3b8",
  Indefinido:                     "#cbd5e1",
};

/** "Empresa (sociedade)" → "Sociedade" — a coluna é estreita. */
const TIPO_LABELS: Record<TipoPessoa, string> = {
  "Empresário Individual":        "Empr. Individual",
  "Empresa (unipessoal)":         "Unipessoal",
  "Empresa (sociedade)":          "Sociedade",
  MEI:                            "MEI",
  "Pessoa Física":                "Pessoa Física",
  "Entidade sem fins lucrativos": "Sem fins lucr.",
  "Administração Pública":        "Adm. Pública",
  "Organização Internacional":    "Org. Internac.",
  Indefinido:                     "—",
};

function TipoBadge({ tipo }: { tipo: TipoPessoa }) {
  const color = TIPO_COLORS[tipo];
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap"
      style={{ background: `${color}1a`, color, border: `1px solid ${color}44` }}
      title={tipo}
    >
      {TIPO_LABELS[tipo]}
    </span>
  );
}

const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

function formatCapital(value: string | null): string {
  if (value === null) return "—";
  const n = Number(value);
  return Number.isFinite(n) ? BRL.format(n) : "—";
}

// ── Situação badge ────────────────────────────────────────────────────────────

function SituacaoBadge({ situacao }: { situacao: string }) {
  const color = getSituacaoColor(situacao);
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap"
      style={{
        background: `${color}1a`,
        color,
        border: `1px solid ${color}44`,
      }}
    >
      {situacao || "—"}
    </span>
  );
}

// ── Skeleton row (loading state) ──────────────────────────────────────────────

function SkeletonRow({ idx }: { idx: number }) {
  const widths = ["4.5rem", "12rem", "7rem", "2rem", "7rem", "6rem", "4rem", "5rem", "4rem", "5rem", "2rem"];
  return (
    <tr style={{ borderBottom: "1px solid var(--border)" }}>
      {widths.map((w, j) => (
        <td key={j} className="px-4 py-3.5">
          <div
            className="h-3.5 rounded animate-pulse"
            style={{ background: "var(--border)", width: w, opacity: 1 - idx * 0.07 }}
          />
        </td>
      ))}
    </tr>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <tr>
      <td colSpan={11}>
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center"
            style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
          >
            <svg
              className="w-6 h-6"
              style={{ color: "var(--text-muted)" }}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path strokeLinecap="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
          </div>
          <div className="text-center">
            <p className="font-semibold" style={{ color: "var(--text)" }}>
              Nenhuma empresa encontrada
            </p>
            <p className="text-sm mt-1 max-w-xs" style={{ color: "var(--text-muted)" }}>
              Tente ampliar o raio de busca, remover algum filtro ou alterar a situação cadastral
            </p>
          </div>
        </div>
      </td>
    </tr>
  );
}

// ── Initial state ─────────────────────────────────────────────────────────────

function InitialState() {
  return (
    <tr>
      <td colSpan={11}>
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center"
            style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
          >
            <svg
              className="w-6 h-6"
              style={{ color: "var(--text-muted)" }}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0H5m-2 0h2M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <div className="text-center">
            <p className="font-semibold" style={{ color: "var(--text)" }}>
              Defina os filtros e clique em Buscar
            </p>
            <p className="text-sm mt-1 max-w-xs" style={{ color: "var(--text-muted)" }}>
              Use os filtros acima para encontrar empresas na base de 66M de CNPJs
            </p>
          </div>
        </div>
      </td>
    </tr>
  );
}

// ── Decisor ───────────────────────────────────────────────────────────────────

/** Nome próprio da Receita vem em CAIXA ALTA — "MARIA DE SOUZA" fica ilegível. */
function toTitleCase(nome: string): string {
  const minusculas = new Set(["de", "da", "do", "das", "dos", "e"]);
  return nome
    .toLocaleLowerCase("pt-BR")
    .split(/\s+/)
    .map((palavra, i) =>
      i > 0 && minusculas.has(palavra)
        ? palavra
        : palavra.charAt(0).toLocaleUpperCase("pt-BR") + palavra.slice(1)
    )
    .join(" ");
}

/**
 * Decisor + sinais de porte societário.
 *
 * LGPD: exibe nome e qualificação; nenhum CPF chega ao cliente (a API não
 * envia — ver socio-lookup.ts).
 */
function DecisorCell({ item }: { item: CnpjTableItem }) {
  if (item.socio_administrador === null) {
    return <span style={{ color: "var(--text-3)" }}>—</span>;
  }

  const extras: string[] = [];
  if (item.qtd_socios !== null && item.qtd_socios > 1) {
    extras.push(`${item.qtd_socios} sócios`);
  }
  if (item.grupo_tamanho !== null) {
    extras.push(`grupo de ${item.grupo_tamanho}`);
  }
  if (item.tem_socio_estrangeiro === true) extras.push("sócio estrangeiro");

  return (
    <div className="max-w-[190px]">
      <div className="truncate" title={item.qualificacao_admin ?? undefined}>
        {toTitleCase(item.socio_administrador)}
      </div>
      {extras.length > 0 && (
        <div className="truncate text-[10px]" style={{ color: "var(--text-3)" }}>
          {extras.join(" · ")}
        </div>
      )}
    </div>
  );
}

// ── CNAEs secundários ─────────────────────────────────────────────────────────

/**
 * Linha de apoio na célula de CNAE, em vez de coluna própria: a tabela já tem
 * 12 colunas, e a informação só faz sentido lida junto do principal.
 *
 * "Misto" é o sinal que interessa ao banker — atacadista que também vende no
 * varejo, indústria com loja. Vem pronto do servidor (atividade_mista), pela
 * mesma regra que o CSV exportado usa.
 */
function SecundariosLine({ item }: { item: CnpjTableItem }) {
  if (item.cnaes_secundarios.length === 0) return null;

  const qtd = item.cnaes_secundarios.length;
  return (
    <div className="flex items-center gap-1.5 mt-1">
      <span
        style={{ fontSize: 10, color: "var(--text-3)" }}
        title={`CNAEs secundários: ${item.cnaes_secundarios.join(", ")}`}
      >
        +{qtd} {qtd === 1 ? "atividade" : "atividades"}
      </span>
      {item.atividade_mista && (
        <span
          className="inline-flex items-center rounded px-1 py-px font-semibold"
          style={{
            fontSize: 9,
            background: "#f59e0b1a",
            color: "#b45309",
            border: "1px solid #f59e0b44",
          }}
          title="Atua dos dois lados do balcão: principal e secundário em categorias opostas (B2B × B2C)"
        >
          MISTO
        </span>
      )}
    </div>
  );
}

// ── Main table ────────────────────────────────────────────────────────────────

const COL_HEADERS = [
  "CNPJ", "Razão Social", "Município", "UF", "CNAE", "Setor", "Situação",
  "Tipo", "Decisor", "Porte", "Capital Social", "E-mail",
] as const;

interface CnpjTableProps {
  items: CnpjTableItem[];
  isLoading: boolean;
  count: number;
  countExact: boolean;
  /** Total exato calculado em background quando count bate no teto de 10.000 (ver useExactCount). */
  exactCount: number | null;
  page: number;
  limit: number;
  hasNext: boolean;
  hasPrev: boolean;
  searched: boolean;
  onNext: () => void;
  onPrev: () => void;
}

export function CnpjTable({
  items,
  isLoading,
  count,
  countExact,
  exactCount,
  page,
  limit,
  hasNext,
  hasPrev,
  searched,
  onNext,
  onPrev,
}: CnpjTableProps) {
  const showing = items.length;
  const from = (page - 1) * limit + 1;
  const to = (page - 1) * limit + showing;
  const totalLabel =
    exactCount !== null
      ? exactCount.toLocaleString("pt-BR")
      : countExact
        ? count.toLocaleString("pt-BR")
        : `${count.toLocaleString("pt-BR")}+`;

  return (
    <div className="flex flex-col overflow-hidden" style={{ flex: "1 1 0", minHeight: 0 }}>
      {/* ── Scrollable table area ── */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse">
          <thead
            className="sticky top-0 z-10"
            style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}
          >
            <tr>
              {COL_HEADERS.map((col) => (
                <th
                  key={col}
                  className="text-left px-4 py-3 whitespace-nowrap"
                  style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {isLoading ? (
              Array.from({ length: 12 }).map((_, i) => <SkeletonRow key={i} idx={i} />)
            ) : !searched ? (
              <InitialState />
            ) : showing === 0 ? (
              <EmptyState />
            ) : (
              items.map((item, idx) => (
                <tr
                  key={item.id}
                  className="group transition-colors cursor-default"
                  style={{
                    background: idx % 2 === 1 ? "rgba(0,0,0,0.018)" : "transparent",
                    borderBottom: "1px solid var(--border)",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "rgba(0,191,165,0.06)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background =
                      idx % 2 === 1 ? "rgba(0,0,0,0.018)" : "transparent";
                  }}
                >
                  {/* CNPJ */}
                  <td className="px-4 py-3 font-mono whitespace-nowrap" style={{ fontSize: 12, color: "var(--text-2)" }}>
                    {formatCnpj(item.cnpj)}
                  </td>

                  {/* Razão Social */}
                  <td className="px-4 py-3" style={{ maxWidth: 280 }}>
                    <p className="truncate text-sm font-medium" style={{ color: "var(--text)" }}>
                      {item.razao_social}
                    </p>
                    {item.nome_fantasia && (
                      <p className="truncate mt-0.5" style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        {item.nome_fantasia}
                      </p>
                    )}
                  </td>

                  {/* Município */}
                  <td className="px-4 py-3 text-sm whitespace-nowrap" style={{ color: "var(--text-2)" }}>
                    {item.municipio_nome}
                  </td>

                  {/* UF */}
                  <td className="px-4 py-3 font-mono" style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {item.uf}
                  </td>

                  {/* CNAE — código + denominação da subclasse */}
                  <td className="px-4 py-3" style={{ maxWidth: 240 }}>
                    <p className="font-mono whitespace-nowrap" style={{ fontSize: 12, color: "var(--text-2)" }}>
                      {item.cnae_principal}
                    </p>
                    {item.cnae_descricao && (
                      <p
                        className="truncate mt-0.5"
                        style={{ fontSize: 11, color: "var(--text-muted)" }}
                        title={item.cnae_descricao}
                      >
                        {item.cnae_descricao}
                      </p>
                    )}
                    <SecundariosLine item={item} />
                  </td>

                  {/* Setor — seção da CNAE 2.0 */}
                  <td className="px-4 py-3" style={{ maxWidth: 150 }}>
                    <p
                      className="truncate text-xs"
                      style={{ color: "var(--text-2)" }}
                      title={item.cnae_divisao ?? undefined}
                    >
                      {item.cnae_secao ?? "—"}
                    </p>
                  </td>

                  {/* Situação */}
                  <td className="px-4 py-3">
                    <SituacaoBadge situacao={item.situacao} />
                  </td>

                  {/* Tipo */}
                  <td className="px-4 py-3">
                    <TipoBadge tipo={classificarTipoPessoa(item.natureza_juridica, item.opcao_mei)} />
                  </td>

                  {/* Decisor — nome do sócio administrador (sem CPF) */}
                  <td className="px-4 py-3 text-xs" style={{ color: "var(--text-2)" }}>
                    <DecisorCell item={item} />
                  </td>

                  {/* Porte */}
                  <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: "var(--text-2)" }}>
                    {item.porte ?? "—"}
                  </td>

                  {/* Capital Social */}
                  <td
                    className="px-4 py-3 text-xs whitespace-nowrap tabular-nums"
                    style={{ color: "var(--text-2)" }}
                    title={item.natureza_juridica ?? undefined}
                  >
                    {formatCapital(item.capital_social)}
                  </td>

                  {/* E-mail */}
                  <td className="px-4 py-3">
                    {item.email ? (
                      <svg
                        className="w-4 h-4"
                        style={{ color: "var(--success)" }}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2.5}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    ) : (
                      <span style={{ color: "var(--text-muted)" }}>—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Pagination footer ── */}
      {searched && !isLoading && showing > 0 && (
        <div
          className="flex-shrink-0 flex items-center justify-between px-4 py-3"
          style={{ borderTop: "1px solid var(--border)", background: "var(--surface)" }}
        >
          <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
            Mostrando{" "}
            <span style={{ color: "var(--text-2)", fontWeight: 600 }}>
              {from.toLocaleString("pt-BR")}–{to.toLocaleString("pt-BR")}
            </span>{" "}
            de{" "}
            <span style={{ color: "var(--text-2)", fontWeight: 600 }}>{totalLabel}</span>{" "}
            registros
          </p>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onPrev}
              disabled={!hasPrev}
              className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ border: "1px solid var(--border)", color: "var(--text-2)", background: "transparent" }}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M15 18l-6-6 6-6" />
              </svg>
              Anterior
            </button>

            <span
              className="px-3 h-8 flex items-center text-xs tabular-nums rounded-lg"
              style={{ background: "var(--bg)", color: "var(--text-2)", border: "1px solid var(--border)" }}
            >
              Página {page}
            </span>

            <button
              type="button"
              onClick={onNext}
              disabled={!hasNext}
              className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ border: "1px solid var(--border)", color: "var(--text-2)", background: "transparent" }}
            >
              Próxima
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
