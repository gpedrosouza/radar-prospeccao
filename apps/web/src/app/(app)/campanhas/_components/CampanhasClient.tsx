"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTopbarActions } from "@/components/layout/TopbarActionsProvider";
import type { RecipientStats } from "@/server/repositories/email-campaign.repository";
import { DEFAULT_CAMPAIGN_SUBJECT, DEFAULT_CAMPAIGN_BODY } from "./defaultTemplate";
import { REFERRAL_CAMPAIGN_SUBJECT, REFERRAL_CAMPAIGN_BODY } from "./referralTemplate";
import { RELATIONSHIP_CAMPAIGN_SUBJECT, RELATIONSHIP_CAMPAIGN_BODY } from "./relationshipTemplate";
import { MAQUININHA_CAMPAIGN_SUBJECT, MAQUININHA_CAMPAIGN_BODY } from "./maquininhaTemplate";
import { CROSSSELL_CAMPAIGN_SUBJECT, CROSSSELL_CAMPAIGN_BODY } from "./crossSellTemplate";

// ── Modelos de e-mail ─────────────────────────────────────────────────────────

type Modelo = "padrao" | "indicacao" | "relacionamento" | "maquininha" | "crosssell";

const MODELOS: Array<{ id: Modelo; label: string; desc: string; subject: string; body: string }> = [
  { id: "padrao",        label: "Primeiro contato", desc: "Prospecção fria padrão (aquecimento).",           subject: DEFAULT_CAMPAIGN_SUBJECT,      body: DEFAULT_CAMPAIGN_BODY },
  { id: "indicacao",     label: "Indicação",        desc: "Lead indicado por um cliente fidelizado.",         subject: REFERRAL_CAMPAIGN_SUBJECT,     body: REFERRAL_CAMPAIGN_BODY },
  { id: "relacionamento",label: "Relacionamento",   desc: "Contato direto por relação prévia via banco.",     subject: RELATIONSHIP_CAMPAIGN_SUBJECT, body: RELATIONSHIP_CAMPAIGN_BODY },
  { id: "maquininha",    label: "Maquininha",       desc: "B2C: antecipação de cartão e trava de domicílio.", subject: MAQUININHA_CAMPAIGN_SUBJECT,   body: MAQUININHA_CAMPAIGN_BODY },
  { id: "crosssell",     label: "Cross-sell",       desc: "Atividade mista: FIDC + maquininha na mesma peça.", subject: CROSSSELL_CAMPAIGN_SUBJECT,    body: CROSSSELL_CAMPAIGN_BODY },
];

// ── Types exported for the server component ───────────────────────────────────

export interface SerializedCampaign {
  id: string;
  nome: string;
  status: string;
  total_destinatarios: number;
  total_enviados: number;
  total_bounces: number;
  criado_em: string;
  enviado_em: string | null;
  stats: RecipientStats;
}

export interface ExportJobOption {
  id: string;
  filtros: Record<string, unknown>;
  linhas: number;
  criado_em: string;
}

