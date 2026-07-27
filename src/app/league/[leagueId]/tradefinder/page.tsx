import { notFound } from "next/navigation";
import TradeFinder from "@/components/trade/TradeFinder";
import { getLeagueBundle } from "@/lib/bundle";

export const dynamic = "force-dynamic";

export default async function TradeFinderPage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;
  const bundle = await getLeagueBundle(leagueId);
  if (!bundle) notFound();
  return <TradeFinder bundle={bundle} />;
}
