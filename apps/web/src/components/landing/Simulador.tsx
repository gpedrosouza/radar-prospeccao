"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

// TODO(produto): fórmula portada 1:1 do protótipo de referência (Landing Page GR.dc.html).
// PJ trata o valor como recebíveis antecipados com deságio linear simples (v * (1 - i*n*0.5));
// PF usa a fórmula de amortização (Tabela Price) sobre o valor como principal financiado.
// Ambas usam taxa mensal fixa (1,6% a.m. PJ / 2,1% a.m. PF) sem variação por prazo ou risco.
// Validar com a área de produto antes de publicar — são apenas estimativas ilustrativas.
const TAXA_MENSAL_PJ = 1.9;
const TAXA_MENSAL_PF = 2.1;

const currencyFmt = (value: number) =>
  value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });

const TAB_BASE =
  "rounded-sm px-5 py-3 text-[11px] font-bold tracking-[1.5px] transition-colors";

export function Simulador() {
  const [simTab, setSimTab] = useState<"pj" | "pf">("pj");
  const [simValor, setSimValor] = useState(500000);
  const [simPrazo, setSimPrazo] = useState(12);

  const { labelValor, labelResultado, resultadoFmt, taxaFmt, prazoFmt } = useMemo(() => {
    const taxa = simTab === "pj" ? TAXA_MENSAL_PJ : TAXA_MENSAL_PF;
    const i = taxa / 100;
    const n = simPrazo;
    const v = simValor;

    const resultado =
      simTab === "pj"
        ? v * (1 - i * n * 0.5)
        : (v * (i * Math.pow(1 + i, n))) / (Math.pow(1 + i, n) - 1);

    return {
      labelValor: simTab === "pj" ? "VALOR EM RECEBÍVEIS" : "VALOR DO CRÉDITO",
      labelResultado: simTab === "pj" ? "VALOR LÍQUIDO ESTIMADO" : "PARCELA ESTIMADA",
      resultadoFmt: currencyFmt(Math.max(0, resultado)),
      taxaFmt: `${taxa.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% a.m.`,
      prazoFmt: `${n}${n === 1 ? " mês" : " meses"}`,
    };
  }, [simTab, simValor, simPrazo]);

  return (
    <div
      id="simulador"
      className="px-6 py-24 md:px-12 md:py-[110px]"
      style={{ background: "linear-gradient(160deg,#00435f,#00222f)" }}
    >
      <div className="mx-auto grid max-w-[1100px] grid-cols-1 items-start gap-14 lg:grid-cols-[1fr_1.1fr] lg:gap-[72px]">
        <div>
          <div className="text-[11px] font-bold tracking-[4px] text-[#00B3A9]">
            SIMULADOR
          </div>
          <div className="my-5 h-0.5 w-12 bg-[#00B3A9]" />
          <h2 className="font-serif text-4xl font-normal leading-[1.12] text-white md:text-[46px]">
            Simule agora para o seu negócio.
          </h2>
          <p className="mt-6 text-[15px] font-light leading-[1.8] text-white/60">
            Estimativa instantânea, sem compromisso. Os valores finais dependem
            de análise de crédito e da estrutura da operação.
          </p>
          <div className="mt-9 border border-[#00B3A9]/30 bg-[#00B3A9]/[0.06] px-7 py-6">
            <div className="text-[13px] font-bold tracking-wide text-[#00B3A9]">
              PREFERE CONVERSAR?
            </div>
            <div className="mt-2 text-[13px] leading-[1.7] text-white/65">
              Agende uma reunião com um assessor e receba um diagnóstico
              consultivo gratuito.
            </div>
            <Link
              href="/agende"
              className="mt-4 inline-block border-b border-[#00B3A9] text-xs font-bold tracking-[2px] text-[#00B3A9] transition-colors hover:text-[#33cfc6]"
            >
              AGENDAR REUNIÃO →
            </Link>
          </div>
        </div>

        <div className="rounded-sm bg-[#f4f6f8] px-8 py-11 text-[#00222f] sm:px-10">
          <div className="flex gap-2">
            <button
              onClick={() => setSimTab("pj")}
              className={`${TAB_BASE} ${
                simTab === "pj" ? "bg-[#003650] text-white" : "bg-transparent text-[#667]"
              }`}
            >
              EMPRESA · PJ
            </button>
            <button
              onClick={() => setSimTab("pf")}
              className={`${TAB_BASE} ${
                simTab === "pf" ? "bg-[#003650] text-white" : "bg-transparent text-[#667]"
              }`}
            >
              PESSOA FÍSICA
            </button>
          </div>

          <div className="mt-8">
            <div className="flex justify-between text-xs font-bold tracking-wide text-[#003650]">
              <span>{labelValor}</span>
              <span className="text-[#008f87] transition-all">
                {currencyFmt(simValor)}
              </span>
            </div>
            <input
              type="range"
              min={50000}
              max={5000000}
              step={50000}
              value={simValor}
              onChange={(e) => setSimValor(Number(e.target.value))}
              className="mt-3 w-full accent-[#00B3A9]"
            />
          </div>

          <div className="mt-7">
            <div className="flex justify-between text-xs font-bold tracking-wide text-[#003650]">
              <span>PRAZO</span>
              <span className="text-[#008f87] transition-all">{prazoFmt}</span>
            </div>
            <input
              type="range"
              min={1}
              max={36}
              step={1}
              value={simPrazo}
              onChange={(e) => setSimPrazo(Number(e.target.value))}
              className="mt-3 w-full accent-[#00B3A9]"
            />
          </div>

          <div className="mt-9 grid grid-cols-2 grid-rows-2 gap-x-5 gap-y-1.5 border-t border-[#003650]/[0.12] pt-7">
            <div className="text-[11px] font-semibold tracking-wide text-[#667]">
              {labelResultado}
            </div>
            <div className="text-[11px] font-semibold tracking-wide text-[#667]">
              TAXA ESTIMADA
            </div>
            <div className="min-w-0 break-words font-serif text-xl text-[#003650] transition-all sm:text-4xl">
              {resultadoFmt}
            </div>
            <div className="min-w-0 break-words font-serif text-xl text-[#003650] sm:text-4xl">
              {taxaFmt}
            </div>
          </div>

          <Link
            href="/agende"
            className="mt-8 block bg-[#003650] py-[18px] text-center text-[13px] font-bold tracking-[2px] text-white transition-colors hover:bg-[#00B3A9] hover:text-[#00222f]"
          >
            QUERO ESSA CONDIÇÃO →
          </Link>
          <div className="mt-4 text-[11px] leading-[1.6] text-[#899]">
            * Estimativa ilustrativa. Condições finais sujeitas a análise de
            crédito e à estrutura da operação.
          </div>
        </div>
      </div>
    </div>
  );
}