interface Props {
  campaigns: SerializedCampaign[];
  exportJobs: ExportJobOption[];
  initialParams: Record<string, string>;
  emailSendDelay: number;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function urlParamsToFiltros(params: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const lat = params.lat ? parseFloat(params.lat) : null;
  const lng = params.lng ? parseFloat(params.lng) : null;
  const raio = params.raio ? parseInt(params.raio, 10) : null;
  if (lat && lng && raio) { out.lat = lat; out.lng = lng; out.raio_km = raio; }
  if (params.uf) out.uf = params.uf;
  if (params.cidade) out.municipio_nome = params.cidade;
  if (params.sit) out.situacao = params.sit;
  if (params.cnae) out.cnae_prefixo = params.cnae;
  if (params.porte) out.porte = params.porte;
  if (params.tipo && ["MATRIZ", "FILIAL"].includes(params.tipo)) out.matriz_filial = params.tipo;
  if (params.simples === "true") out.opcao_simples = true;
  if (params.mei === "true") out.opcao_mei = true;
  if (params.de) out.data_abertura_de = params.de;
  if (params.ate) out.data_abertura_ate = params.ate;
  return out;
}

function hasUrlFilters(params: Record<string, string>): boolean {
  return !!(params.lat || params.uf || params.cidade || params.sit || params.cnae);
}

function describeFilters(filtros: Record<string, unknown>): string {
  const parts: string[] = [];
  if (filtros.uf) parts.push(`UF: ${filtros.uf}`);
  if (filtros.municipio_nome) parts.push(`Cidade: ${filtros.municipio_nome}`);
  if (filtros.situacao) parts.push(String(filtros.situacao));
  if (filtros.cnae_prefixo) parts.push(`CNAE: ${filtros.cnae_prefixo}`);
  if (filtros.porte) parts.push(String(filtros.porte));
  if (filtros.lat) parts.push("Raio geográfico");
  if (filtros.opcao_simples) parts.push("Simples Nacional");
  if (filtros.opcao_mei) parts.push("MEI");
  return parts.join(" · ") || "Todos os registros";
}

function describeJobFiltros(filtros: Record<string, unknown>): string {
  return describeFilters(filtros);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

function formatPct(num: number, total: number): string {
  if (total === 0) return "0%";
  return `${((num / total) * 100).toFixed(1)}%`;
}

// ── LGPD Warning ──────────────────────────────────────────────────────────────

function LGPDWarning() {
  return (
    <div
      className="flex gap-3 rounded-xl p-4"
      style={{
        background: "rgba(245, 158, 11, 0.08)",
        border: "1px solid rgba(245, 158, 11, 0.35)",
      }}
    >
      <div className="mt-0.5 flex-shrink-0" style={{ color: "var(--warning)" }}>
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      </div>
      <div>
        <p className="text-sm font-semibold" style={{ color: "var(--warning)" }}>
          Atenção LGPD
        </p>
        <p className="text-xs mt-1 leading-relaxed" style={{ color: "var(--text-2)" }}>
          Confirme conformidade legal antes do disparo. E-mails da Receita Federal foram fornecidos para fins
          cadastrais, não para marketing direto. O uso para campanhas comerciais requer base legal válida (art. 7º LGPD).
        </p>
      </div>
    </div>
  );
}

// ── Variable Chips ────────────────────────────────────────────────────────────

const TEMPLATE_VARS = [
  { label: "Razão Social",   token: "{{razao_social}}" },
  { label: "Nome Fantasia",  token: "{{nome_fantasia}}" },
  { label: "CNPJ",           token: "{{cnpj_formatado}}" },
  { label: "Município",      token: "{{municipio_nome}}" },
  { label: "UF",             token: "{{uf}}" },
  { label: "CNAE",           token: "{{cnae_principal}}" },
  { label: "Indicado por",   token: "{{indicado_por_nome}}" },
  { label: "Empresa indicadora", token: "{{indicado_por_empresa}}" },
  { label: "Responsável",    token: "{{responsavel_nome}}" },
  { label: "Banco (relacionamento)", token: "{{banco_relacionamento}}" },
  { label: "Descadastro",    token: "{{link_descadastro}}" },
];

function VariableChips({ onInsert }: { onInsert: (token: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5 pt-1">
      <span className="text-xs self-center" style={{ color: "var(--text-muted)" }}>Inserir:</span>
      {TEMPLATE_VARS.map(({ label, token }) => (
        <button
          key={token}
          type="button"
          onClick={() => onInsert(token)}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all hover:opacity-80"
          style={{
            background: "rgba(0, 191, 165, 0.10)",
            color: "var(--gr-teal)",
            border: "1px solid rgba(0, 191, 165, 0.30)",
          }}
          title={token}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ── Stat Mini-Card ────────────────────────────────────────────────────────────

function StatMiniCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div
      className="flex-1 rounded-xl p-3 text-center"
      style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
    >
      <p
        className="text-base font-bold tabular-nums"
        style={{ color: color ?? "var(--gr-teal)" }}
      >
        {value}
      </p>
      <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
        {label}
      </p>
    </div>
  );
}

// ── Campaign Status Badge ─────────────────────────────────────────────────────

const CAMPAIGN_STATUS: Record<string, { label: string; color: string }> = {
  rascunho:  { label: "Rascunho",  color: "var(--text-muted)" },
  agendada:  { label: "Agendada",  color: "var(--warning)" },
  enviando:  { label: "Enviando…", color: "var(--warning)" },
  concluida: { label: "Concluída", color: "var(--success)" },
  falhou:    { label: "Falhou",    color: "var(--danger)" },
};

function CampaignStatusBadge({ status }: { status: string }) {
  const cfg = CAMPAIGN_STATUS[status] ?? { label: status, color: "var(--text-muted)" };
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold flex-shrink-0"
      style={{
        color: cfg.color,
        background: `${cfg.color}1a`,
        border: `1px solid ${cfg.color}40`,
      }}
    >
      {status === "enviando" && (
        <svg className="w-2.5 h-2.5 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
        </svg>
      )}
      {cfg.label}
    </span>
  );
}

// ── Campaign Card ─────────────────────────────────────────────────────────────

function CampaignCard({ campaign }: { campaign: SerializedCampaign }) {
  const base = campaign.total_enviados > 0 ? campaign.total_enviados : campaign.total_destinatarios;

  return (
    <div
      className="rounded-2xl overflow-hidden transition-shadow hover:shadow-md"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <div className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate" style={{ color: "var(--text)" }}>
              {campaign.nome}
            </p>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
              {formatDate(campaign.criado_em)}
              {campaign.total_enviados > 0 && ` · ${campaign.total_enviados.toLocaleString("pt-BR")} enviados`}
            </p>
          </div>
          <CampaignStatusBadge status={campaign.status} />
        </div>

        {/* Stats mini-cards */}
        {(campaign.status === "concluida" || campaign.status === "enviando") && (
          <div className="flex gap-2">
            <StatMiniCard
              label="Taxa de Abertura"
              value={formatPct(campaign.stats.abertos, base)}
              color="var(--gr-teal)"
            />
            <StatMiniCard
              label="Taxa de Clique"
              value={formatPct(campaign.stats.clicados, base)}
              color="#6366f1"
            />
            <StatMiniCard
              label="Taxa de Resposta"
              value={formatPct(campaign.stats.respondidos, base)}
              color="var(--success)"
            />
          </div>
        )}

        {/* Bounce indicator */}
        {campaign.total_bounces > 0 && (
          <p className="text-xs" style={{ color: "var(--danger)" }}>
            {campaign.total_bounces} bounce{campaign.total_bounces > 1 ? "s" : ""} registrado{campaign.total_bounces > 1 ? "s" : ""}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Config Card ───────────────────────────────────────────────────────────────

function ConfigCard({ delay }: { delay: number }) {
  return (
    <div
      className="rounded-2xl p-4 space-y-3"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
        Configuração de Envio
      </p>
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Provider",     value: "Resend" },
          { label: "Delay/e-mail", value: `${delay}ms` },
          { label: "SPF/DKIM",     value: "Verificar painel" },
          { label: "DMARC",        value: "Verificar painel" },
        ].map(({ label, value }) => (
          <div key={label}>
            <p style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {label}
            </p>
            <p className="text-xs font-medium mt-0.5" style={{ color: "var(--text-2)" }}>
              {value}
            </p>
          </div>
        ))}
      </div>
      <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
        Remetente configurado via <code className="text-xs">RESEND_FROM_EMAIL</code>.
        Verifique SPF, DKIM e DMARC no painel do Resend antes do primeiro disparo.
      </p>
    </div>
  );
}

// ── Confirm Modal ─────────────────────────────────────────────────────────────

interface ConfirmModalProps {
  count: number;
  onConfirm: () => void;
  onCancel: () => void;
  sending: boolean;
}

function ConfirmModal({ count, onConfirm, onCancel, sending }: ConfirmModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div
        className="w-full max-w-md rounded-2xl shadow-2xl p-6 space-y-5"
        style={{ background: "var(--surface)" }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(245, 158, 11, 0.1)" }}
          >
            <svg className="w-5 h-5" style={{ color: "var(--warning)" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
            </svg>
          </div>
          <div>
            <h3 className="font-semibold" style={{ color: "var(--text)" }}>Confirmar Disparo</h3>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>Esta ação não pode ser desfeita</p>
          </div>
        </div>

        <div
          className="rounded-xl p-4"
          style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
        >
          <p className="text-sm" style={{ color: "var(--text-2)" }}>
            Você está prestes a enviar para{" "}
            <span className="font-bold" style={{ color: "var(--text)" }}>
              {count.toLocaleString("pt-BR")} destinatários
            </span>
            . O envio ocorrerá em lotes com delay configurado e pode levar vários minutos.
          </p>
        </div>

        <LGPDWarning />

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onCancel}
            disabled={sending}
            className="flex-1 h-10 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
            style={{ border: "1px solid var(--border)", color: "var(--text-2)", background: "var(--surface)" }}
          >
            Cancelar (manter rascunho)
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={sending}
            className="flex-1 h-10 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: "var(--gr-teal)" }}
          >
            {sending ? "Disparando…" : "✉ Confirmar Disparo"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Preview Modal ─────────────────────────────────────────────────────────────

interface PreviewModalProps {
  subject: string;
  body: string;
  onClose: () => void;
}

const SAMPLE_VARS: Record<string, string> = {
  razao_social:    "GR Gestão Financeira LTDA",
  nome_fantasia:   "GR Gestão Financeira",
  cnpj:            "00000000000191",
  cnpj_formatado:  "00.000.000/0001-91",
  municipio_nome:  "São Carlos",
  uf:              "SP",
  cnae_principal:  "6612000",
  indicado_por_nome:    "João Silva",
  indicado_por_empresa: "Metalúrgica Silva",
  responsavel_nome:     "Carlos Souza",
  banco_relacionamento: "Daycoval",
  link_descadastro: "https://radar.grgestaofinanceira.com.br/api/unsubscribe?token=exemplo",
};

function renderWithSamples(template: string): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => SAMPLE_VARS[key] ?? `{{${key}}}`);
}

/** Detecta se o corpo é HTML (contém ao menos uma tag). */
function bodyLooksLikeHtml(body: string): boolean {
  return /<[a-z][\s\S]*?>/i.test(body);
}

function PreviewModal({ subject, body, onClose }: PreviewModalProps) {
  const renderedSubject = renderWithSamples(subject);
  const renderedBody = renderWithSamples(body);
  const isHtmlBody = bodyLooksLikeHtml(body);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div
        className="w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ background: "var(--surface)", maxHeight: "80vh" }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 flex-shrink-0"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <div>
            <p className="font-semibold" style={{ color: "var(--text)" }}>Pré-visualização do E-mail</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
              Dados de exemplo: GR Gestão Financeira LTDA · São Carlos/SP
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors hover:opacity-70"
            style={{ color: "var(--text-muted)" }}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Email preview */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div
            className="rounded-xl overflow-hidden"
            style={{ border: "1px solid var(--border)" }}
          >
            {/* Email header */}
            <div
              className="px-4 py-3 space-y-1.5"
              style={{ background: "var(--bg)", borderBottom: "1px solid var(--border)" }}
            >
              <div className="flex gap-2">
                <span className="text-xs w-14 text-right flex-shrink-0" style={{ color: "var(--text-muted)" }}>De:</span>
                <span className="text-xs font-medium" style={{ color: "var(--text)" }}>
                  GR Gestão Financeira &lt;contato@grgestaofinanceira.com.br&gt;
                </span>
              </div>
              <div className="flex gap-2">
                <span className="text-xs w-14 text-right flex-shrink-0" style={{ color: "var(--text-muted)" }}>Para:</span>
                <span className="text-xs" style={{ color: "var(--text-2)" }}>contato@grfinanceira.com.br</span>
              </div>
              <div className="flex gap-2">
                <span className="text-xs w-14 text-right flex-shrink-0" style={{ color: "var(--text-muted)" }}>Assunto:</span>
                <span className="text-xs font-semibold" style={{ color: "var(--text)" }}>{renderedSubject || "(sem assunto)"}</span>
              </div>
            </div>

            {/* Email body — HTML renderiza em iframe isolado; texto puro no <pre> */}
            {isHtmlBody ? (
              <iframe
                title="Pré-visualização do corpo do e-mail"
                srcDoc={renderedBody}
                sandbox=""
                className="w-full bg-white"
                style={{ border: 0, height: 520 }}
              />
            ) : (
              <div className="p-5 bg-white">
                <pre
                  className="text-sm whitespace-pre-wrap leading-relaxed"
                  style={{ color: "#1a202c", fontFamily: "inherit", margin: 0 }}
                >
                  {renderedBody || "(corpo vazio)"}
                </pre>
              </div>
            )}
          </div>
        </div>

        <div
          className="flex justify-end px-5 py-4 flex-shrink-0"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <button
            type="button"
            onClick={onClose}
            className="px-4 h-9 rounded-xl text-sm font-medium transition-colors hover:opacity-80"
            style={{ border: "1px solid var(--border)", color: "var(--text-2)", background: "var(--surface)" }}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function CampanhasClient({ campaigns, exportJobs, initialParams, emailSendDelay }: Props) {
  const router = useRouter();
  const { setActions } = useTopbarActions();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // ── Form state ────────────────────────────────────────────────────────────
  const [nome, setNome] = useState("");
  const [modelo, setModelo] = useState<Modelo>("padrao");
  const [assunto, setAssunto] = useState(DEFAULT_CAMPAIGN_SUBJECT);
  const [corpo, setCorpo] = useState(DEFAULT_CAMPAIGN_BODY);
  // Campanhas por indicação: contato em comum (nível de campanha). Vazio = não é indicação.
  const [indicadoPorNome, setIndicadoPorNome] = useState("");
  const [indicadoPorEmpresa, setIndicadoPorEmpresa] = useState("");
  // Campanhas por relacionamento: banco do relacionamento (nível de campanha).
  const [banco, setBanco] = useState("Daycoval");
  const [selectedJobId, setSelectedJobId] = useState<string>("");

  // ── Test-send / Import state ────────────────────────────────────────────────
  const [showTest, setShowTest] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [testing, setTesting] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importNome, setImportNome] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ created: Array<{ modelo: string; total: number; suprimidos: number }>; skipped: Array<{ linha: number; motivo: string }>; totalValidas: number; duplicadas: number } | null>(null);
  const [selectedBase, setSelectedBase] = useState<{
    filtros: Record<string, unknown>;
    label: string;
    linhas?: number;
    source: "url" | "export-job";
  } | null>(null);

  // ── UI state ──────────────────────────────────────────────────────────────
  const [showPreview, setShowPreview] = useState(false);
  const [confirmData, setConfirmData] = useState<{ campaignId: string; count: number } | null>(null);
  const [creating, setCreating] = useState(false);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [bodyView, setBodyView] = useState<"code" | "preview">("code");

  // ── Auto-select base from URL params ──────────────────────────────────────
  useEffect(() => {
    if (hasUrlFilters(initialParams)) {
      const filtros = urlParamsToFiltros(initialParams);
      setSelectedBase({
        filtros,
        label: describeFilters(filtros),
        source: "url",
      });
    }
    // Roda uma vez no mount — initialParams é estável (vem de um Server Component).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Topbar ────────────────────────────────────────────────────────────────
  useEffect(() => {
    setActions(null);
    return () => setActions(null);
  }, [setActions]);

  // ── Insert template variable at textarea cursor ───────────────────────────
  function insertAtCursor(token: string) {
    const ta = textareaRef.current;
    if (!ta) { setCorpo((p) => p + token); return; }
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? ta.value.length;
    const newVal = ta.value.slice(0, start) + token + ta.value.slice(end);
    setCorpo(newVal);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + token.length, start + token.length);
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function showToast(msg: string, type: "success" | "error") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 5000);
  }

  function isFormValid() {
    return nome.trim() && assunto.trim() && corpo.trim() && selectedBase !== null;
  }

  // ── Create campaign (draft) ───────────────────────────────────────────────
  async function handleCreateDraft(): Promise<{ id: string; count: number } | null> {
    if (!selectedBase) return null;
    setCreating(true);
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: nome.trim(),
          filtros_origem: selectedBase.filtros,
          assunto: assunto.trim(),
          corpo_template: corpo.trim(),
          indicado_por_nome: modelo === "indicacao" ? (indicadoPorNome.trim() || null) : null,
          indicado_por_empresa: modelo === "indicacao" ? (indicadoPorEmpresa.trim() || null) : null,
          banco_relacionamento: modelo === "relacionamento" ? (banco.trim() || null) : null,
        }),
      });
      const data = (await res.json()) as { id?: string; total_destinatarios?: number; error?: string; detail?: string };
      if (!res.ok) {
        showToast(data.detail ?? data.error ?? `Erro HTTP ${res.status}`, "error");
        return null;
      }
      return { id: data.id!, count: data.total_destinatarios ?? 0 };
    } catch {
      showToast("Erro ao criar campanha. Verifique sua conexão.", "error");
      return null;
    } finally {
      setCreating(false);
    }
  }

  async function handleSaveDraft() {
    const result = await handleCreateDraft();
    if (result) {
      showToast("Rascunho salvo com sucesso!", "success");
      router.refresh();
    }
  }

  async function handleSendClick() {
    const result = await handleCreateDraft();
    if (result) {
      setConfirmData({ campaignId: result.id, count: result.count });
    }
  }

  async function handleConfirmSend() {
    if (!confirmData) return;
    setSending(true);
    try {
      const res = await fetch(`/api/campaigns/${confirmData.campaignId}/send`, { method: "POST" });
      const data = (await res.json()) as { error?: string; detail?: string };
      if (!res.ok) {
        showToast(data.detail ?? data.error ?? `Erro HTTP ${res.status}`, "error");
      } else {
        showToast("Campanha disparada! Os e-mails serão enviados em lotes.", "success");
        setNome(""); setAssunto(DEFAULT_CAMPAIGN_SUBJECT); setCorpo(DEFAULT_CAMPAIGN_BODY); setSelectedBase(null);
        setIndicadoPorNome(""); setIndicadoPorEmpresa("");
        router.refresh();
      }
    } catch {
      showToast("Erro ao disparar campanha.", "error");
    } finally {
      setSending(false);
      setConfirmData(null);
    }
  }

  // ── Model selector ──────────────────────────────────────────────────────────
  function applyModelo(m: Modelo) {
    setModelo(m);
    const cfg = MODELOS.find((x) => x.id === m)!;
    setAssunto(cfg.subject);
    setCorpo(cfg.body);
  }

  // ── Enviar teste ────────────────────────────────────────────────────────────
  async function handleTestSend() {
    if (!testEmail.trim() || !corpo.trim()) return;
    setTesting(true);
    try {
      const res = await fetch("/api/campaigns/test-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assunto: assunto.trim(), corpo: corpo.trim(), para: testEmail.trim() }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; detail?: string };
      if (!res.ok || !data.ok) {
        showToast(data.detail ?? data.error ?? `Erro HTTP ${res.status}`, "error");
      } else {
        showToast(`E-mail de teste enviado para ${testEmail.trim()}.`, "success");
        setShowTest(false);
      }
    } catch {
      showToast("Erro ao enviar teste. Verifique sua conexão.", "error");
    } finally {
      setTesting(false);
    }
  }

  // ── Importar planilha ─────────────────────────────────────────────────────────
  async function handleImport() {
    if (!importFile || !importNome.trim()) return;
    setImporting(true);
    setImportResult(null);
    try {
      const fd = new FormData();
      fd.append("file", importFile);
      fd.append("nome", importNome.trim());
      if (modelo === "relacionamento" && banco.trim()) fd.append("banco", banco.trim());
      if (modelo === "indicacao") {
        if (indicadoPorNome.trim()) fd.append("indicante_nome", indicadoPorNome.trim());
        if (indicadoPorEmpresa.trim()) fd.append("indicante_empresa", indicadoPorEmpresa.trim());
      }
      const res = await fetch("/api/campaigns/import", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.detail ?? data.error ?? `Erro HTTP ${res.status}`, "error");
        return;
      }
      setImportResult(data);
      const n = data.created?.reduce((s: number, c: { total: number }) => s + c.total, 0) ?? 0;
      showToast(`Importado: ${data.created?.length ?? 0} campanha(s), ${n} destinatários.`, "success");
      router.refresh();
    } catch {
      showToast("Erro ao importar planilha.", "error");
    } finally {
      setImporting(false);
    }
  }

  const isSubmitting = creating || sending;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 flex overflow-hidden" style={{ height: "calc(100vh - 64px)" }}>
      {/* ── Left panel: New campaign form ── */}
      <div
        className="flex flex-col overflow-y-auto flex-shrink-0"
        style={{ width: 700, borderRight: "1px solid var(--border)" }}
      >
        <div className="p-6 space-y-5">
          {/* Section header */}
          <div>
            <h2 className="text-base font-semibold" style={{ color: "var(--text)" }}>Nova Campanha</h2>
            <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
              Preencha os dados e selecione a base de destinatários antes de disparar.
            </p>
          </div>

          {/* ── Modelo de e-mail ── */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium" style={{ color: "var(--text-2)" }}>
              Modelo de e-mail
            </label>
            <div className="grid grid-cols-3 gap-2">
              {MODELOS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => applyModelo(m.id)}
                  className="rounded-xl px-3 py-2.5 text-left transition-all"
                  style={{
                    background: modelo === m.id ? "rgba(0,191,165,0.08)" : "var(--surface)",
                    border: `1px solid ${modelo === m.id ? "var(--gr-teal)" : "var(--border)"}`,
                  }}
                >
                  <p className="text-sm font-medium" style={{ color: modelo === m.id ? "var(--gr-teal)" : "var(--text)" }}>
                    {m.label}
                  </p>
                  <p className="text-xs mt-0.5 leading-snug" style={{ color: "var(--text-muted)" }}>{m.desc}</p>
                </button>
              ))}
            </div>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Selecionar um modelo carrega o assunto e o corpo correspondentes. Você pode editar depois.
            </p>
          </div>

          {/* ── Nome da Campanha ── */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium" style={{ color: "var(--text-2)" }}>
              Nome da Campanha
            </label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Prospecção Empresas SP — Junho 2026"
              className="w-full h-10 rounded-xl px-3 text-sm outline-none transition-all"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                color: "var(--text)",
              }}
            />
          </div>

