import { SectionHeading } from "./SectionHeading";
import { ErroSlotIndisponivel } from "./ErroSlotIndisponivel";
import { formatarHora } from "./utils";
import type { SlotDisponivel } from "./types";

interface Props {
  diaFull: string;
  slots: SlotDisponivel[];
  slotSelecionado: SlotDisponivel | null;
  carregando: boolean;
  erroIndisponivel: boolean;
  onSelecionar: (slot: SlotDisponivel) => void;
}

export function SeletorHorario({
  diaFull,
  slots,
  slotSelecionado,
  carregando,
  erroIndisponivel,
  onSelecionar,
}: Props) {
  return (
    <div className="animate-[grFade_0.45s_ease_both] pt-14">
      <SectionHeading numero="03" titulo="ESCOLHA O HORÁRIO" />
      <div className="mb-6 text-[13px] font-light text-white/55">{diaFull}</div>

      {erroIndisponivel && <ErroSlotIndisponivel />}

      {/* Loading não existe no design de referência — estado discreto, sem
          spinner chamativo, seguindo a paleta já usada no resto da página. */}
      {carregando && (
        <div className="py-6 text-center text-[13px] font-light text-white/45">
          Consultando horários…
        </div>
      )}

      {!carregando && slots.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-2">
          {slots.map((slot) => {
            const selecionado = slotSelecionado?.inicio === slot.inicio;
            return (
              <button
                key={slot.inicio}
                type="button"
                onClick={() => onSelecionar(slot)}
                className="rounded-[2px] py-3.5 text-center font-sans text-sm font-semibold tracking-[1px] transition-colors"
                style={
                  selecionado
                    ? { background: "#00B3A9", border: "1px solid #00B3A9", color: "#00222f" }
                    : { background: "transparent", border: "1px solid rgba(255,255,255,.25)", color: "#fff" }
                }
              >
                {formatarHora(slot.inicio)}
              </button>
            );
          })}
        </div>
      )}

      {!carregando && slots.length === 0 && (
        <div className="rounded-[2px] border border-dashed border-white/20 px-6 py-7 text-center">
          <div className="text-sm font-light leading-[1.7] text-white/65">
            Nenhum horário disponível nesse dia.
            <br />
            Escolha outra data acima.
          </div>
        </div>
      )}
    </div>
  );
}
