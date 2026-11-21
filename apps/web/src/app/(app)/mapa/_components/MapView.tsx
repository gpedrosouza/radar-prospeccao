"use client";

import { useEffect, useRef, useState } from "react";
import { MarkerClusterer } from "@googlemaps/markerclusterer";
import { loadGoogleMaps } from "@/lib/google-maps";
import { getSituacaoColor, formatCnpj } from "./utils";
import type { CnpjMapItem } from "./types";

interface MapViewProps {
  origin: { lat: number; lng: number } | null;
  radiusKm: number;
  companies: CnpjMapItem[];
  isLoading: boolean;
}

const BRAZIL_CENTER = { lat: -14.235, lng: -51.925 };
const BRAZIL_ZOOM = 4;
const ORIGIN_ZOOM = 10;

function buildInfoContent(c: CnpjMapItem): string {
  const color = getSituacaoColor(c.situacao);
  const badge = `background:${color}22;color:${color};padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600`;
  return `
    <div style="font-family:system-ui,sans-serif;padding:4px 2px;max-width:260px;min-width:200px">
      <div style="font-weight:700;color:#0f2040;font-size:13px;margin-bottom:4px;line-height:1.3">
        ${c.razao_social}
      </div>
      ${c.nome_fantasia ? `<div style="color:#4a5568;font-size:11px;margin-bottom:4px">${c.nome_fantasia}</div>` : ""}
      <div style="color:#94a3b8;font-size:11px;margin-bottom:2px">${formatCnpj(c.cnpj)}</div>
      <div style="color:#4a5568;font-size:11px;margin-bottom:2px">CNAE: ${c.cnae_principal}</div>
      ${c.porte ? `<div style="color:#4a5568;font-size:11px;margin-bottom:2px">Porte: ${c.porte}</div>` : ""}
      ${c.municipio_nome ? `<div style="color:#4a5568;font-size:11px;margin-bottom:6px">${c.municipio_nome} · ${c.uf}</div>` : ""}
      <span style="${badge}">${c.situacao}</span>
    </div>
  `;
}

