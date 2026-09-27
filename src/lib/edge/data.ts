import { neededAtPosition, starterSlots, CORE_POSITIONS } from "../analysis/rosterStrength";
import { scoreStatLines } from "../analysis/lineup";
import { fixturesMode, Sourced } from "../datasource";
import { getFpWeekly } from "../dynastyprocess/client";
import { getEspnNews } from "../espn/news";
import type { LeagueBundle } from "../leagueBundle";
import {
  getInjuryReports,
  getSchedule,
  getSnapCounts,
  getWeeklyStats,
  SnapCount,
  WeeklyStat,
} from "../nflverse/client";
import { buildCanonicalTable, CanonicalPlayer } from "../players/canonical";
import { getMatchups } from "../sleeper/client";
import { getOwnership, getSeasonProjections, getSeasonStats, getWeekProjections } from "../sleeper/stats";
import { computeProductionValues } from "../values/production";
import { buildStartConsensus, ExpertRank } from "./consensus";
import { kickoffTime } from "./schedule";
import type { EdgeInputs } from "./types";
import { buildUsage, defenseFactors } from "./usage";

/** Optional sources never fail the page; they just stop contributing. */
async function optional<T>(p: Promise<Sourced<T>>, empty: T): Promise<Sourced<T>> {
  try {
    return await p;
  } catch (err) {
    console.warn("[edge] optional source unavailable:", err instanceof Error ? err.message : err);
    return { data: empty, source: "unavailable", fetchedAt: Date.now() };
  }
}

const SKILL = new Set<string>(CORE_POSITIONS);

/**
 * Everything the edge engine blends beyond the league bundle: nflverse usage,
 * snaps, injury reports and schedule/lines; FantasyPros expert ranks; Sleeper
 * projections, ownership and start rates; ESPN news. Trimmed to the players
 * that can matter (rostered, usage, depth chart, consensus starters).
 */
