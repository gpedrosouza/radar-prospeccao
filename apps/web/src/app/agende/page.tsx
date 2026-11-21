import type { Metadata } from "next";
import { AgendamentoClient } from "@/components/agendamento/AgendamentoClient";

export const metadata: Metadata = {
  title: "Agende seu diagnóstico financeiro — GR Gestão Financeira",
  description:
    "30 minutos, por videochamada, sem compromisso. Agende um diagnóstico financeiro gratuito com um assessor GR.",
};

export default async function AgendePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const params = await searchParams;
  const origem = params.origem === "email" ? "email" : "landing";
  const campanhaId = origem === "email" ? params.campanha_id : undefined;

  return <AgendamentoClient origem={origem} campanhaId={campanhaId} />;
}
