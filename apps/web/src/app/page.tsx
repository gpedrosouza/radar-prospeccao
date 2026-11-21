import type { Metadata } from "next";
import { auth } from "@/auth";
import { Nav } from "@/components/landing/Nav";
import { Hero } from "@/components/landing/Hero";
import { Sobre } from "@/components/landing/Sobre";
import { Produtos } from "@/components/landing/Produtos";
import { Fidc } from "@/components/landing/Fidc";
import { ComoFunciona } from "@/components/landing/ComoFunciona";
import { Simulador } from "@/components/landing/Simulador";
import { Segmentos } from "@/components/landing/Segmentos";
import { Depoimentos } from "@/components/landing/Depoimentos";
import { Faq } from "@/components/landing/Faq";
import { CtaFinal } from "@/components/landing/CtaFinal";

export const metadata: Metadata = {
  title: "GR Gestão Financeira — Liquidez financeira para operar e crescer",
  description:
    "Soluções de crédito estruturado via FIDC para empresas e pessoas físicas — atendimento consultivo, agilidade e operações sob medida, sem IOF e fora do Sisbacen.",
  openGraph: {
    title: "GR Gestão Financeira — Liquidez financeira para operar e crescer",
    description:
      "Soluções de crédito estruturado via FIDC para empresas e pessoas físicas — atendimento consultivo, agilidade e operações sob medida.",
    images: ["/landing/logo.png"],
    locale: "pt_BR",
    type: "website",
  },
};

export default async function LandingPage() {
  const session = await auth();
  const hasSession = Boolean(session?.user);

  return (
    <div className="bg-[#00222f] font-sans text-[#f4f6f8]">
      <Nav hasSession={hasSession} />
      <Hero />
      <Sobre />
      <Produtos />
      <Fidc />
      <ComoFunciona />
      <Simulador />
      <Segmentos />
      <Depoimentos />
      <Faq />
      <CtaFinal />
    </div>
  );
}
