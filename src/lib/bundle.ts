import { computeTeamAnalytics } from "./analysis/contender";
import { getLeagueConfig } from "./config";
import { worstSource } from "./datasource";
import { buildCanonicalTable, CanonicalPlayer } from "./players/canonical";
import { draftSlots } from "./analysis/draftBoard";
import {
  getDrafts,
  getLeague,
  getLeagueUsers,
  getRosters,
  getState,
  getTradedPicks,
} from "./sleeper/client";
import { computeValueContext, ValueSource } from "./values/engine";
import { computePickInventory, parseFcPicks, pickRounds, pickSeasons } from "./values/picks";
import type { LeagueBundle } from "./leagueBundle";

export type { LeagueBundle } from "./leagueBundle";
export { teamName } from "./leagueBundle";

/**
 * Server-side assembly of a LeagueBundle. The canonical player table is
 * filtered down to players relevant to this league (rostered, rookies,
 * trending) to keep the client payload small in live mode.
 */
export async function getLeagueBundle(
  leagueId: string,
  fresh = false
): Promise<LeagueBundle | null> {
  const leagueConfig = getLeagueConfig(leagueId);
  if (!leagueConfig) return null;

  const [leagueRes, rostersRes, usersRes, tradedRes, stateRes, table, draftsRes] =
    await Promise.all([
      getLeague(leagueId, fresh),
      getRosters(leagueId, fresh),
      getLeagueUsers(leagueId, fresh),
      getTradedPicks(leagueId, fresh),
      getState(fresh),
      buildCanonicalTable(),
      getDrafts(leagueId, fresh).catch(() => null),
    ]);
  // Sleeper lists a league's drafts newest first.
  const draft = draftsRes?.data?.[0] ?? null;

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
  const seasons = pickSeasons(leagueRes.data.season, draft);
  // The official draft order only applies to the draft it belongs to;
  // otherwise estimate the next draft's order from standings.
  const orderForNextDraft = draft && draft.season === seasons[0] ? draft.draft_order : null;
  const picks = computePickInventory(
    rostersRes.data,
    tradedRes.data,
    seasons,
    pickRounds(draft, tradedRes.data),
    draftSlots(rostersRes.data, orderForNextDraft)
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
    leagueSeason: leagueRes.data.season,
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
    pickSeasons: seasons,
    draft,
    teamAnalytics,
    defaultSource,
    // Primary health = Sleeper data only; a blocked FantasyCalc/KTC fetch
    // must not brand live rosters as demo data.
    source: worstSource(
      leagueRes.source,
      rostersRes.source,
      usersRes.source,
      tradedRes.source
    ),
    valuesDegraded: {
      fc: table.meta.sources.fc !== "live",
      ktc: table.meta.sources.ktc !== "live",
    },
  };
}