export async function getEdgeInputs(bundle: LeagueBundle): Promise<EdgeInputs> {
  const { season, week } = bundle.state;
  const table = await buildCanonicalTable();
  const [stats, snaps, injuries, schedule, news, ownership, experts, weekProj, matchups] = await Promise.all([
    optional(getWeeklyStats(season), [] as WeeklyStat[]),
    optional(getSnapCounts(season), [] as SnapCount[]),
    optional(getInjuryReports(season), []),
    optional(getSchedule(season), []),
    optional(getEspnNews(), []),
    getOwnership(season, week),
    optional(getFpWeekly(), []),
    getWeekProjections(season, week),
    optional(getMatchups(bundle.leagueConfig.id, week), []),
  ]);

  // nflverse / ESPN / FantasyPros ids -> Sleeper, with a name fallback.
  const memo = new Map<string, string | undefined>();
  const resolve = (
    map: Record<string, string>,
    key: string,
    name: string,
    position: string,
    team: string | null
  ) => {
    const k = `${key}|${name}`;
    if (memo.has(k)) return memo.get(k);
    const viaId = map[key];
    const id = viaId && table.players[viaId] ? viaId : table.matchByName(name, position, team);
    memo.set(k, id);
    return id;
  };

  const usage = buildUsage({
    stats: stats.data,
    snaps: snaps.data,
    statId: (s) => resolve(table.ids.gsis, s.gsisId, s.name, s.position, s.team),
    snapId: (s) => resolve(table.ids.pfr, s.pfrId, s.name, s.position, s.team),
  });

  const expertRanks: Record<string, ExpertRank> = {};
  for (const e of experts.data) {
    const id = resolve(table.ids.fp, e.fpId, e.name, e.position, e.team);
    if (id) expertRanks[id] = { rank: e.rank, best: e.best, worst: e.worst, grade: e.grade };
  }

  const scoring = bundle.league.scoring_settings;
  const weekProjections = scoreStatLines(weekProj.data, table.players, scoring);
  const slots = starterSlots(bundle.league.roster_positions);
  const teams = bundle.rosters.length;
  const startable = Object.fromEntries(
    CORE_POSITIONS.map((pos) => [pos, teams * Math.max(1, neededAtPosition(slots, pos))])
  );
  const started = Object.fromEntries(Object.entries(ownership.data).map(([id, o]) => [id, o.started]));
  const consensus = buildStartConsensus({
    players: table.players,
    projections: weekProjections,
    experts: expertRanks,
    started,
    startable,
  });

  // Which players ship: rostered/bundle, anyone with usage, depth-chart
  // regulars, and consensus-startable players.
  const keep = new Set<string>(Object.keys(bundle.players));
  for (const id of Object.keys(usage)) keep.add(id);
  for (const p of Object.values(table.players)) {
    if (p.team && SKILL.has(p.position) && (p.depthOrder ?? 99) <= (p.position === "WR" ? 3 : 2)) keep.add(p.sleeperId);
  }
  for (const [id, c] of Object.entries(consensus)) if (c.tier !== "Sit") keep.add(id);

  const players: Record<string, CanonicalPlayer> = {};
  for (const id of keep) if (table.players[id]) players[id] = table.players[id];
  const only = <T,>(m: Record<string, T>) =>
    Object.fromEntries(Object.entries(m).filter(([id]) => players[id])) as Record<string, T>;

  const injuryReports: EdgeInputs["injuryReports"] = {};
  for (const r of injuries.data) {
    const id = resolve(table.ids.gsis, r.gsisId, r.name, "", r.team);
    if (!id || !players[id] || r.week < week - 1) continue;
    if (!injuryReports[id] || injuryReports[id].week <= r.week) {
      injuryReports[id] = { status: r.status, injury: r.injury, practice: r.practice, week: r.week };
    }
  }

  const newsById: EdgeInputs["news"] = {};
  for (const item of [...news.data].sort((a, b) => Date.parse(b.published) - Date.parse(a.published))) {
    for (const espnId of item.espnIds) {
      const id = table.ids.espn[espnId];
      if (!id || !players[id]) continue;
      const list = (newsById[id] ??= []);
      if (list.length < 2) list.push({ headline: item.headline, published: item.published, url: item.url });
    }
  }

  // This-season production for players the bundle doesn't carry (keeper league).
  let production: Record<string, number> = {};
  if (!bundle.leagueConfig.isDynasty) {
    const [seasonStats, seasonProj] = await Promise.all([getSeasonStats(season), getSeasonProjections(season)]);
    production = only(
      computeProductionValues({
        players: table.players,
        teams,
        rosterPositions: bundle.league.roster_positions,
        scoring,
        seasonStats: seasonStats.data,
        seasonProjections: seasonProj.data,
      })
    );
  }

  const opponents: Record<number, number> = {};
  for (const m of matchups.data) {
    if (m.matchup_id === null) continue;
    const other = matchups.data.find((x) => x.matchup_id === m.matchup_id && x.roster_id !== m.roster_id);
    if (other) opponents[m.roster_id] = other.roster_id;
  }

  const remaining = schedule.data.filter((g) => g.week >= week);
  // Demo data is pinned to its own week: "now" is the Tuesday before it.
  const firstKickoff = remaining.filter((g) => g.week === week).map((g) => kickoffTime(g.kickoff)).sort()[0];
  const asOf = fixturesMode() && firstKickoff ? firstKickoff - 2 * 24 * 3600 * 1000 : Date.now();

  const usageHealth = stats.source;
  return {
    players,
    usage: only(usage),
    defense: defenseFactors(stats.data),
    schedule: remaining,
    injuryReports,
    weekProjections: only(weekProjections),
    consensus: only(consensus),
    production,
    ownership: only(Object.fromEntries(Object.entries(ownership.data).map(([id, o]) => [id, o.owned]))),
    news: newsById,
    opponents,
    health: {
      usage: usageHealth,
      snaps: snaps.source,
      injuries: injuries.source,
      schedule: schedule.source,
      news: news.source,
      ownership: ownership.source,
      projections: weekProj.source,
      experts: experts.source,
    },
    asOf,
  };
}
