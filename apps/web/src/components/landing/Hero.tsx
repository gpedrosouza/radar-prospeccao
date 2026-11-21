import Link from "next/link";
import { ScrollReveal } from "./ScrollReveal";

const STATS = [
  {
    title: "Sem IOF",
    desc: "Operações de crédito via FIDC sem incidência de IOF",
  },
  {
    title: "Fora do Sisbacen",
    desc: "Operações não registradas no sistema do Banco Central",
  },
  {
    title: "Sob medida",
    desc: "Estruturação de operações para o perfil da sua empresa",
  },
];

export function Hero() {
  return (
    <div
      id="topo"
      className="relative overflow-hidden px-6 pb-24 pt-28 md:px-12 md:pb-[100px] md:pt-[120px]"
      style={{ background: "linear-gradient(160deg,#003650 0%,#00222f 70%)" }}
    >
      <div
        className="pointer-events-none absolute -bottom-20 -left-[60px] h-[420px] w-[520px]"
        style={{
          clipPath: "polygon(0 100%,0 15%,100% 100%)",
          background: "rgba(0,179,169,.08)",
        }}
      />
      <div
        className="pointer-events-none absolute right-0 top-0 h-[300px] w-[380px]"
        style={{
          clipPath: "polygon(100% 0,20% 0,100% 100%)",
          background: "rgba(0,179,169,.06)",
        }}
      />
      <ScrollReveal className="relative mx-auto max-w-[1100px]">
        <div className="mb-7 text-[11px] font-bold tracking-[5px] text-[#00B3A9]">
          FIDC · CRÉDITO · GESTÃO
        </div>
        <h1 className="max-w-[900px] font-serif text-5xl font-normal leading-[1.08] tracking-[-1px] text-white md:text-[76px]">
          Sua empresa com{" "}
          <em className="text-[#00B3A9]">liquidez financeira</em> para operar e
          crescer.
        </h1>
        <p className="mt-8 max-w-[560px] text-[17px] font-light leading-[1.8] text-white/65">
          Soluções de crédito estruturado para empresas e pessoas físicas — com
          atendimento consultivo, agilidade e operações sob medida.
        </p>
        <div className="mt-11 flex flex-wrap gap-4">
          <a
            href="#simulador"
            className="rounded-sm bg-[#00B3A9] px-9 py-[18px] text-[13px] font-bold tracking-[2px] text-[#00222f] transition-colors hover:bg-[#33cfc6]"
          >
            SIMULAR PARA MEU NEGÓCIO
          </a>
          <Link
            href="/agende"
            className="rounded-sm border border-white/30 px-9 py-[18px] text-[13px] font-semibold tracking-[2px] text-white transition-colors hover:border-[#00B3A9] hover:text-[#00B3A9]"
          >
            AGENDAR REUNIÃO
          </Link>
        </div>
      </ScrollReveal>
      <ScrollReveal className="relative mx-auto mt-[90px] grid max-w-[1100px] grid-cols-1 gap-px border border-white/10 bg-white/10 sm:grid-cols-3">
        {STATS.map((stat) => (
          <div key={stat.title} className="bg-[#00222f] px-8 py-7">
            <div className="font-serif text-[34px] text-white">{stat.title}</div>
            <div className="mt-1.5 text-xs leading-[1.6] text-white/50">
              {stat.desc}
            </div>
          </div>
        ))}
      </ScrollReveal>
    </div>
  );
}
