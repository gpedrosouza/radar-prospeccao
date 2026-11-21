"use client";

import { useState } from "react";

const FAQS = [
  {
    q: "O que é um FIDC e por que ele é vantajoso?",
    a: "O FIDC (Fundo de Investimento em Direitos Creditórios) é um veículo regulado que compra recebíveis de empresas, antecipando caixa. Por não ser uma operação bancária tradicional, não há incidência de IOF e a operação não é registrada no Sisbacen — com flexibilidade e taxas competitivas.",
  },
  {
    q: "Minha empresa precisa ter um faturamento mínimo?",
    a: "Cada operação é analisada individualmente. O mais importante é a qualidade dos recebíveis e a saúde da carteira de sacados. Agende uma conversa e faremos um diagnóstico sem compromisso.",
  },
  {
    q: "Qual a diferença entre cessão com e sem regresso?",
    a: "Na cessão com regresso, se o sacado não pagar, sua empresa recompra o título. Na cessão sem regresso, o risco de inadimplência do sacado é do fundo — sua empresa não é obrigada a recomprar, salvo em caso de vícios no título.",
  },
  {
    q: "A simulação gera algum compromisso?",
    a: "Não. A simulação é uma estimativa ilustrativa e gratuita. As condições finais dependem de análise de crédito e da estrutura da operação.",
  },
  {
    q: "Quanto tempo leva para a operação gerar caixa?",
    a: "Após a aprovação e formalização, a antecipação de recebíveis costuma gerar liquidez em poucos dias úteis. A agilidade é um dos nossos principais diferenciais frente aos bancos.",
  },
];

export function Faq() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div id="faq" className="mx-auto max-w-[860px] px-6 py-24 md:px-12 md:py-[110px]">
      <div className="text-[11px] font-bold tracking-[4px] text-[#00B3A9]">
        PERGUNTAS FREQUENTES
      </div>
      <div className="my-5 mb-10 h-0.5 w-12 bg-[#00B3A9]" />
      {FAQS.map((faq, index) => {
        const isOpen = openIndex === index;
        return (
          <div key={faq.q} className="border-b border-white/[0.12]">
            <button
              onClick={() => setOpenIndex(isOpen ? null : index)}
              className="flex w-full items-center justify-between gap-6 py-6 text-left"
              aria-expanded={isOpen}
            >
              <span className="text-base font-semibold text-white">{faq.q}</span>
              <span className="flex-shrink-0 font-serif text-2xl text-[#00B3A9]">
                {isOpen ? "−" : "+"}
              </span>
            </button>
            <div
              className={`grid transition-[grid-template-rows] duration-300 ease-out ${
                isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
              }`}
            >
              <div className="overflow-hidden">
                <div
                  className={`pb-6 pr-0 text-sm font-light leading-[1.8] text-white/60 transition-opacity duration-300 ${
                    isOpen ? "opacity-100" : "opacity-0"
                  }`}
                >
                  {faq.a}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
