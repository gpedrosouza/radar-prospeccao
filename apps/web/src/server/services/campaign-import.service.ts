/**
 * Importação de lista avulsa (planilha padronizada) como campanhas de e-mail.
 *
 * Roteia cada linha pelo MODELO (padrao | indicacao | relacionamento | maquininha |
 * crosssell) e cria UMA campanha por modelo (origem_lista=true) com o template
 * correspondente.
 * Variáveis por destinatário (responsavel_nome) vão no EmailRecipient; variáveis
 * de campanha (banco_relacionamento, indicado_por_*) vão no EmailCampaign.
 *
 * Espelha a lógica do script apps/workers/src/scripts/import-indicacoes.ts, mas
 * no lado web (respeitando a separação apps/web ⟷ apps/workers). A exclusão de
 * bounces/unsubscribes é obrigatória, como no fluxo normal.
 */

import * as repo from "@/server/repositories/email-campaign.repository";
import { DEFAULT_CAMPAIGN_SUBJECT, DEFAULT_CAMPAIGN_BODY } from "@/app/(app)/campanhas/_components/defaultTemplate";
import { REFERRAL_CAMPAIGN_SUBJECT, REFERRAL_CAMPAIGN_BODY } from "@/app/(app)/campanhas/_components/referralTemplate";
import { RELATIONSHIP_CAMPAIGN_SUBJECT, RELATIONSHIP_CAMPAIGN_BODY } from "@/app/(app)/campanhas/_components/relationshipTemplate";
import { MAQUININHA_CAMPAIGN_SUBJECT, MAQUININHA_CAMPAIGN_BODY } from "@/app/(app)/campanhas/_components/maquininhaTemplate";
import { CROSSSELL_CAMPAIGN_SUBJECT, CROSSSELL_CAMPAIGN_BODY } from "@/app/(app)/campanhas/_components/crossSellTemplate";

export type Modelo = "padrao" | "indicacao" | "relacionamento" | "maquininha" | "crosssell";
export const MODELOS: Modelo[] = ["padrao", "indicacao", "relacionamento", "maquininha", "crosssell"];

const TEMPLATES: Record<Modelo, { assunto: string; corpo: string }> = {
  padrao: { assunto: DEFAULT_CAMPAIGN_SUBJECT, corpo: DEFAULT_CAMPAIGN_BODY },
  indicacao: { assunto: REFERRAL_CAMPAIGN_SUBJECT, corpo: REFERRAL_CAMPAIGN_BODY },
  relacionamento: { assunto: RELATIONSHIP_CAMPAIGN_SUBJECT, corpo: RELATIONSHIP_CAMPAIGN_BODY },
  maquininha: { assunto: MAQUININHA_CAMPAIGN_SUBJECT, corpo: MAQUININHA_CAMPAIGN_BODY },
  crosssell: { assunto: CROSSSELL_CAMPAIGN_SUBJECT, corpo: CROSSSELL_CAMPAIGN_BODY },
};

export interface ImportRow {
  linha: number;
  modelo: Modelo;
  cnpj: string;
  uf: string;
  email: string;
  responsavel_nome: string;
  indicante_nome: string;
  indicante_empresa: string;
  banco: string;
}

export interface ImportOptions {
  nomeBase: string;
  banco?: string;
  indicanteNome?: string;
  indicanteEmpresa?: string;
}

export interface ImportResult {
  created: Array<{ modelo: Modelo; id: string; total: number; suprimidos: number }>;
  skipped: Array<{ linha: number; motivo: string }>;
  totalValidas: number;
  duplicadas: number;
}

export function normalizeRow(raw: Record<string, string>, linha: number): ImportRow {
  const g = (k: string) => (raw[k] ?? "").toString().trim();
  const cnpj = g("CNPJ").replace(/\D/g, "").padStart(14, "0");
  const rawModelo = (g("MODELO") || "padrao").toLowerCase();
  const modelo = (MODELOS as string[]).includes(rawModelo) ? (rawModelo as Modelo) : "padrao";
  return {
    linha,
    modelo,
    cnpj,
    uf: g("UF").toUpperCase().slice(0, 2),
    email: g("EMAIL").toLowerCase(),
    responsavel_nome: g("RESPONSAVEL_NOME"),
    indicante_nome: g("INDICANTE_NOME"),
    indicante_empresa: g("INDICANTE_EMPRESA"),
    banco: g("BANCO_RELACIONAMENTO"),
  };
}

