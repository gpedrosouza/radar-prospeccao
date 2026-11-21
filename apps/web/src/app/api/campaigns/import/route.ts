/**
 * POST /api/campaigns/import  (multipart/form-data)
 *
 * Recebe a planilha padronizada (.xlsx) e cria campanhas em rascunho roteadas
 * pela coluna MODELO (padrao | indicacao | relacionamento | maquininha |
 * crosssell), uma por modelo, com origem_lista=true. Exclui bounces/unsubscribes.
 *
 * Campos do form:
 *   file               (obrigatório) planilha .xlsx
 *   nome               (obrigatório) base do nome das campanhas
 *   banco              (opcional) banco do relacionamento (default: coluna/Daycoval)
 *   indicante_nome     (opcional) indicante da campanha de indicação
 *   indicante_empresa  (opcional)
 */

import type { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { auth } from "@/auth";
import * as importService from "@/server/services/campaign-import.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (typeof v === "object") {
    const o = v as { text?: string; result?: unknown; richText?: Array<{ text: string }> };
    if (Array.isArray(o.richText)) return o.richText.map((r) => r.text).join("");
    if (typeof o.text === "string") return o.text;
    if (o.result != null) return String(o.result);
    return "";
  }
  return String(v);
}

export async function POST(request: NextRequest): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "invalid_form" }, { status: 400 });
  }

  const file = form.get("file");
  const nome = (form.get("nome") as string | null)?.trim() ?? "";
  const banco = (form.get("banco") as string | null)?.trim() || undefined;
  const indicanteNome = (form.get("indicante_nome") as string | null)?.trim() || undefined;
  const indicanteEmpresa = (form.get("indicante_empresa") as string | null)?.trim() || undefined;

  if (!nome) {
    return Response.json({ error: "nome_obrigatorio", detail: "Informe o nome base das campanhas." }, { status: 422 });
  }
  if (!file || typeof file === "string") {
    return Response.json({ error: "arquivo_obrigatorio", detail: "Envie a planilha .xlsx no campo 'file'." }, { status: 422 });
  }

  // Parse XLSX
  let wb: ExcelJS.Workbook;
  try {
    const buf = Buffer.from(await (file as File).arrayBuffer());
    wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
  } catch (err) {
    return Response.json({ error: "xlsx_invalido", detail: (err as Error).message }, { status: 422 });
  }

  const ws = wb.getWorksheet("Indicações") ?? wb.worksheets[0];
  if (!ws) {
    return Response.json({ error: "planilha_vazia", detail: "Nenhuma aba encontrada." }, { status: 422 });
  }

  // Header map
  const headerRow = ws.getRow(1);
  const headers: Record<number, string> = {};
  headerRow.eachCell((cell, col) => {
    const t = cellText(cell.value).trim();
    if (t) headers[col] = t;
  });
  const need = ["CNPJ", "UF", "EMAIL"];
  const present = new Set(Object.values(headers));
  for (const n of need) {
    if (!present.has(n)) {
      return Response.json(
        { error: "colunas_ausentes", detail: `Coluna "${n}" ausente. Cabeçalhos: ${[...present].join(", ")}` },
        { status: 422 }
      );
    }
  }

  // Rows -> normalized
  const rows: importService.ImportRow[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const raw: Record<string, string> = {};
    let hasAny = false;
    for (const [colStr, name] of Object.entries(headers)) {
      const val = cellText(row.getCell(Number(colStr)).value);
      raw[name] = val;
      if (val) hasAny = true;
    }
    if (!hasAny) continue;
    rows.push(importService.normalizeRow(raw, r));
  }

  if (rows.length === 0) {
    return Response.json({ error: "sem_linhas", detail: "A planilha não tem linhas de dados." }, { status: 422 });
  }

  try {
    const result = await importService.importCampaigns(session.user.id, rows, {
      nomeBase: nome,
      banco,
      indicanteNome,
      indicanteEmpresa,
    });
    const status = result.created.length > 0 ? 201 : 422;
    return Response.json(result, { status });
  } catch (err) {
    return Response.json({ error: "import_falhou", detail: (err as Error).message }, { status: 500 });
  }
}
