import { formatarDataCurta, formatarHora } from "./utils";
import type { ResultadoAgendamento } from "./types";

interface Props {
  resultado: ResultadoAgendamento;
  duracaoMinutos: number;
  onRecomecar: () => void;
}

export function Sucesso({ resultado, duracaoMinutos, onRecomecar }: Props) {
  const inicio = new Date(resultado.inicio);

  return (
    <div className="mx-auto max-w-[640px] animate-[grFade_0.6s_ease_both] px-6 pb-20 pt-14">
      <div
        className="flex h-16 w-16 items-center justify-center rounded-full text-[28px] text-[#00B3A9]"
        style={{ border: "2px solid #00B3A9" }}
      >
        ✓
      </div>
      <h2 className="m-0 mt-7 font-serif text-[clamp(30px,6vw,42px)] font-normal leading-[1.15] text-white">
        Reunião <em className="not-italic text-[#00B3A9]">confirmada</em>.
      </h2>
      <p className="mt-4 text-sm font-light leading-[1.8] text-white/60">
        Enviamos a confirmação e o convite de calendário para{" "}
        <strong className="font-semibold text-white">{resultado.email}</strong>.
      </p>

      <div
        className="mt-9 grid grid-cols-3 gap-px"
        style={{ background: "rgba(255,255,255,.12)", border: "1px solid rgba(255,255,255,.12)" }}
      >
        <div className="bg-[#00222f] px-[18px] py-5">
          <div className="text-[10px] font-semibold tracking-[2px] text-white/45">DATA</div>
          <div className="mt-1.5 font-serif text-xl text-white">
            {formatarDataCurta(inicio)}
          </div>
        </div>
        <div className="bg-[#00222f] px-[18px] py-5">
          <div className="text-[10px] font-semibold tracking-[2px] text-white/45">HORÁRIO</div>
          <div className="mt-1.5 font-serif text-xl text-white">{formatarHora(resultado.inicio)}</div>
        </div>
        <div className="bg-[#00222f] px-[18px] py-5">
          <div className="text-[10px] font-semibold tracking-[2px] text-white/45">DURAÇÃO</div>
          <div className="mt-1.5 font-serif text-xl text-white">{duracaoMinutos} min</div>
        </div>
      </div>

      <div
        className="mt-5 rounded-[2px] p-6"
        style={{ background: "rgba(0,179,169,.06)", border: "1px solid rgba(0,179,169,.3)" }}
      >
        <div className="text-[11px] font-bold tracking-[2px] text-[#00B3A9]">
          LINK DA VIDEOCHAMADA · GOOGLE MEET
        </div>
        {resultado.googleMeetLink ? (
          <>
            <a
              href={resultado.googleMeetLink}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-block border-b border-[#00B3A9] text-[15px] tracking-[0.5px] text-[#00B3A9]"
            >
              {resultado.googleMeetLink}
            </a>
            <div className="mt-3 text-xs leading-[1.6] text-white/45">
              O link também está no convite enviado por e-mail. Se precisar remarcar, é só
              responder ao e-mail de confirmação.
            </div>
          </>
        ) : (
          // O design de referência sempre assume que a Calendar API devolve o
          // link do Meet — não previu o caso dela não devolver. Fallback
          // discreto, mesma paleta.
          <div className="mt-3 text-[13px] leading-[1.7] text-white/60">
            O link da videochamada está no convite enviado por e-mail.
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onRecomecar}
        className="mt-9 border-b border-[#00B3A9] bg-transparent p-0 pb-0.5 font-sans text-xs font-bold tracking-[2px] text-[#00B3A9] transition-colors hover:text-[#33cfc6] hover:border-[#33cfc6]"
      >
        ← AGENDAR OUTRO HORÁRIO
      </button>
    </div>
  );
}
