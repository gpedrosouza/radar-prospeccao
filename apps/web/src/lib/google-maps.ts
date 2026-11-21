import { setOptions, importLibrary } from "@googlemaps/js-api-loader";

// @googlemaps/js-api-loader v2 removeu a classe Loader (lança em runtime,
// mesmo existindo no bundle) — API funcional nova: setOptions() uma vez,
// depois importLibrary() por biblioteca. Precisa de "maps" (Map, Circle,
// InfoWindow, Marker, SymbolPath, ControlPosition — usados em MapView),
// "marker" (Marker/AdvancedMarkerElement) e "places" (Autocomplete, usado
// em PlaceAutocomplete). Todas populam o namespace global window.google.maps
// como antes — os componentes que já usam window.google.maps diretamente
// não precisam mudar.
let optionsSet = false;
let loadedPromise: Promise<typeof google.maps> | null = null;

function ensureOptions(): void {
  if (optionsSet) return;
  setOptions({
    key: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "",
    v: "weekly",
  });
  optionsSet = true;
}

export async function loadGoogleMaps(): Promise<typeof google.maps> {
  ensureOptions();
  if (!loadedPromise) {
    loadedPromise = Promise.all([
      importLibrary("maps"),
      importLibrary("marker"),
      importLibrary("places"),
    ]).then(() => window.google.maps);
  }
  return loadedPromise;
}
