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
import { getSeasonProjections, getSeasonStats } from "./sleeper/stats";
import {
  computeValueContext,
  defaultMode,
  HORIZON_SOURCES,
  PickTables,
  planningMode,
} from "./values/engine";
import {
  computePickInventory,
  parseFcPicks,
  parsePickRows,
  pickRounds,
  pickSeasons,
} from "./values/picks";
import { computeProductionValues } from "./values/production";
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

  // This-season production values (league-scored) only matter for the
  // redraft-style horizon, i.e. The Real Deal.
  let production: Record<string, number> = {};
  if (!leagueConfig.isDynasty) {
    const [stats, projections] = await Promise.all([
      getSeasonStats(stateRes.data.season),
      getSeasonProjections(stateRes.data.season),
    ]);
    production = computeProductionValues({
      players: table.players,
      teams: rostersRes.data.length,
      rosterPositions: leagueRes.data.roster_positions,
      scoring: leagueRes.data.scoring_settings,
      seasonStats: stats.data,
      seasonProjections: projections.data,
    });
  }
  const valueContext = computeValueContext(table.players, production);
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
      (p.values.dp?.sf ?? 0) > 0 ||
      (p.values.dd?.value ?? 0) > 0 ||
      (p.values.dtv?.sf ?? 0) > 0;
    if (rostered.has(id) || (isRookie && hasValue) || p.trending) {
      players[id] = p;
    }
  }

  // Rookie-pick markets only apply to the dynasty league; the keeper league's
  // full draft uses the static curve (see draftPickValue).
  const pickValues: PickTables = leagueConfig.isDynasty
    ? {
        fc: parseFcPicks(table.fcPicks.dynastySf),
        dp: parsePickRows(
          table.dpPicks.map((p) => ({ name: p.name, value: p.value2qb })),
          "dynastyprocess"
        ),
        dd: parsePickRows(table.ddPicks, "dynastydealer"),
        dtv: parsePickRows(table.dtvPicks, "dynastytradevalues"),
      }
    : { fc: { values: {}, source: "static" }, dp: { values: {}, source: "static" } };
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
  const mode = defaultMode(leagueConfig);

  const teamAnalytics = computeTeamAnalytics({
    league: leagueConfig,
    rosters: rostersRes.data,
    players: table.players,
    ctx: valueContext,
    mode,
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
    // Ship only the production values the client can use.
    valueContext: {
      ...valueContext,
      production: Object.fromEntries(
        Object.entries(valueContext.production).filter(([id]) => players[id])
      ),
    },
    pickValues,
    picks,
    pickSeasons: seasons,
    draft,
    teamAnalytics,
    defaultMode: mode,
    planningMode: planningMode(leagueConfig),
    // Primary health = Sleeper data only; a blocked value-source fetch
    // must not brand live rosters as demo data.
    source: worstSource(
      leagueRes.source,
      rostersRes.source,
      usersRes.source,
      tradedRes.source
    ),
    // Which Sleeper requests failed (and why), so the banner can say.
    sourceIssues: (
      [
        ["league settings", leagueRes],
        ["rosters", rostersRes],
        ["league members", usersRes],
        ["traded picks", tradedRes],
      ] as const
    )
      .filter(([, r]) => r.source === "stale")
      .map(([name, r]) => ({ name, fetchedAt: r.fetchedAt, error: r.error ?? "unknown error" })),
    valueSources: {
      ...table.meta.sources,
      proj: leagueConfig.isDynasty ? "unavailable" : Object.keys(production).length ? "live" : "unavailable",
    },
    // Only worth a warning when EVERY market source behind the default view failed.
    valuesUnavailable:
      table.meta.source !== "fixture" &&
      HORIZON_SOURCES[mode.horizon].every((s) => {
        const h = s === "proj" ? (Object.keys(production).length ? "live" : "unavailable") : table.meta.sources[s];
        return h === "stale" || h === "unavailable";
      }),
  };
}
