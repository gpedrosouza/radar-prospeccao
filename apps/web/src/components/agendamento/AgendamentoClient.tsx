"use client";

import { useState } from "react";
import { Cabecalho } from "./Cabecalho";
import { FormularioLead } from "./FormularioLead";
import { SeletorData } from "./SeletorData";
import { SeletorHorario } from "./SeletorHorario";
import { Confirmacao } from "./Confirmacao";
import { Sucesso } from "./Sucesso";
import { Rodape } from "./Rodape";
import { gerarDiasUteis, formatarDataCompleta } from "./utils";
import type { DadosLead, SlotDisponivel, ResultadoAgendamento } from "./types";

const DURACAO_MINUTOS = 30; // espelha SCHEDULING_MEETING_DURATION_MINUTES (default) — só pra exibição

/** Lê o cookie gr_session do pipeline de analytics — se ainda não existir, retorna undefined sem quebrar. */
function lerSessionId(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(/(?:^|; )gr_session=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : undefined;
}

const dias = gerarDiasUteis();

interface Props {
  /** Lidos de ?origem=landing ou ?origem=email&campanha_id=X pelo page.tsx (server) — evita useSearchParams()/Suspense no client. */
  origem: "landing" | "email";
  campanhaId?: string;
}

export function AgendamentoClient({ origem, campanhaId }: Props) {
  const [dadosLead, setDadosLead] = useState<DadosLead>({ nome: "", email: "", telefone: "" });
  const [dataSelecionada, setDataSelecionada] = useState<string | null>(null);
  const [slots, setSlots] = useState<SlotDisponivel[]>([]);
  const [carregandoSlots, setCarregandoSlots] = useState(false);
  const [slotSelecionado, setSlotSelecionado] = useState<SlotDisponivel | null>(null);
  const [erroIndisponivel, setErroIndisponivel] = useState(false);
  const [erroGenerico, setErroGenerico] = useState<string | null>(null);
  const [tentouConfirmar, setTentouConfirmar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoAgendamento | null>(null);

  async function buscarHorarios(chaveData: string) {
    setCarregandoSlots(true);
    setErroGenerico(null);
    try {
      const res = await fetch(`/api/scheduling/availability?date=${chaveData}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { slots: SlotDisponivel[] };
      setSlots(data.slots);
    } catch {
      setSlots([]);
      setErroGenerico("Não conseguimos consultar os horários agora. Tente novamente em instantes.");
    } finally {
      setCarregandoSlots(false);
    }
  }

  function handleSelecionarData(chave: string) {
    setDataSelecionada(chave);
    setSlotSelecionado(null);
    setErroIndisponivel(false);
    void buscarHorarios(chave);
  }

  function handleSelecionarSlot(slot: SlotDisponivel) {
    setSlotSelecionado(slot);
    setErroIndisponivel(false);
  }

  const emailOk = /\S+@\S+\.\S+/.test(dadosLead.email);
  const completo = dadosLead.nome.trim().length > 1 && emailOk && slotSelecionado !== null;

  const faltando: string[] = [];
  if (dadosLead.nome.trim().length < 2) faltando.push("seu nome");
  if (!emailOk) faltando.push("um e-mail válido");
  if (dataSelecionada === null) faltando.push("a data");
  else if (slotSelecionado === null) faltando.push("o horário");

  async function handleConfirmar() {
    if (!completo || !slotSelecionado) {
      setTentouConfirmar(true);
      return;
    }

    setEnviando(true);
    setErroGenerico(null);
    try {
      const res = await fetch("/api/scheduling/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: dadosLead.nome.trim(),
          email: dadosLead.email.trim(),
          telefone: dadosLead.telefone.trim() || undefined,
          inicio: slotSelecionado.inicio,
          origem,
          campaign_id_origem: origem === "email" ? campanhaId : undefined,
          session_id: lerSessionId(),
        }),
      });

      if (res.status === 409) {
        setErroIndisponivel(true);
        setSlotSelecionado(null);
        if (dataSelecionada) void buscarHorarios(dataSelecionada);
        return;
      }

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { detail?: string };
        setErroGenerico(body.detail ?? "Não conseguimos confirmar o agendamento. Tente novamente.");
        return;
      }

      const data = (await res.json()) as {
        inicio: string;
        fim: string;
        google_meet_link: string | null;
      };
      setResultado({
        inicio: data.inicio,
        fim: data.fim,
        googleMeetLink: data.google_meet_link,
        email: dadosLead.email.trim(),
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setErroGenerico("Não conseguimos confirmar o agendamento. Verifique sua conexão e tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  function handleRecomecar() {
    setResultado(null);
    setDadosLead({ nome: "", email: "", telefone: "" });
    setDataSelecionada(null);
    setSlots([]);
    setSlotSelecionado(null);
    setErroIndisponivel(false);
    setErroGenerico(null);
    setTentouConfirmar(false);
  }

  if (resultado) {
    return (
      <div style={{ background: "#00222f" }}>
        <Cabecalho />
        <Sucesso resultado={resultado} duracaoMinutos={DURACAO_MINUTOS} onRecomecar={handleRecomecar} />
        <Rodape />
      </div>
    );
  }

  const diaFull =
    dataSelecionada !== null
      ? formatarDataCompleta(dias.find((d) => d.chave === dataSelecionada)?.data ?? new Date())
      : "";

  return (
    <div style={{ background: "#00222f" }}>
      <Cabecalho />
      <div className="mx-auto max-w-[640px] px-6">
        <FormularioLead dados={dadosLead} onChange={setDadosLead} />
        <SeletorData dataSelecionada={dataSelecionada} onSelecionar={handleSelecionarData} />
        {dataSelecionada !== null && (
          <SeletorHorario
            diaFull={diaFull}
            slots={slots}
            slotSelecionado={slotSelecionado}
            carregando={carregandoSlots}
            erroIndisponivel={erroIndisponivel}
            onSelecionar={handleSelecionarSlot}
          />
        )}
        <Confirmacao
          slotSelecionado={slotSelecionado}
          completo={completo}
          enviando={enviando}
          mostrarPendencias={tentouConfirmar && !completo}
          pendencias={`Para confirmar, falta informar: ${faltando.join(", ")}.`}
          erroGenerico={erroGenerico}
          onConfirmar={handleConfirmar}
        />
      </div>
      <Rodape />
    </div>
  );
}
