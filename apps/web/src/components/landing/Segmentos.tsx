import { ScrollReveal } from "./ScrollReveal";

const SEGMENTOS = ["Agronegócio", "Indústria", "Comércio", "Serviços"];

export function Segmentos() {
  return (
    <ScrollReveal className="mx-auto max-w-[1100px] px-6 py-24 md:px-12 md:py-[110px]">
      <div className="grid grid-cols-1 items-center gap-14 md:grid-cols-2 md:gap-[72px]">
        <div>
          <div className="text-[11px] font-bold tracking-[4px] text-[#00B3A9]">
            ATUAÇÃO
          </div>
          <div className="my-5 h-0.5 w-12 bg-[#00B3A9]" />
          <h2 className="font-serif text-4xl font-normal leading-[1.15] text-white md:text-[42px]">
            Soluções GR para todos os segmentos.
          </h2>
        </div>
        <div className="grid grid-cols-2 gap-px border border-white/[0.12] bg-white/[0.12]">
          {SEGMENTOS.map((segmento) => (
            <div key={segmento} className="bg-[#00222f] px-8 py-8 text-center">
              <div className="font-serif text-xl text-white">{segmento}</div>
            </div>
          ))}
        </div>
      </div>
    </ScrollReveal>
  );
}
