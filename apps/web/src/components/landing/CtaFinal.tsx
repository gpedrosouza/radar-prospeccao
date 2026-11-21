import Image from "next/image";
import Link from "next/link";
import { ScrollReveal } from "./ScrollReveal";

export function CtaFinal() {
  return (
    <div
      className="px-6 pt-24 md:px-12 md:pt-[110px]"
      style={{ background: "linear-gradient(135deg,#003650,#001f2e)" }}
    >
      <ScrollReveal className="mx-auto max-w-[1100px] text-center">
        <Image
          src="/landing/logo.png"
          alt="GR"
          width={56}
          height={56}
          className="mx-auto h-14 w-auto invert"
        />
        <h2 className="mx-auto mt-8 max-w-[700px] font-serif text-4xl font-normal leading-[1.12] text-white md:text-[52px]">
          Vamos construir a liquidez do seu negócio?
        </h2>
        <div className="mt-10 flex flex-wrap justify-center gap-4">
          <a
            href="#simulador"
            className="rounded-sm bg-[#00B3A9] px-9 py-[18px] text-[13px] font-bold tracking-[2px] text-[#00222f] transition-colors hover:bg-[#33cfc6]"
          >
            FAZER SIMULAÇÃO
          </a>
          <Link
            href="/agende"
            className="rounded-sm border border-white/30 px-9 py-[18px] text-[13px] font-semibold tracking-[2px] text-white transition-colors hover:border-[#00B3A9] hover:text-[#00B3A9]"
          >
            AGENDAR REUNIÃO
          </Link>
        </div>
      </ScrollReveal>
      <div className="mx-auto mt-[90px] flex max-w-[1100px] flex-wrap items-center justify-between gap-4 border-t border-white/[0.12] py-8 text-xs text-white/45">
        <div>
          <strong className="text-white/70">Alexander Ciarlo</strong> · Gestor
          Financeiro · 55 (16) 9 8803-7000
        </div>
        <div>Rua São Pio X, 343 - Sala 21, Vila Prado - São Carlos/SP</div>
        <div className="flex items-center gap-4">
          <span>www.grgestaofinanceira.com.br</span>
          <Link href="/login" className="text-white/30 transition-colors hover:text-[#00B3A9]">
            Entrar
          </Link>
        </div>
      </div>
    </div>
  );
}
