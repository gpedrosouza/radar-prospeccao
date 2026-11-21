/**
 * GET /api/cnae/secoes
 *
 * Seções da CNAE 2.0 (A–U) com as divisões que as compõem — alimenta o
 * seletor de Setor no Mapa e na tela de CNPJs.
 *
 * Resposta:
 *   { secoes: Array<{ secao: string; secao_desc: string; divisoes: string[] }> }
 *
 * Vem do dicionário em cache de módulo (packages/db), então depois da primeira
 * chamada não toca o banco. Dado estático entre importações — o cliente pode
 * cachear à vontade.
 */

import { auth } from "@/auth";
import * as cnaeRepository from "@/server/repositories/cnae.repository";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const secoes = await cnaeRepository.secoes();
  return Response.json({ secoes });
}
