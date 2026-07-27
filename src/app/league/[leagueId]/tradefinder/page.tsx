import { notFound } from "next/navigation";
import TradeFinder from "@/components/trade/TradeFinder";
import { getLeagueBundle } from "@/lib/bundle";

export const dynamic = "force-dynamic";

export default async function TradeFinderPage({
  params,
  searchParams,
}: {
  params: Promise<{ leagueId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { leagueId } = await params;
  const fresh = Boolean((await searchParams).sync);
  const bundle = await getLeagueBundle(leagueId, fresh);
  if (!bundle) notFound();
  return <TradeFinder bundle={bundle} />;
}
