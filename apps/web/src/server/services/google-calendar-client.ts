/**
 * Client de baixo nível pra Google Calendar API — só autenticação e chamadas
 * cruas. Nenhuma regra de negócio aqui (duração, buffer, horário comercial
 * etc ficam em scheduling.service.ts).
 *
 * Autenticação: service account com domain-wide delegation, impersonando
 * GOOGLE_SCHEDULING_IMPERSONATE_EMAIL (subject do JWT) — permite consultar/
 * criar eventos no calendário de agendamento sem OAuth por lead. A service
 * account só funciona se o domain-wide delegation estiver habilitado no
 * Admin Console do Workspace (não dá pra automatizar por código — ver
 * checklist no relatório da implementação).
 */

import { google, type calendar_v3 } from "googleapis";

// Tipo derivado de google.auth.JWT (em vez de importar JWT direto de
// "google-auth-library") de propósito: googleapis-common reexporta sua
// própria cópia interna do pacote, e o TypeScript trata as duas como tipos
// diferentes (propriedades privadas não batem) — google.calendar({ auth })
// só aceita a instância criada a partir de google.auth.JWT.
type SchedulingJwtClient = InstanceType<typeof google.auth.JWT>;

const SCOPES = ["https://www.googleapis.com/auth/calendar"];

// Fuso fixo — negócio 100% Brasil, sem variação de timezone por lead.
export const SCHEDULING_TIMEZONE = "America/Sao_Paulo";

let cachedJwtClient: SchedulingJwtClient | null = null;

function getAuthClient(): SchedulingJwtClient {
  if (cachedJwtClient) return cachedJwtClient;

  const email = process.env.GOOGLE_SCHEDULING_SA_EMAIL;
  const privateKey = process.env.GOOGLE_SCHEDULING_SA_PRIVATE_KEY;
  const impersonate = process.env.GOOGLE_SCHEDULING_IMPERSONATE_EMAIL;

  if (!email || !privateKey || !impersonate) {
    throw new Error(
      "Agendamento não configurado: defina GOOGLE_SCHEDULING_SA_EMAIL, " +
        "GOOGLE_SCHEDULING_SA_PRIVATE_KEY e GOOGLE_SCHEDULING_IMPERSONATE_EMAIL"
    );
  }

  cachedJwtClient = new google.auth.JWT({
    email,
    // .env costuma escapar quebras de linha da chave PEM como "\n" literal — desfaz aqui.
    key: privateKey.replace(/\\n/g, "\n"),
    scopes: SCOPES,
    subject: impersonate,
  });

  return cachedJwtClient;
}

function getCalendarId(): string {
  const id = process.env.GOOGLE_SCHEDULING_CALENDAR_ID;
  if (!id) throw new Error("GOOGLE_SCHEDULING_CALENDAR_ID não configurada");
  return id;
}

function getClient(): calendar_v3.Calendar {
  return google.calendar({ version: "v3", auth: getAuthClient() });
}

export interface BusyPeriod {
  start: Date;
  end: Date;
}

/** Períodos ocupados do calendário de agendamento dentro do intervalo dado. */
export async function getFreeBusy(
  rangeStart: Date,
  rangeEnd: Date
): Promise<BusyPeriod[]> {
  const calendarId = getCalendarId();
  const calendar = getClient();

  const res = await calendar.freebusy.query({
    requestBody: {
      timeMin: rangeStart.toISOString(),
      timeMax: rangeEnd.toISOString(),
      timeZone: SCHEDULING_TIMEZONE,
      items: [{ id: calendarId }],
    },
  });

  const busy = res.data.calendars?.[calendarId]?.busy ?? [];
  return busy
    .filter((p): p is { start: string; end: string } => Boolean(p.start && p.end))
    .map((p) => ({ start: new Date(p.start), end: new Date(p.end) }));
}

export interface CreateEventParams {
  summary: string;
  description?: string;
  start: Date;
  end: Date;
  attendeeEmail: string;
}

export interface CreateEventResult {
  eventId: string;
  meetLink: string | null;
}

/**
 * Cria o evento no calendário com Google Meet automático
 * (conferenceDataVersion: 1 + createRequest) e convite nativo do Google pro
 * lead (sendUpdates: "all") — além da confirmação por Resend que o service
 * dispara em paralelo.
 */
export async function createEvent(
  params: CreateEventParams
): Promise<CreateEventResult> {
  const calendarId = getCalendarId();
  const calendar = getClient();

  const res = await calendar.events.insert({
    calendarId,
    conferenceDataVersion: 1,
    sendUpdates: "all",
    requestBody: {
      summary: params.summary,
      description: params.description,
      start: { dateTime: params.start.toISOString(), timeZone: SCHEDULING_TIMEZONE },
      end: { dateTime: params.end.toISOString(), timeZone: SCHEDULING_TIMEZONE },
      attendees: [{ email: params.attendeeEmail }],
      conferenceData: {
        createRequest: {
          requestId: `agende-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
    },
  });

  const event = res.data;
  if (!event.id) {
    throw new Error("Calendar API não retornou id do evento criado");
  }

  const meetEntry = event.conferenceData?.entryPoints?.find(
    (e) => e.entryPointType === "video"
  );

  return {
    eventId: event.id,
    meetLink: meetEntry?.uri ?? null,
  };
}
