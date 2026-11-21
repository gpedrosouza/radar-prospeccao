import { CnpjsClient } from "./_components/CnpjsClient";

export default async function CnpjsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const params = await searchParams;
  return <CnpjsClient initialParams={params} />;
}
