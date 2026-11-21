"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { logout } from "@/app/(app)/actions";
import {
  MapIcon,
  BuildingIcon,
  ExportIcon,
  MailIcon,
  ChartIcon,
  LogoutIcon,
  GrLogo,
} from "./icons";
import type { ReactNode } from "react";

// URL params shared between /mapa and /cnpjs screens
const SHARED_PARAM_KEYS = ["lat", "lng", "label", "raio", "sit", "cnae", "porte", "tipo", "simples", "mei", "de", "ate"] as const;
// Params only used in /cnpjs (not carried to /mapa)
const CNPJS_ONLY_KEYS = ["uf", "q"] as const;

function buildNavHref(
  targetHref: string,
  searchParams: ReturnType<typeof useSearchParams>,
  pathname: string
): string {
  const isFilterScreen = (p: string) => p.startsWith("/mapa") || p.startsWith("/cnpjs");
  if (!isFilterScreen(pathname) || !isFilterScreen(targetHref)) return targetHref;

  const next = new URLSearchParams();
  for (const key of SHARED_PARAM_KEYS) {
    const v = searchParams.get(key);
    if (v) next.set(key, v);
  }
  if (targetHref.startsWith("/cnpjs")) {
    for (const key of CNPJS_ONLY_KEYS) {
      const v = searchParams.get(key);
      if (v) next.set(key, v);
    }
  }
  const qs = next.toString();
  return qs ? `${targetHref}?${qs}` : targetHref;
}

interface SidebarProps {
  user: { name: string; email: string };
}

const NAV_MAIN = [
  { href: "/mapa",        label: "Mapa",        icon: <MapIcon /> },
  { href: "/cnpjs",       label: "CNPJs",       icon: <BuildingIcon /> },
  { href: "/exportacoes", label: "Exportações", icon: <ExportIcon /> },
  { href: "/campanhas",   label: "Campanhas",   icon: <MailIcon /> },
];

const NAV_BOTTOM = [
  { href: "/analytics", label: "Analytics", icon: <ChartIcon /> },
];

function NavItem({
  href,
  label,
  icon,
  active,
}: {
  href: string;
  label: string;
  icon: ReactNode;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
        active
          ? "bg-gr-teal text-white"
          : "text-white/70 hover:text-white hover:bg-white/10"
      }`}
    >
      <span className="w-5 h-5 flex-shrink-0">{icon}</span>
      {label}
    </Link>
  );
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <aside
      className="fixed inset-y-0 left-0 flex flex-col z-40 bg-gr-navy"
      style={{ width: "var(--sidebar-w)" }}
    >
      {/* Logo */}
      <div className="px-5 py-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <GrLogo />
          <div>
            <p className="text-white text-sm font-semibold leading-tight">
              GR Assessoria
            </p>
            <p className="text-white/50 text-xs">Radar Prospecção</p>
          </div>
        </div>
      </div>

      {/* Main nav */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {NAV_MAIN.map((item) => (
          <NavItem
            key={item.href}
            href={buildNavHref(item.href, searchParams, pathname)}
            label={item.label}
            icon={item.icon}
            active={pathname.startsWith(item.href)}
          />
        ))}
      </nav>

      {/* Secondary nav */}
      <div className="px-3 pb-2">
        <div className="border-t border-white/10 mb-2" />
        {NAV_BOTTOM.map((item) => (
          <NavItem
            key={item.href}
            href={item.href}
            label={item.label}
            icon={item.icon}
            active={pathname.startsWith(item.href)}
          />
        ))}
      </div>

      {/* User footer */}
      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-2.5 px-2 py-2">
          <div className="w-8 h-8 rounded-full bg-gr-teal flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {getInitials(user.name || user.email)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-white text-sm font-medium truncate">
              {user.name || "Usuário"}
            </p>
            <p className="text-white/50 text-xs truncate">{user.email}</p>
          </div>
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="w-full flex items-center gap-2 px-3 py-2 text-white/60 hover:text-white hover:bg-white/5 rounded-lg text-sm transition-colors mt-0.5"
          >
            <span className="w-4 h-4 flex-shrink-0">
              <LogoutIcon />
            </span>
            Sair
          </button>
        </form>
      </div>
    </aside>
  );
}