          {/* ── Base de Destinatários ── */}
          <div className="space-y-2">
            <label className="text-sm font-medium" style={{ color: "var(--text-2)" }}>
              Base de Destinatários
            </label>

            {/* URL-params option (if coming from /cnpjs) */}
            {hasUrlFilters(initialParams) && (
              <button
                type="button"
                onClick={() => {
                  const filtros = urlParamsToFiltros(initialParams);
                  setSelectedBase({ filtros, label: describeFilters(filtros), source: "url" });
                }}
                className="w-full rounded-xl px-4 py-3 text-left transition-all"
                style={{
                  background: selectedBase?.source === "url" ? "rgba(0,191,165,0.08)" : "var(--surface)",
                  border: `1px solid ${selectedBase?.source === "url" ? "var(--gr-teal)" : "var(--border)"}`,
                }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
                      ● Filtros da busca atual
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                      {describeFilters(urlParamsToFiltros(initialParams))}
                    </p>
                  </div>
                  {selectedBase?.source === "url" && (
                    <svg className="w-4 h-4 flex-shrink-0" style={{ color: "var(--gr-teal)" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/>
                    </svg>
                  )}
                </div>
              </button>
            )}

            {/* Export jobs dropdown */}
            {exportJobs.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Ou selecione uma exportação anterior:
                </p>
                <select
                  className="w-full h-10 rounded-xl px-3 text-sm outline-none transition-all appearance-none"
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    color: "var(--text)",
                  }}
                  value={selectedJobId}
                  onChange={(e) => {
                    setSelectedJobId(e.target.value);
                    const job = exportJobs.find((j) => j.id === e.target.value);
                    if (!job) { setSelectedBase(null); return; }
                    setSelectedBase({
                      filtros: job.filtros,
                      label: `${describeJobFiltros(job.filtros)} — ${job.linhas.toLocaleString("pt-BR")} registros`,
                      linhas: job.linhas,
                      source: "export-job",
                    });
                  }}
                >
                  <option value="">Selecionar exportação…</option>
                  {exportJobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {describeJobFiltros(j.filtros)} — {j.linhas.toLocaleString("pt-BR")} registros ({formatDate(j.criado_em)})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* No base available */}
            {!hasUrlFilters(initialParams) && exportJobs.length === 0 && (
              <div
                className="rounded-xl px-4 py-3 text-sm"
                style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text-muted)" }}
              >
                Nenhuma base disponível. Faça uma busca em{" "}
                <a href="/cnpjs" className="underline" style={{ color: "var(--gr-teal)" }}>CNPJs</a>{" "}
                e clique em &ldquo;Campanha&rdquo; no topo para pré-selecionar os filtros, ou crie uma exportação primeiro.
              </div>
            )}

            {/* Selected base summary */}
            {selectedBase && (
              <div
                className="flex items-center justify-between rounded-xl px-3 py-2"
                style={{ background: "rgba(0,191,165,0.06)", border: "1px solid rgba(0,191,165,0.2)" }}
              >
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate" style={{ color: "var(--gr-teal)" }}>
                    {selectedBase.label}
                  </p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {selectedBase.linhas
                      ? `${selectedBase.linhas.toLocaleString("pt-BR")} registros · `
                      : ""}
                    cobertura de e-mail calculada no momento do envio
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => { setSelectedBase(null); setSelectedJobId(""); }}
                  className="ml-2 flex-shrink-0 opacity-60 hover:opacity-100"
                  style={{ color: "var(--text-muted)" }}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M18 6L6 18M6 6l12 12"/>
                  </svg>
                </button>
              </div>
            )}
          </div>

