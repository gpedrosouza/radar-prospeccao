import Link from "next/link";

export function Cabecalho() {
  return (
    <div
      className="relative overflow-hidden px-6 pb-14 pt-7"
      style={{ background: "linear-gradient(160deg,#003650 0%,#00222f 70%)" }}
    >
      <div
        className="pointer-events-none absolute right-0 top-0 h-[220px] w-[300px]"
        style={{
          clipPath: "polygon(100% 0,25% 0,100% 100%)",
          background: "rgba(0,179,169,.06)",
        }}
      />
      <div className="relative mx-auto max-w-[640px]">
        <Link href="/" className="inline-flex items-baseline gap-3">
          <span className="font-serif text-3xl tracking-[1px] text-white">GR</span>
          <span className="text-[10px] font-light tracking-[4px] text-white/55">
            GESTÃO FINANCEIRA
          </span>
        </Link>
        <div className="mt-11 animate-[grFade_0.8s_ease_both]">
          <div className="mb-5 text-[11px] font-bold tracking-[5px] text-[#00B3A9]">
            DIAGNÓSTICO GRATUITO
          </div>
          <h1 className="m-0 font-serif text-[clamp(34px,7vw,52px)] font-normal leading-[1.12] tracking-[-0.5px] text-white">
            Agende seu <em className="not-italic text-[#00B3A9]">diagnóstico financeiro</em> com
            um assessor GR.
          </h1>
          <p className="mt-5 text-sm font-light leading-[1.8] text-white/60">
            30 minutos, por videochamada, sem compromisso. Resposta de confirmação em até 1 dia
            útil.
          </p>
        </div>
      </div>
    </div>
  );
}
