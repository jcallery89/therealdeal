import { notFound } from "next/navigation";
import PlayersExplorer from "@/components/players/PlayersExplorer";
import { buildPlayerRows } from "@/lib/analysis/playerTable";
import { getLeagueBundle } from "@/lib/bundle";
import { buildCanonicalTable } from "@/lib/players/canonical";
import { getSeasonStats, getWeekProjections } from "@/lib/sleeper/stats";
import { playerValue } from "@/lib/values/engine";

export const dynamic = "force-dynamic";

export default async function PlayersPage({
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

  // The explorer covers the whole player pool (free agents included), not
  // just the league-relevant subset carried by the bundle.
  const [table, seasonStats, projections] = await Promise.all([
    buildCanonicalTable(),
    getSeasonStats(bundle.state.season),
    getWeekProjections(bundle.state.season, bundle.state.week),
  ]);
  const rows = buildPlayerRows({
    players: table.players,
    rosters: bundle.rosters,
    valueOf: (p) => playerValue(p, bundle.leagueConfig, bundle.defaultSource, bundle.valueContext),
    league: bundle.leagueConfig,
    scoring: bundle.league.scoring_settings,
    seasonStats: seasonStats.data,
    projections: projections.data,
  });

  // Rows carry everything the table needs; drop the bundle's player map.
  return <PlayersExplorer bundle={{ ...bundle, players: {} }} rows={rows} />;
}
