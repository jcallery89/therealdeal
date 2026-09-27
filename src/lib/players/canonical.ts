import { cache } from "../cache";
import { TTL } from "../config";
import { DataSourceKind, Sourced, worstSource } from "../datasource";
import {
  DpPick,
  DpValues,
  EMPTY_CROSSWALK,
  getDpIds,
  getDpValues,
  IdCrosswalk,
} from "../dynastyprocess/client";
import { getFcValues } from "../fantasycalc/client";
import { FcEntry } from "../fantasycalc/types";
import { DdValues, getDdValues } from "../dynastydealer/client";
import { DtvValues, getDtvPicks, getDtvValues } from "../dynastytradevalues/client";
import { getTrending } from "../sleeper/client";
import { getPlayersMap } from "../sleeper/players";
import { normalizeName } from "./normalize";
import { computeOutlook, newsMentions, Outlook } from "./outlook";
import { getEspnNews, NewsItem } from "../espn/news";
import { getState } from "../sleeper/client";
import { fixturesMode } from "../datasource";
import { isPickName } from "../values/picks";

export interface CanonicalPlayer {
  sleeperId: string;
  name: string;
  position: string;
  team: string | null;
  age: number | null;
  yearsExp: number | null;
  injuryStatus: string | null;
  /** Sleeper depth chart: 1 = starter. */
  depthOrder?: number | null;
  injuryBodyPart?: string | null;
  injuryNotes?: string | null;
  /** Expected missed time (IR, out for season, ...), when injured. */
  outlook?: Outlook;
  /** When Sleeper last attached news (ms). */
  newsUpdated?: number | null;
  values: {
    fcDynastySf?: { value: number; overallRank: number; positionRank: number | null; trend30Day: number | null };
    fcRedraft?: { value: number; overallRank: number; positionRank: number | null; trend30Day: number | null };
    /** FantasyCalc dynasty 1QB — the keeper horizon for the 1QB league. */
    fcDynasty1qb?: { value: number; overallRank: number; positionRank: number | null; trend30Day: number | null };
    /** Dynasty Dealer: real Sleeper trades + community votes (one, superflex-leaning, value set). */
    dd?: { value: number };
    /** DynastyTradeValues: algorithmic ADP/market values, 1QB and superflex. */
    dtv?: { sf: number; oneQb: number };
    /** DynastyProcess (FantasyPros expert consensus) dynasty values. */
    dp?: { sf: number; oneQb: number };
  };
  trending?: { add?: number; drop?: number };
}

/** Health of each market-value provider. */
export interface ValueSourceHealth {
  fc: DataSourceKind;
  dp: DataSourceKind;
  dd: DataSourceKind;
  dtv: DataSourceKind;
}

export interface CanonicalTable {
  players: Record<string, CanonicalPlayer>;
  /** FantasyCalc draft-pick entries (sleeperId null), per format. */
  fcPicks: { dynastySf: FcEntry[]; dynasty1qb: FcEntry[]; redraft: FcEntry[] };
  /** DynastyProcess pick values (1QB and superflex). */
  dpPicks: DpPick[];
  /** Dynasty Dealer and DynastyTradeValues pick values. */
  ddPicks: { name: string; value: number }[];
  dtvPicks: { name: string; value: number }[];
  /** Other providers' ids -> Sleeper id (nflverse, ESPN). */
  ids: IdCrosswalk;
  /** Normalized-name lookup for rows the crosswalk misses. */
  matchByName: (name: string, position: string, team: string | null) => string | undefined;
  meta: {
    source: DataSourceKind;
    /** Per-value-source health, so optional sources can degrade softly. */
    sources: ValueSourceHealth;
    fetchedAt: number;
    counts: {
      players: number;
      fcDynastySf: number;
      fcDynasty1qb: number;
      fcRedraft: number;
      dp: number;
      dd: number;
      dtv: number;
    };
  };
}

function fcValueShape(e: FcEntry) {
  return {
    value: e.value,
    overallRank: e.overallRank,
    positionRank: e.positionRank,
    trend30Day: e.trend30Day,
  };
}

/**
 * Joins Sleeper players (source of truth, keyed by player_id) with
 * FantasyCalc and Dynasty Dealer (direct via sleeperId) and DynastyProcess
 * (FantasyPros id crosswalk, then normalized-name match with position/team
 * disambiguation). Cached for an hour.
 */