/** Cria as campanhas (rascunho) a partir das linhas já parseadas da planilha. */
export async function importCampaigns(
  userId: string,
  rows: ImportRow[],
  opts: ImportOptions
): Promise<ImportResult> {
  const skipped: ImportResult["skipped"] = [];
  const valid: ImportRow[] = [];

  for (const r of rows) {
    if (r.cnpj.length !== 14 || r.cnpj === "00000000000000") { skipped.push({ linha: r.linha, motivo: "CNPJ inválido" }); continue; }
    if (!r.uf) { skipped.push({ linha: r.linha, motivo: "sem UF" }); continue; }
    if (!r.email.includes("@")) { skipped.push({ linha: r.linha, motivo: "sem e-mail válido" }); continue; }
    if (r.modelo === "relacionamento" && !r.responsavel_nome) { skipped.push({ linha: r.linha, motivo: "relacionamento sem RESPONSAVEL_NOME" }); continue; }
    if (r.modelo === "indicacao" && !r.indicante_nome && !r.indicante_empresa && !opts.indicanteNome && !opts.indicanteEmpresa) {
      skipped.push({ linha: r.linha, motivo: "indicacao sem indicante" }); continue;
    }
    valid.push(r);
  }

  // Dedup por e-mail
  const seen = new Set<string>();
  const deduped = valid.filter((v) => (seen.has(v.email) ? false : (seen.add(v.email), true)));
  const duplicadas = valid.length - deduped.length;

  // Agrupa por modelo
  const groups = new Map<Modelo, ImportRow[]>();
  for (const r of deduped) {
    const arr = groups.get(r.modelo) ?? [];
    arr.push(r);
    groups.set(r.modelo, arr);
  }

  // Supressões (obrigatório)
  const [bounced, unsub] = await Promise.all([repo.findBouncedEmails(), repo.findUnsubscribedEmails()]);
  const blocked = new Set<string>([...bounced, ...unsub].map((e) => e.toLowerCase()));

  const created: ImportResult["created"] = [];
  for (const [modelo, rs] of groups) {
    const elegiveis = rs.filter((v) => !blocked.has(v.email));
    const suprimidos = rs.length - elegiveis.length;
    if (elegiveis.length === 0) continue;

    let banco: string | null = null;
    let indNome: string | null = null;
    let indEmpresa: string | null = null;
    if (modelo === "relacionamento") {
      const bancos = [...new Set(elegiveis.map((v) => v.banco).filter(Boolean))];
      banco = opts.banco?.trim() || bancos[0] || "Daycoval";
    }
    if (modelo === "indicacao") {
      const nomes = [...new Set(elegiveis.map((v) => v.indicante_nome).filter(Boolean))];
      const emps = [...new Set(elegiveis.map((v) => v.indicante_empresa).filter(Boolean))];
      indNome = opts.indicanteNome?.trim() || nomes[0] || null;
      indEmpresa = opts.indicanteEmpresa?.trim() || emps[0] || null;
    }

    const campaign = await repo.createCampaign({
      nome: `${opts.nomeBase} · ${modelo}`,
      usuario_id: userId,
      filtros_origem: { origem: "lista-importada", modelo },
      assunto: TEMPLATES[modelo].assunto,
      corpo_template: TEMPLATES[modelo].corpo,
      indicado_por_nome: indNome,
      indicado_por_empresa: indEmpresa,
      banco_relacionamento: banco,
      origem_lista: true,
    });

    const total = await repo.createRecipients(
      campaign.id,
      elegiveis.map((v) => ({
        cnpj: v.cnpj,
        uf: v.uf,
        email: v.email,
        responsavel_nome: modelo === "relacionamento" ? (v.responsavel_nome || null) : null,
      }))
    );

    await repo.updateCampaignStatus(campaign.id, "rascunho", { total_destinatarios: total });
    created.push({ modelo, id: campaign.id, total, suprimidos });
  }

  return { created, skipped, totalValidas: valid.length, duplicadas };
}
