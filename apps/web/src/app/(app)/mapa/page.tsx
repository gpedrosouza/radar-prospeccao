import { MapaClient } from "./_components/MapaClient";

export const metadata = {
  title: "Mapa — Radar Prospecção",
};

export default async function MapaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const params = await searchParams;
  return <MapaClient initialParams={params} />;
}
