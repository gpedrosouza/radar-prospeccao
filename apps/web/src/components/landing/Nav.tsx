"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

const SECTION_IDS = ["produtos", "fidc", "simulador", "faq"] as const;

const NAV_LINKS: { id: (typeof SECTION_IDS)[number]; label: string }[] = [
  { id: "produtos", label: "PRODUTOS" },
  { id: "fidc", label: "FIDC" },
  { id: "simulador", label: "SIMULADOR" },
  { id: "faq", label: "FAQ" },
];

export function Nav({ hasSession }: { hasSession: boolean }) {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const sections = SECTION_IDS.map((id) => document.getElementById(id)).filter(
      (el): el is HTMLElement => el !== null
    );

    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) {
          setActiveId(visible.target.id);
        }
      },
      { rootMargin: "-40% 0px -50% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] }
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="sticky top-0 z-50 flex items-center justify-between gap-6 border-b border-white/[0.08] bg-[#00222f]/85 px-6 py-[18px] backdrop-blur-md md:px-12">
      <a href="#topo" className="flex items-center gap-3">
        <Image
          src="/landing/logo.png"
          alt="GR"
          width={34}
          height={34}
          className="h-[34px] w-auto invert"
          priority
        />
        <span className="hidden text-[10px] font-light tracking-[4px] text-white/55 sm:inline">
          GESTÃO FINANCEIRA
        </span>
      </a>
      <div className="flex items-center gap-5 md:gap-8">
        {NAV_LINKS.map((link) => (
          <a
            key={link.id}
            href={`#${link.id}`}
            className={`hidden text-xs font-medium tracking-[1.5px] transition-colors sm:inline ${
              activeId === link.id ? "text-[#00B3A9]" : "text-white/75 hover:text-[#00B3A9]"
            }`}
          >
            {link.label}
          </a>
        ))}
        {hasSession ? (
          <Link
            href="/mapa"
            className="rounded-sm bg-[#00B3A9] px-6 py-3 text-xs font-bold tracking-[2px] text-[#00222f] transition-colors hover:bg-[#33cfc6]"
          >
            IR PARA O PAINEL
          </Link>
        ) : (
          <Link
            href="/agende"
            className="rounded-sm bg-[#00B3A9] px-6 py-3 text-xs font-bold tracking-[2px] text-[#00222f] transition-colors hover:bg-[#33cfc6]"
          >
            AGENDAR REUNIÃO
          </Link>
        )}
      </div>
    </div>
  );
}
