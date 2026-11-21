"use client";

import { useEffect, useRef } from "react";
import { loadGoogleMaps } from "@/lib/google-maps";

interface PlaceAutocompleteProps {
  value: string;
  onSelect: (result: { lat: number; lng: number; label: string }) => void;
  onClear: () => void;
  placeholder?: string;
}

export function PlaceAutocomplete({
  value,
  onSelect,
  onClear,
  placeholder = "Cidade, endereço ou empresa...",
}: PlaceAutocompleteProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const elementRef = useRef<google.maps.places.PlaceAutocompleteElement | null>(null);
  const onSelectRef = useRef(onSelect);
  const onClearRef = useRef(onClear);

  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  useEffect(() => { onClearRef.current = onClear; }, [onClear]);

  // Sync value → widget quando o pai limpa
  useEffect(() => {
    if (elementRef.current && value === "") {
      elementRef.current.value = "";
    }
  }, [value]);

  useEffect(() => {
    let mounted = true;

    loadGoogleMaps().then(async () => {
      if (!mounted || !containerRef.current || elementRef.current) return;

      // API legada (google.maps.places.Autocomplete) exige a Places API
      // antiga habilitada no projeto — este projeto só tem "Places API
      // (New)" (ver docs/guia-fontes-geocodificacao.md), por isso usamos o
      // PlaceAutocompleteElement (Web Component, Shadow DOM fechada — não
      // dá pra estilizar por dentro além das custom properties documentadas:
      // https://developers.google.com/maps/documentation/javascript/places-ui-kit/custom-styling).
      // O componente já desenha sua própria caixa (borda/fundo/estado de
      // foco) — por isso o wrapper NÃO tem borda/fundo/ring próprios (evita
      // duas caixas competindo, que é o que causava a moldura dupla/estranha
      // reportada). noInputIcon/noClearButton mantidos true porque o botão
      // "x" precisa notificar o componente pai (onClear) — o nativo do
      // Google não dispara isso.
      const element = new google.maps.places.PlaceAutocompleteElement({
        includedRegionCodes: ["br"],
        // Ícone nativo ligado — sobrepor um ícone nosso por cima de uma
        // caixa que a própria Shadow DOM desenha (padding interno que não
        // dá pra inspecionar) é receita pra desalinhamento. O botão de
        // limpar nativo fica desligado porque não notifica o componente
        // pai (onClear) — por isso mantemos o nosso.
        noInputIcon: false,
        noClearButton: true,
        placeholder,
      });
      element.value = value;
      element.style.width = "100%";
      // Altura/fonte padrão do widget vêm maiores que os outros campos do
      // painel (h-9/text-sm) — igualar pra não destoar visualmente.
      element.style.height = "2.25rem";
      element.style.fontSize = "0.875rem";
      // As custom properties --gmp-mat-color-* só valem para os componentes
      // de Place Details — o PlaceAutocompleteElement usa color-scheme +
      // propriedades CSS normais (border/background/border-radius) direto no
      // host. Sem "color-scheme: light" ele segue prefers-color-scheme do
      // SO/navegador e fica escuro, destoando do resto do app (sempre claro).
      element.style.setProperty("color-scheme", "light");
      element.style.setProperty("background-color", "var(--surface)");
      element.style.setProperty("border", "1px solid var(--border)");
      element.style.setProperty("border-radius", "0.5rem");

      element.addEventListener("gmp-select", (event: google.maps.places.PlacePredictionSelectEvent) => {
        void (async () => {
          const place = event.placePrediction.toPlace();
          await place.fetchFields({ fields: ["location", "displayName", "formattedAddress"] });

          if (!place.location) return;

          const label = place.displayName || place.formattedAddress || "";
          element.value = label;
          onSelectRef.current({
            lat: place.location.lat(),
            lng: place.location.lng(),
            label,
          });
        })();
      });

      element.addEventListener("keydown", (e: Event) => {
        if ((e as KeyboardEvent).key === "Escape") {
          element.value = "";
          onClearRef.current();
        }
      });

      containerRef.current.appendChild(element);
      elementRef.current = element;
    });

    return () => {
      mounted = false;
      if (elementRef.current) {
        elementRef.current.remove();
        elementRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Intencionalmente vazio — widget é inicializado uma vez, no mount

  function handleClear() {
    if (elementRef.current) elementRef.current.value = "";
    onClear();
  }

  return (
    <div className="relative">
      {/* Sem borda/fundo/ring próprios aqui — o PlaceAutocompleteElement já
          desenha sua própria caixa (Shadow DOM). Um wrapper com estilo
          próprio cria duas caixas competindo (a moldura dupla/estranha do
          antes). Nada de padding-right reservado: isso encolhia o width:100%
          do widget (relativo ao container, não à section) deixando-o mais
          estreito que os outros campos — o botão de limpar sobrepõe por
          cima em vez de disputar espaço. */}
      <div ref={containerRef} />
      {value && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute inset-y-0 right-3 flex items-center z-10"
          style={{ color: "var(--text-muted)" }}
          aria-label="Limpar origem"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
