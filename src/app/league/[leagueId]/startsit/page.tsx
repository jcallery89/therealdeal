import { notFound } from "next/navigation";
import StartSitView from "@/components/startsit/StartSitView";
import { getLeagueBundle } from "@/lib/bundle";
import { getMatchups } from "@/lib/sleeper/client";
import { getWeekProjections } from "@/lib/sleeper/stats";
import { scoreStatLines } from "@/lib/analysis/lineup";

export const dynamic = "force-dynamic";

export default async function StartSitPage({
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

  const [projRes, matchupsRes] = await Promise.all([
    getWeekProjections(bundle.state.season, bundle.state.week),
    getMatchups(leagueId, bundle.state.week, fresh).catch(() => null),
  ]);

  return (
    <StartSitView
      bundle={bundle}
      projectedPoints={scoreStatLines(projRes.data, bundle.players, bundle.league.scoring_settings)}
      matchups={matchupsRes?.data ?? []}
    />
  );
}
