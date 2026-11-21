"use client";

import { useState } from "react";

type Produto = { nome: string; desc: string };

const PRODUTOS_PJ: Produto[] = [
  {
    nome: "Crédito Empresarial",
    desc: "Capital para giro, expansão e novos projetos, com estrutura adequada ao fluxo de caixa da empresa.",
  },
  {
    nome: "Home Equity",
    desc: "Crédito com garantia de imóvel: taxas menores e prazos longos para destravar grandes projetos.",
  },
  {
    nome: "Consórcios",
    desc: "Planejamento de aquisição de bens e imóveis sem juros, com parcelas que cabem no orçamento.",
  },
  {
    nome: "Auto Equity",
    desc: "Crédito com garantia de veículo — liquidez rápida sem abrir mão do bem.",
  },
  {
    nome: "Financiamento de Veículos",
    desc: "Renovação e ampliação de frota com condições competitivas.",
  },
  {
    nome: "Seguros",
    desc: "Proteção patrimonial e operacional para o negócio e seus sócios.",
  },
];

const PRODUTOS_PF: Produto[] = [
  {
    nome: "Crédito Imobiliário",
    desc: "Financiamento para aquisição do seu imóvel com as melhores condições do mercado.",
  },
  {
    nome: "Home Equity",
    desc: "Use seu imóvel como garantia e acesse crédito com taxas reduzidas e prazos longos.",
  },
  {
    nome: "Consórcios",
    desc: "Conquiste bens e imóveis sem juros, com planejamento e disciplina.",
  },
  {
    nome: "Auto Equity",
    desc: "Crédito com garantia de veículo, sem precisar vendê-lo.",
  },
  {
    nome: "Financiamento de Veículos",
    desc: "Seu carro novo ou seminovo com parcelas ajustadas à sua renda.",
  },
  {
    nome: "Empréstimo Consignado",
    desc: "Crédito com desconto em folha e as menores taxas do mercado.",
  },
  {
    nome: "Seguros e Previdência",
    desc: "Proteção para você e sua família, hoje e no futuro.",
  },
  {
    nome: "Mercado de Energia",
    desc: "Economia na conta de luz via mercado livre de energia.",
  },
];

const TAB_BASE =
  "rounded-sm px-5 py-3 text-[11px] font-bold tracking-[1.5px] transition-colors";

export function Produtos() {
  const [tab, setTab] = useState<"pj" | "pf">("pj");
  const produtos = tab === "pj" ? PRODUTOS_PJ : PRODUTOS_PF;

  return (
    <div id="produtos" className="bg-[#f4f6f8] px-6 py-24 text-[#00222f] md:px-12 md:py-[110px]">
      <div className="mx-auto max-w-[1100px]">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <div className="text-[11px] font-bold tracking-[4px] text-[#008f87]">
              NOSSOS PRODUTOS
            </div>
            <div className="my-5 h-0.5 w-12 bg-[#00B3A9]" />
            <h2 className="font-serif text-4xl font-normal leading-[1.1] text-[#003650] md:text-[46px]">
              O que sua empresa
              <br />
              precisa hoje?
            </h2>
          </div>
          <div className="flex gap-2 rounded-sm border border-[#003650]/[0.12] bg-white p-1.5">
            <button
              onClick={() => setTab("pj")}
              className={`${TAB_BASE} ${
                tab === "pj" ? "bg-[#003650] text-white" : "bg-transparent text-[#667]"
              }`}
            >
              EMPRESAS · PJ
            </button>
            <button
              onClick={() => setTab("pf")}
              className={`${TAB_BASE} ${
                tab === "pf" ? "bg-[#003650] text-white" : "bg-transparent text-[#667]"
              }`}
            >
              PESSOA FÍSICA
            </button>
          </div>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {produtos.map((p) => (
            <div
              key={p.nome}
              className="border border-[#003650]/10 border-t-[3px] border-t-[#00B3A9] bg-white px-7 py-8 transition-all hover:-translate-y-1 hover:shadow-[0_12px_30px_rgba(0,54,80,0.12)]"
            >
              <div className="text-sm font-bold uppercase tracking-wide text-[#003650]">
                {p.nome}
              </div>
              <div className="mt-3 text-[13px] leading-[1.7] text-[#556]">{p.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
