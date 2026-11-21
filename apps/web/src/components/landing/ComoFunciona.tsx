import { ScrollReveal } from "./ScrollReveal";

const STEPS = [
  {
    n: "01",
    title: "Simulação ou reunião",
    desc: "Você simula online ou agenda uma conversa para entendermos sua necessidade.",
  },
  {
    n: "02",
    title: "Diagnóstico consultivo",
    desc: "Analisamos fluxo de caixa, recebíveis e objetivos antes de propor qualquer solução.",
  },
  {
    n: "03",
    title: "Estruturação sob medida",
    desc: "Desenhamos a operação ideal — FIDC, crédito ou gestão — com condições competitivas.",
  },
  {
    n: "04",
    title: "Acompanhamento contínuo",
    desc: "Seguimos ao seu lado em cada etapa da jornada financeira da empresa.",
  },
];

export function ComoFunciona() {
  return (
    <ScrollReveal className="mx-auto max-w-[1100px] px-6 py-24 md:px-12 md:py-[110px]">
      <div className="text-[11px] font-bold tracking-[4px] text-[#00B3A9]">
        COMO FUNCIONA
      </div>
      <div className="my-5 h-0.5 w-12 bg-[#00B3A9]" />
      <h2 className="mb-14 font-serif text-4xl font-normal text-white md:text-[42px]">
        Do primeiro contato à liquidez, em 4 passos.
      </h2>
      <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((step) => (
          <div key={step.n}>
            <div className="font-serif text-5xl text-[#00B3A9]/50">{step.n}</div>
            <div className="mb-2 mt-2.5 text-[15px] font-bold text-white">
              {step.title}
            </div>
            <div className="text-[13px] leading-[1.7] text-white/55">{step.desc}</div>
          </div>
        ))}
      </div>
    </ScrollReveal>
  );
}
