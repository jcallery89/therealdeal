import { notFound } from "next/navigation";
import StrategyView from "@/components/strategy/StrategyView";
import { getLeagueBundle } from "@/lib/bundle";

export const dynamic = "force-dynamic";

export default async function StrategyPage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;
  const bundle = await getLeagueBundle(leagueId);
  if (!bundle) notFound();
  return <StrategyView bundle={bundle} />;
}
