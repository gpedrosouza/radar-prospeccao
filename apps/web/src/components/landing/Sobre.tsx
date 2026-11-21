import { ScrollReveal } from "./ScrollReveal";

export function Sobre() {
  return (
    <ScrollReveal className="mx-auto grid max-w-[1100px] grid-cols-1 gap-14 px-6 py-24 md:grid-cols-[1fr_1.2fr] md:gap-20 md:px-12 md:py-[110px]">
      <div>
        <div className="text-[11px] font-bold tracking-[4px] text-[#00B3A9]">
          QUEM SOMOS
        </div>
        <div className="my-5 h-0.5 w-12 bg-[#00B3A9]" />
        <h2 className="font-serif text-4xl font-normal leading-[1.15] text-white md:text-[42px]">
          Atendimento consultivo, soluções além dos números.
        </h2>
      </div>
      <div className="text-[15px] font-light leading-[1.9] text-white/[0.68]">
        <p className="mb-[18px] mt-0">
          A GR Gestão Financeira é um escritório especializado em soluções
          financeiras personalizadas para empresas e pessoas que buscam crescer
          com segurança, liquidez e eficiência.
        </p>
        <p className="mb-[18px]">
          Sob a liderança de{" "}
          <strong className="font-semibold text-white">Alexander Ciarlo</strong>,
          profissional com ampla experiência no mercado financeiro, a GR se
          destaca pela capacidade de entender as necessidades reais de cada
          cliente — propondo soluções que vão além dos números.
        </p>
        <p className="m-0">
          Nosso compromisso é acompanhar cada etapa da jornada financeira,
          construindo juntos um caminho sólido para o sucesso.
        </p>
      </div>
    </ScrollReveal>
  );
}
