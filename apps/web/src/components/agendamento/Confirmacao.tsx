import { formatarDataCurta, formatarHora } from "./utils";
import type { SlotDisponivel } from "./types";

interface Props {
  slotSelecionado: SlotDisponivel | null;
  completo: boolean;
  enviando: boolean;
  mostrarPendencias: boolean;
  pendencias: string;
  erroGenerico: string | null;
  onConfirmar: () => void;
}

export function Confirmacao({
  slotSelecionado,
  completo,
  enviando,
  mostrarPendencias,
  pendencias,
  erroGenerico,
  onConfirmar,
}: Props) {
  const resumoCurto = slotSelecionado
    ? `${formatarDataCurta(new Date(slotSelecionado.inicio))} · ${formatarHora(slotSelecionado.inicio)}`
    : "";

  const habilitado = completo && !enviando;

  return (
    <div className="animate-[grFade_0.6s_ease_both] pb-[72px] pt-14">
      {slotSelecionado && (
        <div
          className="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-[2px] px-[22px] py-[18px]"
          style={{ background: "rgba(0,179,169,.06)", border: "1px solid rgba(0,179,169,.3)" }}
        >
          <div className="text-[11px] font-bold tracking-[2px] text-[#00B3A9]">SUA REUNIÃO</div>
          <div className="font-serif text-xl text-white">{resumoCurto}</div>
        </div>
      )}

      <button
        type="button"
        onClick={onConfirmar}
        disabled={!habilitado}
        className="block w-full rounded-[2px] border-none p-[19px] font-sans text-[13px] font-bold tracking-[2px] transition-colors"
        style={
          habilitado
            ? { background: "#00B3A9", color: "#00222f", cursor: "pointer" }
            : { background: "rgba(255,255,255,.08)", color: "rgba(255,255,255,.35)", cursor: "not-allowed" }
        }
      >
        {enviando ? "CONFIRMANDO…" : "CONFIRMAR AGENDAMENTO"}
      </button>

      {mostrarPendencias && (
        <div className="mt-3.5 text-xs leading-[1.7] text-[#e0b56a]">{pendencias}</div>
      )}

      {/* Erro genérico de rede/servidor não existe no design de referência —
          estado mínimo, mesma paleta de aviso do erro de slot indisponível. */}
      {erroGenerico && (
        <div className="mt-3.5 text-xs leading-[1.7] text-[#e0b56a]">{erroGenerico}</div>
      )}
    </div>
  );
}
