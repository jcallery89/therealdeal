import { notFound } from "next/navigation";
import TradeBuilder from "@/components/trade/TradeBuilder";
import { getLeagueBundle } from "@/lib/bundle";

export const dynamic = "force-dynamic";

export default async function TradePage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;
  const bundle = await getLeagueBundle(leagueId);
  if (!bundle) notFound();
  return <TradeBuilder bundle={bundle} />;
}
