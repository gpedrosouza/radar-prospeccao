import { prisma } from "@/lib/prisma";
import type { ScheduledMeeting } from "@prisma/client";

export type { ScheduledMeeting };

export interface CreateMeetingInput {
  nome_lead: string;
  email_lead: string;
  telefone_lead?: string;
  origem: string;
  campaign_id_origem?: string;
  session_id?: string;
  inicio: Date;
  fim: Date;
  google_event_id: string;
  google_meet_link?: string;
}

export async function createMeeting(
  data: CreateMeetingInput
): Promise<ScheduledMeeting> {
  return prisma.scheduledMeeting.create({ data });
}

export async function findByEmail(
  email: string
): Promise<ScheduledMeeting[]> {
  return prisma.scheduledMeeting.findMany({
    where: { email_lead: email },
    orderBy: { inicio: "desc" },
  });
}

export async function cancelMeeting(id: string): Promise<ScheduledMeeting> {
  return prisma.scheduledMeeting.update({
    where: { id },
    data: { status: "cancelado" },
  });
}
