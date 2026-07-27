import { computeTeamAnalytics } from "./analysis/contender";
import { getLeagueConfig } from "./config";
import { worstSource } from "./datasource";
import { buildCanonicalTable, CanonicalPlayer } from "./players/canonical";
import {
  getLeague,
  getLeagueUsers,
  getRosters,
  getState,
  getTradedPicks,
} from "./sleeper/client";
import { computeValueContext, ValueSource } from "./values/engine";
import { computePickInventory, parseFcPicks } from "./values/picks";
import type { LeagueBundle } from "./leagueBundle";

export type { LeagueBundle } from "./leagueBundle";
export { teamName } from "./leagueBundle";

/**
 * Server-side assembly of a LeagueBundle. The canonical player table is
 * filtered down to players relevant to this league (rostered, rookies,
 * trending) to keep the client payload small in live mode.
 */
export async function getLeagueBundle(leagueId: string): Promise<LeagueBundle | null> {
  const leagueConfig = getLeagueConfig(leagueId);
  if (!leagueConfig) return null;

  const [leagueRes, rostersRes, usersRes, tradedRes, stateRes, table] =
    await Promise.all([
      getLeague(leagueId),
      getRosters(leagueId),
      getLeagueUsers(leagueId),
      getTradedPicks(leagueId),
      getState(),
      buildCanonicalTable(),
    ]);

  const valueContext = computeValueContext(table.players);
  const rostered = new Set(
    rostersRes.data.flatMap((r) => [
      ...(r.players ?? []),
      ...(r.taxi ?? []),
      ...(r.reserve ?? []),
    ])
  );
  const players: Record<string, CanonicalPlayer> = {};
  for (const [id, p] of Object.entries(table.players)) {
    const isRookie = p.yearsExp === 0;
    const hasValue =
      (p.values.fcDynastySf?.value ?? 0) > 0 ||
      (p.values.fcRedraft?.value ?? 0) > 0 ||
      (p.values.ktc?.sf ?? 0) > 0;
    if (rostered.has(id) || (isRookie && hasValue) || p.trending) {
      players[id] = p;
    }
  }

  const pickValues = parseFcPicks(
    leagueConfig.isDynasty ? table.fcPicks.dynastySf : table.fcPicks.redraft
  );
  const picks = computePickInventory(
    rostersRes.data,
    tradedRes.data,
    stateRes.data.season
  );
  const defaultSource: ValueSource = leagueConfig.isDynasty ? "blend" : "fc";

  const teamAnalytics = computeTeamAnalytics({
    league: leagueConfig,
    rosters: rostersRes.data,
    players: table.players,
    ctx: valueContext,
    source: defaultSource,
    picks,
    pickValues,
    currentSeason: stateRes.data.season,
  });

  return {
    leagueConfig,
    league: leagueRes.data,
    rosters: rostersRes.data,
    users: usersRes.data,
    state: stateRes.data,
    players,
    valueContext,
    pickValues,
    picks,
    teamAnalytics,
    defaultSource,
    source: worstSource(
      leagueRes.source,
      rostersRes.source,
      usersRes.source,
      tradedRes.source,
      table.meta.source
    ),
  };
}