/** Optional sources degrade to an empty value rather than failing the page. */
async function optional<T>(p: Promise<Sourced<T>>, empty: T): Promise<Sourced<T>> {
  try {
    return await p;
  } catch (err) {
    console.warn("[canonical] optional source unavailable:", err);
    return { data: empty, source: "unavailable", fetchedAt: Date.now() };
  }
}

const EMPTY_DP: DpValues = { players: [], picks: [] };
const EMPTY_DD: DdValues = { players: [], picks: [] };
const EMPTY_DTV: DtvValues = { players: [], format: "1qb", generatedAt: null };

/** Degraded tables are retried soon instead of sticking for the full TTL. */
const DEGRADED_TTL_MS = 2 * 60 * 1000;

export async function buildCanonicalTable(): Promise<CanonicalTable> {
  const hit = cache.get<CanonicalTable>("canonical");
  if (hit?.fresh) return hit.data;

  // The player database is required (throws -> error page); value and
  // trending sources are optional.
  const [playersRes, fcDynRes, fcDyn1Res, fcRedRes, ddRes, dtv1Res, dtvSfRes, dtvPicksRes, dpRes, dpIdsRes, trendAddRes, trendDropRes] =
    await Promise.all([
      getPlayersMap(),
      optional(getFcValues("dynasty_sf"), []),
      optional(getFcValues("dynasty_1qb"), []),
      optional(getFcValues("redraft_1qb"), []),
      optional(getDdValues(), EMPTY_DD),
      optional(getDtvValues("1qb"), EMPTY_DTV),
      optional(getDtvValues("sf"), EMPTY_DTV),
      optional(getDtvPicks(), []),
      optional(getDpValues(), EMPTY_DP),
      optional(getDpIds(), EMPTY_CROSSWALK),
      optional(getTrending("add"), []),
      optional(getTrending("drop"), []),
    ]);
  const [newsRes, stateRes] = await Promise.all([
    optional(getEspnNews(), [] as NewsItem[]),
    getState().catch(() => null),
  ]);

  const players: Record<string, CanonicalPlayer> = {};
  for (const p of Object.values(playersRes.data)) {
    players[p.player_id] = {
      sleeperId: p.player_id,
      name: p.full_name,
      position: p.position,
      team: p.team,
      age: p.age,
      yearsExp: p.years_exp,
      injuryStatus: p.injury_status,
      depthOrder: p.depth_chart_order ?? null,
      injuryBodyPart: p.injury_body_part ?? null,
      injuryNotes: p.injury_notes ?? null,
      newsUpdated: p.news_updated ?? null,
      values: {},
    };
  }

  // Name index for sources without a usable id: normalized name -> sleeper ids.
  const byName = new Map<string, string[]>();
  for (const p of Object.values(players)) {
    const key = normalizeName(p.name);
    const list = byName.get(key) ?? [];
    list.push(p.sleeperId);
    byName.set(key, list);
  }

  const fcPicks: CanonicalTable["fcPicks"] = { dynastySf: [], dynasty1qb: [], redraft: [] };
  const joinFc = (
    entries: FcEntry[],
    field: "fcDynastySf" | "fcDynasty1qb" | "fcRedraft",
    pickList: FcEntry[]
  ): number => {
    let count = 0;
    for (const e of entries) {
      if (isPickName(e.player.name)) {
        pickList.push(e);
        continue;
      }
      const p = e.player.sleeperId ? players[e.player.sleeperId] : undefined;
      if (p) {
        p.values[field] = fcValueShape(e);
        count++;
      }
    }
    return count;
  };
  const fcDynCount = joinFc(fcDynRes.data, "fcDynastySf", fcPicks.dynastySf);
  const fcDyn1Count = joinFc(fcDyn1Res.data, "fcDynasty1qb", fcPicks.dynasty1qb);
  const fcRedCount = joinFc(fcRedRes.data, "fcRedraft", fcPicks.redraft);

  /** Match a name-keyed row to a Sleeper id, disambiguating by position/team. */
  const matchByName = (name: string, position: string, team: string | null): string | undefined => {
    const candidates = byName.get(normalizeName(name)) ?? [];
    if (candidates.length === 1) return candidates[0];
    return (
      candidates.find((id) => players[id].position === position && players[id].team === team) ??
      candidates.find((id) => players[id].position === position)
    );
  };

  // DynastyProcess: FantasyPros id -> Sleeper id crosswalk, name fallback.
  let dpCount = 0;
  for (const d of dpRes.data.players) {
    const viaId = dpIdsRes.data.fp[d.fpId];
    const id = viaId && players[viaId] ? viaId : matchByName(d.name, d.position, d.team);
    if (id) {
      players[id].values.dp = { sf: d.value2qb, oneQb: d.value1qb };
      dpCount++;
    }
  }

  // Dynasty Dealer: direct Sleeper ids (name fallback for any stragglers).
  let ddCount = 0;
  for (const d of ddRes.data.players) {
    const id = players[d.sleeperId] ? d.sleeperId : matchByName(d.name, d.position, d.team);
    if (!id) continue;
    players[id].values.dd = { value: d.value };
    ddCount++;
  }

  // DynastyTradeValues: name-keyed, 1QB and superflex lists.
  const dtvIds = new Set<string>();
  const joinDtv = (res: Sourced<DtvValues>, field: "oneQb" | "sf") => {
    for (const d of res.data.players) {
      const id = matchByName(d.name, d.position, d.team);
      if (!id) continue;
      const prev = players[id].values.dtv ?? { sf: 0, oneQb: 0 };
      players[id].values.dtv = { ...prev, [field]: d.value };
      dtvIds.add(id);
    }
  };
  joinDtv(dtv1Res, "oneQb");
  joinDtv(dtvSfRes, "sf");

  for (const t of trendAddRes.data) {
    const p = players[t.player_id];
    if (p) p.trending = { ...p.trending, add: t.count };
  }
  for (const t of trendDropRes.data) {
    const p = players[t.player_id];
    if (p) p.trending = { ...p.trending, drop: t.count };
  }

  // Injury outlook for everyone Sleeper lists as hurt, using recent news.
  const espnBySleeper = new Map<string, string[]>();
  for (const [espnId, sleeperId] of Object.entries(dpIdsRes.data.espn)) {
    espnBySleeper.set(sleeperId, [...(espnBySleeper.get(sleeperId) ?? []), espnId]);
  }
  // Fantasy playoffs end in week 17.
  const remainingWeeks = Math.max(1, 17 - (stateRes?.data.week ?? 1) + 1);
  // Demo news is dated to the demo season; judge it from the day after the latest item.
  const now = fixturesMode()
    ? Math.max(0, ...newsRes.data.map((n) => Date.parse(n.published))) + 24 * 3600 * 1000
    : Date.now();
  for (const p of Object.values(players)) {
    if (!p.injuryStatus) continue;
    const news = newsRes.data.filter((n) => newsMentions(n, p, espnBySleeper.get(p.sleeperId) ?? []));
    const fc = p.values.fcDynastySf;
    const outlook = computeOutlook(p, news, {
      remainingWeeks,
      now,
      marketDrop: fc && fc.value > 0 && fc.trend30Day ? -fc.trend30Day / fc.value : 0,
    });
    if (outlook) p.outlook = outlook;
  }

  const table: CanonicalTable = {
    players,
    fcPicks,
    dpPicks: dpRes.data.picks,
    ddPicks: ddRes.data.picks,
    dtvPicks: dtvPicksRes.data,
    ids: dpIdsRes.data,
    matchByName,
    meta: {
      source: worstSource(playersRes.source, fcDynRes.source, fcRedRes.source, dpRes.source),
      sources: {
        fc: worstSource(fcDynRes.source, fcDyn1Res.source, fcRedRes.source),
        dp: dpRes.source,
        dd: ddRes.source,
        dtv: worstSource(dtv1Res.source, dtvSfRes.source),
      },
      fetchedAt: Date.now(),
      counts: {
        players: Object.keys(players).length,
        fcDynastySf: fcDynCount,
        fcDynasty1qb: fcDyn1Count,
        fcRedraft: fcRedCount,
        dp: dpCount,
        dd: ddCount,
        dtv: dtvIds.size,
      },
    },
  };
  const failed = (s: DataSourceKind) => s === "stale" || s === "unavailable";
  const degraded = failed(table.meta.sources.fc) || failed(table.meta.sources.dp);
  cache.set("canonical", table, degraded && table.meta.source !== "fixture" ? DEGRADED_TTL_MS : TTL.canonical);
  return table;
}