export function MapView({ origin, radiusKm, companies, isLoading }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const circleRef = useRef<google.maps.Circle | null>(null);
  const originMarkerRef = useRef<google.maps.Marker | null>(null);
  const companyMarkersRef = useRef<google.maps.Marker[]>([]);
  // Clustering: com milhares de empresas geocodificadas no mesmo CEP (ver
  // discussão sobre precisão da cascata de geocodificação), pins sobrepostos
  // 1:1 no mapa ficam ilegíveis e pesados pro navegador. O clusterer agrupa
  // por proximidade/zoom e mostra uma bolha com contagem em vez de N pins
  // empilhados no mesmo pixel.
  const clustererRef = useRef<MarkerClusterer | null>(null);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  // Estado (não ref): precisa disparar re-render pra reexecutar os efeitos de
  // origem/círculo e marcadores de empresa quando o mapa termina de carregar
  // DEPOIS que origin/companies já chegaram (busca respondeu mais rápido que
  // o script do Google Maps) — com ref simples esses efeitos rodavam uma vez,
  // viam o mapa ainda não pronto, saíam, e nunca tentavam de novo (companies
  // só muda de referência quando uma nova busca é feita).
  const [mapReady, setMapReady] = useState(false);

  const hasApiKey = Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY);

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current || !hasApiKey) return;

    loadGoogleMaps().then((maps) => {
      if (!containerRef.current || mapRef.current) return;

      const map = new maps.Map(containerRef.current, {
        center: BRAZIL_CENTER,
        zoom: BRAZIL_ZOOM,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        zoomControl: true,
        zoomControlOptions: {
          position: maps.ControlPosition.RIGHT_TOP,
        },
        clickableIcons: false,
      });

      mapRef.current = map;
      infoWindowRef.current = new maps.InfoWindow();
      clustererRef.current = new MarkerClusterer({ map });
      setMapReady(true);
    });
  }, [hasApiKey]);

  // Update circle + origin marker when origin/radius changes
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    const map = mapRef.current;
    const maps = window.google.maps;

    // Circle
    if (circleRef.current) {
      circleRef.current.setMap(null);
      circleRef.current = null;
    }
    // Origin marker
    if (originMarkerRef.current) {
      originMarkerRef.current.setMap(null);
      originMarkerRef.current = null;
    }

    if (origin) {
      circleRef.current = new maps.Circle({
        center: origin,
        radius: radiusKm * 1000,
        fillColor: "#00bfa5",
        fillOpacity: 0.08,
        strokeColor: "#00bfa5",
        strokeOpacity: 0.7,
        strokeWeight: 2,
        map,
      });

      originMarkerRef.current = new maps.Marker({
        position: origin,
        map,
        zIndex: 1000,
        icon: {
          path: maps.SymbolPath.CIRCLE,
          fillColor: "#0f2040",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 3,
          scale: 10,
        },
        title: "Origem",
      });

      map.setCenter(origin);
      map.setZoom(ORIGIN_ZOOM);
    } else {
      map.setCenter(BRAZIL_CENTER);
      map.setZoom(BRAZIL_ZOOM);
    }
  }, [origin, radiusKm, mapReady]);

  // Update company markers when companies change
  useEffect(() => {
    if (!mapRef.current || !mapReady || !clustererRef.current) return;
    const maps = window.google.maps;

    // Clusterer é quem controla o map dos markers agora — não passar `map`
    // no construtor (senão eles aparecem soltos ANTES de entrar no cluster).
    clustererRef.current.clearMarkers();
    companyMarkersRef.current = [];

    const geocoded = companies.filter(
      (c) => c.latitude !== null && c.longitude !== null
    );

    geocoded.forEach((company) => {
      const color = getSituacaoColor(company.situacao);
      const marker = new maps.Marker({
        position: { lat: company.latitude!, lng: company.longitude! },
        icon: {
          path: maps.SymbolPath.CIRCLE,
          fillColor: color,
          fillOpacity: 0.88,
          strokeColor: "#ffffff",
          strokeWeight: 1.5,
          scale: 7,
        },
        title: company.razao_social,
      });

      marker.addListener("click", () => {
        infoWindowRef.current?.setContent(buildInfoContent(company));
        infoWindowRef.current?.open(mapRef.current!, marker);
      });

      companyMarkersRef.current.push(marker);
    });

    clustererRef.current.addMarkers(companyMarkersRef.current);
  }, [companies, mapReady]);

  if (!hasApiKey) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ background: "var(--bg)" }}>
        <div className="text-center space-y-2">
          <p className="font-medium" style={{ color: "var(--text)" }}>
            Chave do Google Maps não configurada
          </p>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Defina{" "}
            <code className="rounded px-1 py-0.5 text-xs" style={{ background: "var(--border)" }}>
              NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
            </code>{" "}
            em{" "}
            <code className="rounded px-1 py-0.5 text-xs" style={{ background: "var(--border)" }}>
              apps/web/.env.local
            </code>
          </p>
        </div>
      </div>
    );
  }

  const geocodedCount = companies.filter((c) => c.latitude !== null).length;
  const showNoGeoMsg = companies.length > 0 && geocodedCount === 0;

  return (
    <div className="flex-1 relative overflow-hidden">
      {/* Map canvas */}
      <div ref={containerRef} className="absolute inset-0" />

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(245,247,250,0.6)", backdropFilter: "blur(2px)", zIndex: 10 }}>
          <div className="flex items-center gap-3 rounded-xl px-5 py-3 shadow-lg" style={{ background: "var(--surface)" }}>
            <svg className="w-5 h-5 animate-spin" style={{ color: "var(--gr-teal)" }} viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            <span className="text-sm font-medium" style={{ color: "var(--text)" }}>Buscando empresas…</span>
          </div>
        </div>
      )}

      {/* No origin message */}
      {!isLoading && !origin && companies.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 5 }}>
          <div className="text-center rounded-2xl px-8 py-6 shadow-sm" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <svg className="w-10 h-10 mx-auto mb-3" style={{ color: "var(--text-muted)" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
            </svg>
            <p className="font-semibold mb-1" style={{ color: "var(--text)" }}>Defina uma origem</p>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              Busque uma cidade ou endereço no painel<br />ao lado e clique em Buscar
            </p>
          </div>
        </div>
      )}

      {/* No geocoded data warning */}
      {!isLoading && showNoGeoMsg && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-lg px-4 py-2 shadow-md text-sm" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-2)", zIndex: 10 }}>
          {companies.length.toLocaleString("pt-BR")} empresas encontradas — aguardando geocodificação para exibir no mapa
        </div>
      )}

      {/* Geocoded count badge */}
      {!isLoading && geocodedCount > 0 && (
        <div className="absolute top-3 left-3 rounded-full px-3 py-1 text-xs font-medium shadow" style={{ background: "var(--surface)", color: "var(--text-2)", border: "1px solid var(--border)", zIndex: 10 }}>
          {geocodedCount.toLocaleString("pt-BR")} pins no mapa
        </div>
      )}

      {/* Legend */}
      {geocodedCount > 0 && (
        <div className="absolute bottom-6 right-3 rounded-lg px-3 py-2 shadow space-y-1" style={{ background: "var(--surface)", border: "1px solid var(--border)", zIndex: 10 }}>
          {[
            { color: "#10b981", label: "Ativa" },
            { color: "#f59e0b", label: "Inapta / Suspensa" },
            { color: "#ef4444", label: "Baixada / Nula" },
            { color: "#94a3b8", label: "Outros" },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: color }} />
              <span className="text-xs" style={{ color: "var(--text-2)" }}>{label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
