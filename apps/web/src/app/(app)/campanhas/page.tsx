import { auth } from "@/auth";
import { getUserJobs } from "@/server/services/export.service";
import * as emailCampaignRepo from "@/server/repositories/email-campaign.repository";
import { CampanhasClient } from "./_components/CampanhasClient";
import type { SerializedCampaign, ExportJobOption } from "./_components/CampanhasClient";

export const metadata = { title: "Campanhas — Radar Prospecção" };

export default async function CampanhasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const [session, params] = await Promise.all([auth(), searchParams]);
  const userId = session!.user!.id!;

  const [campaigns, exportJobs] = await Promise.all([
    emailCampaignRepo.findCampaignsWithStats(userId),
    getUserJobs(userId),
  ]);

  const serializedCampaigns: SerializedCampaign[] = campaigns.map((c) => ({
    id: c.id,
    nome: c.nome,
    status: c.status,
    total_destinatarios: c.total_destinatarios,
    total_enviados: c.total_enviados,
    total_bounces: c.total_bounces,
    criado_em: c.criado_em.toISOString(),
    enviado_em: c.enviado_em?.toISOString() ?? null,
    stats: c.stats,
  }));

  const exportJobOptions: ExportJobOption[] = exportJobs
    .filter((j) => j.status === "completed" && j.linhas && j.linhas > 0)
    .map((j) => ({
      id: j.id,
      filtros: j.filtros as Record<string, unknown>,
      linhas: j.linhas ?? 0,
      criado_em: j.criado_em.toISOString(),
    }));

  const emailSendDelay = parseInt(process.env.EMAIL_SEND_DELAY_MS ?? "350", 10);

  return (
    <CampanhasClient
      campaigns={serializedCampaigns}
      exportJobs={exportJobOptions}
      initialParams={params}
      emailSendDelay={emailSendDelay}
    />
  );
}
