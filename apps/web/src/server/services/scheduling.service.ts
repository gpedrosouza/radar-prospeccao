/**
 * Regras de negócio do agendamento — tudo que NÃO vem direto da Calendar API
 * (duração, buffer, antecedência mínima, horário comercial, dias úteis) fica
 * aqui. google-calendar-client.ts só faz as chamadas cruas.
 *
 * Fuso fixo America/Sao_Paulo (UTC-3) construído via offset literal na
 * string ISO, sem lib de timezone — válido porque o Brasil aboliu horário de
 * verão em 2019 (offset não varia mais ao longo do ano). Se isso mudar,
 * revisar aqui.
 */

import { getFreeBusy, createEvent, type BusyPeriod } from "./google-calendar-client";
import * as scheduledMeetingRepository from "@/server/repositories/scheduled-meeting.repository";
import type { ScheduledMeeting } from "@/server/repositories/scheduled-meeting.repository";

const SAO_PAULO_OFFSET = "-03:00";

// ── Configuração (env vars — ver .env.local.example) ──────────────────────────

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

function envTime(name: string, fallback: string): { hour: number; minute: number } {
  const raw = process.env[name] ?? fallback;
  const [hourStr, minuteStr] = raw.split(":");
  const hour = parseInt(hourStr, 10);
  const minute = parseInt(minuteStr, 10);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    throw new Error(`Formato inválido para ${name}: "${raw}" (esperado HH:mm)`);
  }
  return { hour, minute };
}

function getConfig() {
  return {
    durationMinutes: envInt("SCHEDULING_MEETING_DURATION_MINUTES", 30),
    bufferMinutes: envInt("SCHEDULING_BUFFER_MINUTES", 15),
    minNoticeHours: envInt("SCHEDULING_MIN_NOTICE_HOURS", 4),
    businessStart: envTime("SCHEDULING_BUSINESS_HOURS_START", "09:00"),
    businessEnd: envTime("SCHEDULING_BUSINESS_HOURS_END", "18:00"),
  };
}

// ── Helpers de data/hora (America/Sao_Paulo, offset fixo) ─────────────────────

/** "YYYY-MM-DD" + {hour, minute} → Date (instante UTC correspondente ao horário local de SP). */
function saoPauloDateTime(dateStr: string, time: { hour: number; minute: number }): Date {
  const hh = String(time.hour).padStart(2, "0");
  const mm = String(time.minute).padStart(2, "0");
  return new Date(`${dateStr}T${hh}:${mm}:00${SAO_PAULO_OFFSET}`);
}

/** Dia da semana (0=domingo..6=sábado) do ponto de vista de São Paulo, não do relógio do servidor. */
function saoPauloWeekday(date: Date): number {
  // new Date(...).getUTCDay() sobre um instante já ajustado pro offset de SP
  // via toLocaleString seria mais robusto a DST, mas SP não tem DST desde
  // 2019 — subtrair o offset fixo é equivalente e mais barato.
  const spMs = date.getTime() - 3 * 60 * 60 * 1000; // UTC-3 → soma 3h pra "olhar" em UTC
  return new Date(spMs).getUTCDay();
}

