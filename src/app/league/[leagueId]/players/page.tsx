import { notFound } from "next/navigation";
import PlayersExplorer from "@/components/players/PlayersExplorer";
import { buildPlayerRows } from "@/lib/analysis/playerTable";
import { getLeagueBundle } from "@/lib/bundle";
import { buildCanonicalTable } from "@/lib/players/canonical";
import { getSeasonStats, getWeekProjections } from "@/lib/sleeper/stats";
import { HORIZON_SOURCES, playerValue, sourceAvailable, SingleSource } from "@/lib/values/engine";

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
  const { leagueConfig, defaultMode, planningMode, valueContext } = bundle;
  const sourceValueOf = Object.fromEntries(
    HORIZON_SOURCES[defaultMode.horizon]
      .filter((src) => sourceAvailable(defaultMode.horizon, src, valueContext))
      .map((src) => [
        src,
        (p: Parameters<typeof playerValue>[0]) =>
          playerValue(p, leagueConfig, { horizon: defaultMode.horizon, source: src }, valueContext),
      ])
  ) as Partial<Record<SingleSource, (p: Parameters<typeof playerValue>[0]) => number>>;
  const rows = buildPlayerRows({
    players: table.players,
    rosters: bundle.rosters,
    valueOf: (p) => playerValue(p, bundle.leagueConfig, bundle.defaultMode, bundle.valueContext),
    league: bundle.leagueConfig,
    scoring: bundle.league.scoring_settings,
    seasonStats: seasonStats.data,
    projections: projections.data,
    sourceValueOf,
    keeperValueOf: leagueConfig.isDynasty
      ? undefined
      : (p) => playerValue(p, leagueConfig, planningMode, valueContext),
  });

  // Rows carry everything the table needs; drop the bundle's player map.
  return <PlayersExplorer bundle={{ ...bundle, players: {} }} rows={rows} />;
}