          {/* ── Assunto ── */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium" style={{ color: "var(--text-2)" }}>
              Assunto do E-mail
            </label>
            <input
              type="text"
              value={assunto}
              onChange={(e) => setAssunto(e.target.value)}
              placeholder="Ex: Oportunidade de parceria para {{razao_social}}"
              className="w-full h-10 rounded-xl px-3 text-sm outline-none transition-all"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                color: "var(--text)",
              }}
            />
          </div>

          {/* ── Indicação (modelo indicação) ── */}
          {modelo === "indicacao" && (
          <div
            className="rounded-xl p-4 space-y-3"
            style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
          >
            <div className="space-y-0.5">
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                Indicação
              </p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Contato em comum que indicou os leads. Usa{" "}
                <code>{"{{indicado_por_nome}}"}</code> e <code>{"{{indicado_por_empresa}}"}</code> no corpo.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium" style={{ color: "var(--text-2)" }}>
                  Nome de quem indicou
                </label>
                <input
                  type="text"
                  value={indicadoPorNome}
                  onChange={(e) => setIndicadoPorNome(e.target.value)}
                  placeholder="Ex: João Silva"
                  className="w-full h-10 rounded-xl px-3 text-sm outline-none transition-all"
                  style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium" style={{ color: "var(--text-2)" }}>
                  Empresa de quem indicou
                </label>
                <input
                  type="text"
                  value={indicadoPorEmpresa}
                  onChange={(e) => setIndicadoPorEmpresa(e.target.value)}
                  placeholder="Ex: Metalúrgica Silva"
                  className="w-full h-10 rounded-xl px-3 text-sm outline-none transition-all"
                  style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }}
                />
              </div>
            </div>
          </div>
          )}

          {/* ── Relacionamento (modelo relacionamento) ── */}
          {modelo === "relacionamento" && (
          <div className="rounded-xl p-4 space-y-3" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
            <div className="space-y-0.5">
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                Relacionamento anterior
              </p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Banco onde houve o relacionamento — usa <code>{"{{banco_relacionamento}}"}</code>. O nome do
                responsável (<code>{"{{responsavel_nome}}"}</code>) é por empresa e vem da planilha importada.
              </p>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" style={{ color: "var(--text-2)" }}>Banco do relacionamento</label>
              <input
                type="text"
                value={banco}
                onChange={(e) => setBanco(e.target.value)}
                placeholder="Ex: Daycoval"
                className="w-full h-10 rounded-xl px-3 text-sm outline-none transition-all"
                style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }}
              />
            </div>
          </div>
          )}

          {/* ── Corpo do E-mail ── */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium" style={{ color: "var(--text-2)" }}>
                Corpo do E-mail
              </label>
              {/* Alternador Código / Visualização */}
              <div
                className="inline-flex rounded-lg p-0.5"
                style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
              >
                {(["code", "preview"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setBodyView(mode)}
                    className="px-3 h-7 rounded-md text-xs font-medium transition-colors"
                    style={
                      bodyView === mode
                        ? { background: "var(--surface)", color: "var(--text)", boxShadow: "0 1px 2px rgba(0,0,0,0.08)" }
                        : { background: "transparent", color: "var(--text-muted)" }
                    }
                  >
                    {mode === "code" ? "Código" : "Visualização"}
                  </button>
                ))}
              </div>
            </div>

            {bodyView === "code" ? (
              <textarea
                ref={textareaRef}
                value={corpo}
                onChange={(e) => setCorpo(e.target.value)}
                rows={9}
                placeholder={`Olá, {{razao_social}}!\n\nEsta mensagem é da GR Gestão Financeira — somos especialistas em soluções de crédito e caixa para empresas como a sua em {{municipio_nome}}/{{uf}}.\n\nGostaríamos de apresentar nossas soluções...\n\n[Assinatura]\n\n{{link_descadastro}}`}
                className="w-full rounded-xl px-3 py-2.5 text-sm outline-none resize-none transition-all leading-relaxed"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  color: "var(--text)",
                  fontFamily: "inherit",
                }}
              />
            ) : bodyLooksLikeHtml(corpo) ? (
              <iframe
                title="Visualização do corpo do e-mail"
                srcDoc={renderWithSamples(corpo)}
                sandbox=""
                className="w-full rounded-xl bg-white"
                style={{ border: "1px solid var(--border)", height: 460 }}
              />
            ) : (
              <div
                className="w-full rounded-xl px-3 py-2.5 bg-white overflow-y-auto"
                style={{ border: "1px solid var(--border)", height: 240 }}
              >
                <pre className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: "#1a202c", fontFamily: "inherit", margin: 0 }}>
                  {renderWithSamples(corpo) || "(corpo vazio)"}
                </pre>
              </div>
            )}

            <VariableChips onInsert={insertAtCursor} />
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {bodyView === "preview"
                ? "Visualização com dados de exemplo. O link de descadastro é adicionado ao rodapé se não incluído."
                : "O link de descadastro é adicionado automaticamente ao rodapé se não incluído."}
            </p>
          </div>

          {/* ── Configuração de Envio ── */}
          <div
            className="rounded-xl p-4 space-y-3"
            style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
          >
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
              Configuração de Envio
            </p>
            <div className="flex items-center gap-4">
              <div className="space-y-1 flex-1">
                <label className="text-xs font-medium" style={{ color: "var(--text-2)" }}>Agendamento</label>
                <select
                  className="w-full h-9 rounded-lg px-3 text-sm outline-none appearance-none"
                  style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }}
                  defaultValue="imediato"
                >
                  <option value="imediato">Imediato</option>
                </select>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium" style={{ color: "var(--text-2)" }}>Delay entre envios</p>
                <p className="text-sm font-semibold tabular-nums" style={{ color: "var(--gr-teal)" }}>
                  {emailSendDelay}ms
                </p>
              </div>
            </div>
          </div>

          {/* ── LGPD Warning ── */}
          <LGPDWarning />

          {/* ── Actions ── */}
          <div className="flex gap-3 pb-2">
            <button
              type="button"
              onClick={() => setShowPreview(true)}
              disabled={!corpo.trim() || isSubmitting}
              className="h-10 px-4 rounded-xl text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ border: "1px solid var(--border)", color: "var(--text-2)", background: "var(--surface)" }}
            >
              Pré-visualizar
            </button>

            <button
              type="button"
              onClick={() => setShowTest(true)}
              disabled={!corpo.trim() || isSubmitting}
              className="h-10 px-4 rounded-xl text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ border: "1px solid var(--border)", color: "var(--text-2)", background: "var(--surface)" }}
            >
              Enviar teste
            </button>

            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={!isFormValid() || isSubmitting}
              className="h-10 px-4 rounded-xl text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ border: "1px solid var(--border)", color: "var(--text-2)", background: "var(--surface)" }}
            >
              {creating ? "Salvando…" : "Salvar rascunho"}
            </button>

            <button
              type="button"
              onClick={handleSendClick}
              disabled={!isFormValid() || isSubmitting}
              className="flex-1 h-10 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              style={{ background: "var(--gr-teal)" }}
            >
              {creating ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                  </svg>
                  Preparando…
                </>
              ) : (
                <>✉ Disparar Campanha</>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── Right panel: Import + Campaigns history + config ── */}
      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {/* ── Importar planilha ── */}
        <div className="rounded-2xl p-5 space-y-3" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div>
            <h2 className="text-base font-semibold" style={{ color: "var(--text)" }}>Importar planilha</h2>
            <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
              Envia a planilha padronizada (.xlsx). Cria <strong>uma campanha em rascunho por MODELO</strong>
              {" "}(padrão/indicação/relacionamento/maquininha/cross-sell), com o template certo. Exclui bounces e descadastros.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium" style={{ color: "var(--text-2)" }}>Nome base das campanhas</label>
            <input
              type="text"
              value={importNome}
              onChange={(e) => setImportNome(e.target.value)}
              placeholder="Ex: Prospecção lote 1"
              className="w-full h-10 rounded-xl px-3 text-sm outline-none transition-all"
              style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium" style={{ color: "var(--text-2)" }}>Planilha (.xlsx)</label>
            <input
              type="file"
              accept=".xlsx"
              onChange={(e) => { setImportFile(e.target.files?.[0] ?? null); setImportResult(null); }}
              className="w-full text-sm"
              style={{ color: "var(--text-2)" }}
            />
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Precisa das colunas CNPJ, UF, EMAIL e MODELO. Banco (relacionamento) e indicante do modelo
              selecionado ao lado são usados como padrão quando a planilha não trouxer.
            </p>
          </div>

          <button
            type="button"
            onClick={handleImport}
            disabled={!importFile || !importNome.trim() || importing}
            className="h-10 px-4 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: "var(--gr-navy)" }}
          >
            {importing ? "Importando…" : "Importar e criar rascunhos"}
          </button>

          {importResult && (
            <div className="rounded-xl p-3 text-sm space-y-1" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
              <p style={{ color: "var(--text-2)" }}>
                {importResult.totalValidas} válidas · {importResult.duplicadas} duplicadas · {importResult.skipped.length} puladas
              </p>
              {importResult.created.length === 0 ? (
                <p style={{ color: "#be123c" }}>Nenhuma campanha criada — verifique as pendências.</p>
              ) : (
                importResult.created.map((c) => (
                  <p key={c.modelo} style={{ color: "var(--gr-teal)" }}>
                    ✓ {c.modelo}: {c.total} destinatários{c.suprimidos ? ` (${c.suprimidos} suprimidos)` : ""}
                  </p>
                ))
              )}
              {importResult.skipped.length > 0 && (
                <details>
                  <summary className="cursor-pointer text-xs" style={{ color: "var(--text-muted)" }}>Ver linhas puladas</summary>
                  <ul className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                    {importResult.skipped.slice(0, 30).map((s) => (
                      <li key={s.linha}>linha {s.linha}: {s.motivo}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>

        <div>
          <h2 className="text-base font-semibold" style={{ color: "var(--text)" }}>Campanhas Anteriores</h2>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
            Histórico de campanhas disparadas pela sua conta.
          </p>
        </div>

        {campaigns.length === 0 ? (
          <div
            className="rounded-2xl p-8 text-center"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3"
              style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
            >
              <svg className="w-7 h-7" style={{ color: "var(--text-muted)" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
              </svg>
            </div>
            <p className="text-sm font-medium" style={{ color: "var(--text-2)" }}>Nenhuma campanha ainda</p>
            <p className="text-xs mt-1 max-w-xs mx-auto" style={{ color: "var(--text-muted)" }}>
              Preencha o formulário ao lado e dispare sua primeira campanha.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {campaigns.map((c) => (
              <CampaignCard key={c.id} campaign={c} />
            ))}
          </div>
        )}

        <ConfigCard delay={emailSendDelay} />
      </div>

      {/* ── Modals ── */}
      {showPreview && (
        <PreviewModal
          subject={assunto}
          body={corpo}
          onClose={() => setShowPreview(false)}
        />
      )}

      {confirmData && (
        <ConfirmModal
          count={confirmData.count}
          onConfirm={handleConfirmSend}
          onCancel={() => setConfirmData(null)}
          sending={sending}
        />
      )}

      {showTest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }}>
          <div className="w-full max-w-md rounded-2xl shadow-2xl p-5 space-y-4" style={{ background: "var(--surface)" }}>
            <div>
              <h3 className="text-base font-semibold" style={{ color: "var(--text)" }}>Enviar e-mail de teste</h3>
              <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
                Renderiza o assunto e o corpo atuais com dados de exemplo e envia 1 e-mail (prefixo
                &ldquo;[TESTE]&rdquo;) para o endereço abaixo. Não cria campanha.
              </p>
            </div>
            <input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="voce@dominio.com"
              className="w-full h-10 rounded-xl px-3 text-sm outline-none"
              style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }}
            />
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowTest(false)}
                className="h-10 px-4 rounded-xl text-sm font-medium"
                style={{ border: "1px solid var(--border)", color: "var(--text-2)", background: "var(--surface)" }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleTestSend}
                disabled={!testEmail.trim() || testing}
                className="h-10 px-4 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: "var(--gr-teal)" }}
              >
                {testing ? "Enviando…" : "Enviar teste"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div
          className="fixed bottom-6 right-6 flex items-center gap-3 rounded-xl px-5 py-3 shadow-xl z-50"
          style={{
            background: toast.type === "success" ? "var(--gr-navy)" : "#be123c",
            color: "white",
            maxWidth: 400,
          }}
        >
          {toast.type === "success" ? (
            <svg className="w-4 h-4 flex-shrink-0" style={{ color: "var(--gr-teal)" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/>
            </svg>
          ) : (
            <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/>
            </svg>
          )}
          <span className="text-sm flex-1">{toast.msg}</span>
          <button type="button" onClick={() => setToast(null)} className="opacity-70 hover:opacity-100">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
