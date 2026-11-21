/**
 * Testes do scheduling.service.
 *
 * google-calendar-client e scheduled-meeting.repository são mockados — sem
 * banco, sem chamar a Calendar API de verdade. Segue o padrão de mock já
 * usado em email-campaign.service.test.ts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./google-calendar-client", () => ({
  getFreeBusy: vi.fn(),
  createEvent: vi.fn(),
}));
vi.mock("@/server/repositories/scheduled-meeting.repository", () => ({
  createMeeting: vi.fn(),
}));

import { getFreeBusy, createEvent } from "./google-calendar-client";
import * as scheduledMeetingRepository from "@/server/repositories/scheduled-meeting.repository";
import {
  buildCandidateSlots,
  getAvailableSlots,
  bookMeeting,
  SlotIndisponivelError,
  SlotInvalidoError,
} from "./scheduling.service";

// ── Fixtures ──────────────────────────────────────────────────────────────────

// 2026-08-05 é quarta-feira; 2026-08-08 é sábado (confirmado via Date.getUTCDay()).
const QUARTA = "2026-08-05";
const SABADO = "2026-08-08";

const ORIGINAL_ENV = { ...process.env };

function setSchedulingEnv(overrides: Record<string, string> = {}) {
  process.env.SCHEDULING_MEETING_DURATION_MINUTES = "30";
  process.env.SCHEDULING_BUFFER_MINUTES = "15";
  process.env.SCHEDULING_MIN_NOTICE_HOURS = "4";
  process.env.SCHEDULING_BUSINESS_HOURS_START = "09:00";
  process.env.SCHEDULING_BUSINESS_HOURS_END = "18:00";
  Object.assign(process.env, overrides);
}

const MOCK_MEETING = {
  id: "meeting-uuid-1",
  nome_lead: "Fulano",
  email_lead: "fulano@example.com",
  telefone_lead: null,
  origem: "landing",
  campaign_id_origem: null,
  session_id: null,
  inicio: new Date("2026-08-05T12:00:00.000Z"),
  fim: new Date("2026-08-05T12:30:00.000Z"),
  google_event_id: "evt-123",
  google_meet_link: "https://meet.google.com/abc-defg-hij",
  status: "confirmado",
  criado_em: new Date("2026-08-01T00:00:00.000Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  setSchedulingEnv();
  vi.mocked(getFreeBusy).mockResolvedValue([]);
  vi.mocked(createEvent).mockResolvedValue({
    eventId: "evt-123",
    meetLink: "https://meet.google.com/abc-defg-hij",
  });
  vi.mocked(scheduledMeetingRepository.createMeeting).mockResolvedValue(MOCK_MEETING);
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

// ── buildCandidateSlots — grade de horários ────────────────────────────────────

describe("buildCandidateSlots", () => {
  it("gera slots espaçados por duração+buffer dentro do horário comercial", () => {
    const slots = buildCandidateSlots(QUARTA);

    // 09:00 às 18:00, passo de 45min (30 duração + 15 buffer), última que cabe: 17:15-17:45
    expect(slots.length).toBeGreaterThan(0);
    expect(slots[0].inicio.toISOString()).toBe("2026-08-05T12:00:00.000Z"); // 09:00 -03:00
    expect(slots[0].fim.toISOString()).toBe("2026-08-05T12:30:00.000Z");

    // Todo slot deve caber inteiramente até o fim do expediente (18:00 -03:00 = 21:00Z)
    const fimExpediente = new Date("2026-08-05T21:00:00.000Z");
    for (const s of slots) {
      expect(s.fim.getTime()).toBeLessThanOrEqual(fimExpediente.getTime());
    }
  });

  it("respeita o passo de duração+buffer entre slots consecutivos", () => {
    const slots = buildCandidateSlots(QUARTA);
    const passoMs = (30 + 15) * 60_000;
    for (let i = 1; i < slots.length; i++) {
      expect(slots[i].inicio.getTime() - slots[i - 1].inicio.getTime()).toBe(passoMs);
    }
  });

  it("não gera slots em fim de semana", () => {
    expect(buildCandidateSlots(SABADO)).toEqual([]);
  });

  it("respeita horário comercial customizado via env", () => {
    setSchedulingEnv({
      SCHEDULING_BUSINESS_HOURS_START: "10:00",
      SCHEDULING_BUSINESS_HOURS_END: "12:00",
      SCHEDULING_MEETING_DURATION_MINUTES: "30",
      SCHEDULING_BUFFER_MINUTES: "15",
    });
    const slots = buildCandidateSlots(QUARTA);
    // 10:00 -03:00 = 13:00Z ; janela de 2h, passo de 45min → 10:00 e 10:45 cabem, 11:30 não (fim 12:00 = limite exato, cabe)
    expect(slots[0].inicio.toISOString()).toBe("2026-08-05T13:00:00.000Z");
    expect(slots.every((s) => s.fim.getTime() <= new Date("2026-08-05T15:00:00.000Z").getTime())).toBe(true);
  });
});

// ── getAvailableSlots — antecedência mínima + freebusy ─────────────────────────

describe("getAvailableSlots", () => {
  it("exclui slots que não respeitam a antecedência mínima", async () => {
    // "agora" é 08:00 -03:00 do próprio dia (11:00Z) — com 4h de antecedência,
    // só slots a partir de 12:00 -03:00 (15:00Z) deveriam sobrar.
    const agora = new Date("2026-08-05T11:00:00.000Z");
    const slots = await getAvailableSlots(QUARTA, agora);

    const limite = new Date("2026-08-05T15:00:00.000Z");
    expect(slots.length).toBeGreaterThan(0);
    for (const s of slots) {
      expect(s.inicio.getTime()).toBeGreaterThanOrEqual(limite.getTime());
    }
  });

  it("retorna vazio em fim de semana sem chamar a Calendar API", async () => {
    const slots = await getAvailableSlots(SABADO, new Date("2026-08-01T00:00:00.000Z"));
    expect(slots).toEqual([]);
    expect(getFreeBusy).not.toHaveBeenCalled();
  });

  it("exclui slot que colide com evento existente (sobreposição direta)", async () => {
    // Evento das 10:00 às 10:30 -03:00 (13:00-13:30Z) — bate direto no slot 09:45-10:15... mas
    // nossa grade é 09:00,09:45,10:30,... então usamos um evento que sobrepõe o slot de 09:45.
    vi.mocked(getFreeBusy).mockResolvedValue([
      { start: new Date("2026-08-05T12:45:00.000Z"), end: new Date("2026-08-05T13:15:00.000Z") },
    ]);

    const agora = new Date("2026-08-01T00:00:00.000Z");
    const slots = await getAvailableSlots(QUARTA, agora);

    const inicios = slots.map((s) => s.inicio.toISOString());
    expect(inicios).not.toContain("2026-08-05T12:45:00.000Z");
  });

  it("exclui slot sem overlap direto mas dentro do buffer de um evento vizinho", async () => {
    // Evento das 10:35 às 11:00 -03:00 (13:35-14:00Z). O slot 10:30-11:00 -03:00Z
    // (13:30-14:00Z candidato da grade) na verdade sobrepõe; testamos o vizinho
    // ANTERIOR: slot 09:45-10:15 (-03:00) termina 10:15, evento começa 10:35 —
    // sem overlap direto (gap de 20min), mas menor que o buffer de 15min? Não,
    // 20min > 15min buffer — ajustamos pra um gap de 10min (menor que o buffer)
    // pra realmente testar a regra de buffer, não só overlap.
    vi.mocked(getFreeBusy).mockResolvedValue([
      // 10:25 às 11:00 -03:00 → gap de só 10min até o fim do slot 09:45-10:15 (-03:00)
      { start: new Date("2026-08-05T13:25:00.000Z"), end: new Date("2026-08-05T14:00:00.000Z") },
    ]);

    const agora = new Date("2026-08-01T00:00:00.000Z");
    const slots = await getAvailableSlots(QUARTA, agora);

    // Slot 09:45 -03:00 = 12:45Z termina 13:15Z; evento começa 13:25Z → gap real de
    // 10min, menor que o buffer de 15min configurado — deve ser excluído mesmo
    // sem overlap direto.
    const inicios = slots.map((s) => s.inicio.toISOString());
    expect(inicios).not.toContain("2026-08-05T12:45:00.000Z");
  });

  it("faz uma única chamada a getFreeBusy pro dia inteiro", async () => {
    await getAvailableSlots(QUARTA, new Date("2026-08-01T00:00:00.000Z"));
    expect(getFreeBusy).toHaveBeenCalledTimes(1);
  });
});

// ── bookMeeting — revalidação + criação ────────────────────────────────────────

describe("bookMeeting", () => {
  const inputBase = {
    nome: "Fulano de Tal",
    email: "fulano@example.com",
    inicio: new Date("2026-08-05T12:00:00.000Z"), // 09:00 -03:00, quarta-feira
    origem: "landing",
  };

  // bookMeeting checks the minimum notice against the real clock; pin it so the
  // fixed slot above stays in the future regardless of when the suite runs.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("cria o evento e persiste o agendamento no caminho feliz", async () => {
    const result = await bookMeeting(inputBase);

    expect(createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        start: inputBase.inicio,
        end: new Date("2026-08-05T12:30:00.000Z"),
        attendeeEmail: "fulano@example.com",
      })
    );
    expect(scheduledMeetingRepository.createMeeting).toHaveBeenCalledWith(
      expect.objectContaining({
        nome_lead: "Fulano de Tal",
        email_lead: "fulano@example.com",
        google_event_id: "evt-123",
        google_meet_link: "https://meet.google.com/abc-defg-hij",
      })
    );
    expect(result).toEqual(MOCK_MEETING);
  });

  it("lança SlotIndisponivelError quando a revalidação encontra conflito", async () => {
    vi.mocked(getFreeBusy).mockResolvedValue([
      { start: new Date("2026-08-05T12:00:00.000Z"), end: new Date("2026-08-05T12:30:00.000Z") },
    ]);

    await expect(bookMeeting(inputBase)).rejects.toBeInstanceOf(SlotIndisponivelError);
    expect(createEvent).not.toHaveBeenCalled();
    expect(scheduledMeetingRepository.createMeeting).not.toHaveBeenCalled();
  });

  it("lança SlotInvalidoError para horário em fim de semana", async () => {
    await expect(
      bookMeeting({ ...inputBase, inicio: new Date("2026-08-08T12:00:00.000Z") })
    ).rejects.toBeInstanceOf(SlotInvalidoError);
    expect(getFreeBusy).not.toHaveBeenCalled();
  });

  it("lança SlotInvalidoError quando não respeita a antecedência mínima", async () => {
    const daquiA1Hora = new Date(Date.now() + 60 * 60_000);
    await expect(
      bookMeeting({ ...inputBase, inicio: daquiA1Hora })
    ).rejects.toBeInstanceOf(SlotInvalidoError);
  });
});