function isWeekend(date: Date): boolean {
  const dow = saoPauloWeekday(date);
  return dow === 0 || dow === 6;
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

// ── Slots ─────────────────────────────────────────────────────────────────────

export interface AvailableSlot {
  inicio: Date;
  fim: Date;
}

/**
 * Gera os horários candidatos do dia (grade de duração+buffer dentro do
 * horário comercial), sem checar disponibilidade ainda — isolado pra ser
 * reaproveitado tanto por getAvailableSlots (freebusy real) quanto pelos
 * testes (sem mockar a Calendar API pra validar só a grade).
 */
export function buildCandidateSlots(dateStr: string): AvailableSlot[] {
  const config = getConfig();
  const dayStart = saoPauloDateTime(dateStr, config.businessStart);
  const dayEnd = saoPauloDateTime(dateStr, config.businessEnd);

  if (isWeekend(dayStart)) return [];

  const step = config.durationMinutes + config.bufferMinutes;
  const slots: AvailableSlot[] = [];
  let cursor = dayStart;

  while (true) {
    const fim = addMinutes(cursor, config.durationMinutes);
    if (fim > dayEnd) break;
    slots.push({ inicio: cursor, fim });
    cursor = addMinutes(cursor, step);
  }

  return slots;
}

/** Slot respeita a antecedência mínima configurada, a partir de `now`. */
function respeitaAntecedenciaMinima(slot: AvailableSlot, now: Date): boolean {
  const config = getConfig();
  const limite = addMinutes(now, config.minNoticeHours * 60);
  return slot.inicio >= limite;
}

/**
 * Horários livres pro dia informado — aplica horário comercial + dias úteis
 * (buildCandidateSlots), antecedência mínima, e checa disponibilidade real
 * na Calendar API com buffer de clearance ao redor de cada slot (ver
 * temBuffer abaixo — decisão registrada no relatório da implementação).
 */
export async function getAvailableSlots(
  dateStr: string,
  now: Date = new Date()
): Promise<AvailableSlot[]> {
  const config = getConfig();
  const candidatos = buildCandidateSlots(dateStr).filter((s) =>
    respeitaAntecedenciaMinima(s, now)
  );

  if (candidatos.length === 0) return [];

  // Uma consulta freebusy pro dia inteiro (com folga de buffer nas pontas)
  // em vez de uma por slot — mais barato e evita N chamadas à API do Google.
  const rangeStart = addMinutes(candidatos[0].inicio, -config.bufferMinutes);
  const rangeEnd = addMinutes(candidatos[candidatos.length - 1].fim, config.bufferMinutes);
  const busy = await getFreeBusy(rangeStart, rangeEnd);

  return candidatos.filter((slot) => slotDisponivel(slot, busy, config.bufferMinutes));
}

/**
 * Um slot só é disponível se, com a folga de buffer antes e depois, não
 * encostar em nenhum evento existente no calendário — não basta não
 * sobrepor o horário da reunião em si. Isso evita marcar reuniões coladas
 * (sem tempo de troca) mesmo quando o evento vizinho não foi criado por
 * este sistema (ex: outro compromisso do assessor, sem buffer nenhum
 * embutido). Ver decisão registrada no relatório final.
 */
function slotDisponivel(
  slot: AvailableSlot,
  busy: BusyPeriod[],
  bufferMinutes: number
): boolean {
  const paddedStart = addMinutes(slot.inicio, -bufferMinutes);
  const paddedEnd = addMinutes(slot.fim, bufferMinutes);
  return !busy.some((b) => overlaps(paddedStart, paddedEnd, b.start, b.end));
}

// ── Erros de domínio ──────────────────────────────────────────────────────────

export class SlotIndisponivelError extends Error {
  constructor() {
    super(
      "Esse horário acabou de ser reservado por outra pessoa, escolha outro."
    );
    this.name = "SlotIndisponivelError";
  }
}

export class SlotInvalidoError extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = "SlotInvalidoError";
  }
}

// ── Agendamento ───────────────────────────────────────────────────────────────

export interface BookMeetingInput {
  nome: string;
  email: string;
  telefone?: string;
  inicio: Date;
  origem: string;
  campaignIdOrigem?: string;
  sessionId?: string;
}

/**
 * Revalida o slot (evita condição de corrida entre dois leads escolhendo o
 * mesmo horário), cria o evento na Calendar API com Google Meet automático
 * e persiste o agendamento.
 *
 * @throws SlotIndisponivelError se o horário deixou de estar livre entre a
 *   listagem e a confirmação (checagem de buffer incluída).
 * @throws SlotInvalidoError se o horário não respeita as regras de negócio
 *   (fora do horário comercial, fim de semana, ou antecedência mínima) —
 *   proteção contra chamadas diretas à API por fora do fluxo normal da UI.
 */
export async function bookMeeting(
  input: BookMeetingInput
): Promise<ScheduledMeeting> {
  const config = getConfig();
  const fim = addMinutes(input.inicio, config.durationMinutes);
  const slot: AvailableSlot = { inicio: input.inicio, fim };

  if (isWeekend(input.inicio)) {
    throw new SlotInvalidoError("Não agendamos reuniões em fins de semana.");
  }
  if (!respeitaAntecedenciaMinima(slot, new Date())) {
    throw new SlotInvalidoError(
      `É preciso agendar com pelo menos ${config.minNoticeHours}h de antecedência.`
    );
  }

  const rangeStart = addMinutes(slot.inicio, -config.bufferMinutes);
  const rangeEnd = addMinutes(slot.fim, config.bufferMinutes);
  const busy = await getFreeBusy(rangeStart, rangeEnd);

  if (!slotDisponivel(slot, busy, config.bufferMinutes)) {
    throw new SlotIndisponivelError();
  }

  const evento = await createEvent({
    summary: `Diagnóstico financeiro GR — ${input.nome}`,
    description:
      `Reunião agendada via /agende (origem: ${input.origem}).\n` +
      `Lead: ${input.nome} <${input.email}>` +
      (input.telefone ? ` · ${input.telefone}` : ""),
    start: slot.inicio,
    end: slot.fim,
    attendeeEmail: input.email,
  });

  return scheduledMeetingRepository.createMeeting({
    nome_lead: input.nome,
    email_lead: input.email,
    telefone_lead: input.telefone,
    origem: input.origem,
    campaign_id_origem: input.campaignIdOrigem,
    session_id: input.sessionId,
    inicio: slot.inicio,
    fim: slot.fim,
    google_event_id: evento.eventId,
    google_meet_link: evento.meetLink ?? undefined,
  });
}
