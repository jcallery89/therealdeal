import { notFound } from "next/navigation";
import StartSitView from "@/components/startsit/StartSitView";
import { getLeagueBundle } from "@/lib/bundle";
import { getMatchups } from "@/lib/sleeper/client";
import { getWeekProjections } from "@/lib/sleeper/stats";
import { scoreStatLines } from "@/lib/analysis/lineup";
import { getEdgeInputs } from "@/lib/edge/data";
import { teamsPlaying } from "@/lib/edge/schedule";

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

  const [projRes, matchupsRes, edge] = await Promise.all([
    getWeekProjections(bundle.state.season, bundle.state.week),
    getMatchups(leagueId, bundle.state.week, fresh).catch(() => null),
    getEdgeInputs(bundle).catch(() => null),
  ]);

  // Consensus (experts + projections + crowd) points where available; raw
  // Sleeper projections otherwise.
  const projected = scoreStatLines(projRes.data, bundle.players, bundle.league.scoring_settings);
  const consensus = Object.fromEntries(
    Object.entries(edge?.consensus ?? {}).filter(([id]) => bundle.players[id])
  );
  for (const [id, c] of Object.entries(consensus)) projected[id] = c.points;
  // Players on bye can't score, whatever a feed says.
  const playing = teamsPlaying(edge?.schedule ?? [], bundle.state.week);
  if (playing.size > 0) {
    for (const p of Object.values(bundle.players)) {
      if (p.team && !playing.has(p.team)) {
        projected[p.sleeperId] = 0;
        delete consensus[p.sleeperId];
      }
    }
  }

  return (
    <StartSitView
      bundle={bundle}
      projectedPoints={projected}
      consensus={consensus}
      matchups={matchupsRes?.data ?? []}
    />
  );
}
