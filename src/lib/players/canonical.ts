import { cache } from "../cache";
import { TTL } from "../config";
import { DataSourceKind, Sourced, worstSource } from "../datasource";
import { DpPick, DpValues, getDpIds, getDpValues } from "../dynastyprocess/client";
import { getFcValues } from "../fantasycalc/client";
import { FcEntry } from "../fantasycalc/types";
import { getKtcValues } from "../ktc/scrape";
import { getTrending } from "../sleeper/client";
import { getPlayersMap } from "../sleeper/players";
import { normalizeName } from "./normalize";
import { isPickName } from "../values/picks";

export interface CanonicalPlayer {
  sleeperId: string;
  name: string;
  position: string;
  team: string | null;
  age: number | null;
  yearsExp: number | null;
  injuryStatus: string | null;
  values: {
    fcDynastySf?: { value: number; overallRank: number; positionRank: number | null; trend30Day: number | null };
    fcRedraft?: { value: number; overallRank: number; positionRank: number | null; trend30Day: number | null };
    /** FantasyCalc dynasty 1QB — the keeper horizon for the 1QB league. */
    fcDynasty1qb?: { value: number; overallRank: number; positionRank: number | null; trend30Day: number | null };
    ktc?: { sf: number; oneQb: number };
    /** DynastyProcess (FantasyPros expert consensus) dynasty values. */
    dp?: { sf: number; oneQb: number };
  };
  trending?: { add?: number; drop?: number };
}

/** Health of each market-value provider. */
export interface ValueSourceHealth {
  fc: DataSourceKind;
  ktc: DataSourceKind;
  dp: DataSourceKind;
}

export interface CanonicalTable {
  players: Record<string, CanonicalPlayer>;
  /** FantasyCalc draft-pick entries (sleeperId null), per format. */
  fcPicks: { dynastySf: FcEntry[]; dynasty1qb: FcEntry[]; redraft: FcEntry[] };
  /** DynastyProcess pick values (1QB and superflex). */
  dpPicks: DpPick[];
  meta: {
    source: DataSourceKind;
    /** Per-value-source health, so optional sources can degrade softly. */
    sources: ValueSourceHealth;
    fetchedAt: number;
    ktcUnmatched: string[];
    counts: {
      players: number;
      fcDynastySf: number;
      fcDynasty1qb: number;
      fcRedraft: number;
      ktc: number;
      dp: number;
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
 * FantasyCalc (direct via sleeperId) and KTC (normalized-name match with
 * position/team disambiguation). Cached for an hour.
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

/** Degraded tables are retried soon instead of sticking for the full TTL. */
const DEGRADED_TTL_MS = 2 * 60 * 1000;

export async function buildCanonicalTable(): Promise<CanonicalTable> {
  const hit = cache.get<CanonicalTable>("canonical");
  if (hit?.fresh) return hit.data;

  // The player database is required (throws -> error page); value and
  // trending sources are optional.
  const [playersRes, fcDynRes, fcDyn1Res, fcRedRes, ktcRes, dpRes, dpIdsRes, trendAddRes, trendDropRes] =
    await Promise.all([
      getPlayersMap(),
      optional(getFcValues("dynasty_sf"), []),
      optional(getFcValues("dynasty_1qb"), []),
      optional(getFcValues("redraft_1qb"), []),
      optional(getKtcValues(), []),
      optional(getDpValues(), EMPTY_DP),
      optional(getDpIds(), {}),
      optional(getTrending("add"), []),
      optional(getTrending("drop"), []),
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
      values: {},
    };
  }

  // Name index for KTC matching: normalized name -> sleeper ids.
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
    const viaId = dpIdsRes.data[d.fpId];
    const id = viaId && players[viaId] ? viaId : matchByName(d.name, d.position, d.team);
    if (id) {
      players[id].values.dp = { sf: d.value2qb, oneQb: d.value1qb };
      dpCount++;
    }
  }

  const ktcUnmatched: string[] = [];
  let ktcCount = 0;
  for (const k of ktcRes.data) {
    const matchId = matchByName(k.playerName, k.position, k.team);
    if (matchId) {
      players[matchId].values.ktc = {
        sf: k.superflexValues?.value ?? 0,
        oneQb: k.oneQBValues?.value ?? 0,
      };
      ktcCount++;
    } else {
      ktcUnmatched.push(k.playerName);
    }
  }

  for (const t of trendAddRes.data) {
    const p = players[t.player_id];
    if (p) p.trending = { ...p.trending, add: t.count };
  }
  for (const t of trendDropRes.data) {
    const p = players[t.player_id];
    if (p) p.trending = { ...p.trending, drop: t.count };
  }

  const table: CanonicalTable = {
    players,
    fcPicks,
    dpPicks: dpRes.data.picks,
    meta: {
      source: worstSource(playersRes.source, fcDynRes.source, fcRedRes.source, dpRes.source),
      sources: {
        fc: worstSource(fcDynRes.source, fcDyn1Res.source, fcRedRes.source),
        ktc: ktcRes.source,
        dp: dpRes.source,
      },
      fetchedAt: Date.now(),
      ktcUnmatched,
      counts: {
        players: Object.keys(players).length,
        fcDynastySf: fcDynCount,
        fcDynasty1qb: fcDyn1Count,
        fcRedraft: fcRedCount,
        ktc: ktcCount,
        dp: dpCount,
      },
    },
  };
  const failed = (s: DataSourceKind) => s === "stale" || s === "unavailable";
  // KTC often blocks cloud hosts; it's an optional extra and doesn't shorten the cache.
  const degraded = failed(table.meta.sources.fc) || failed(table.meta.sources.dp);
  cache.set("canonical", table, degraded && table.meta.source !== "fixture" ? DEGRADED_TTL_MS : TTL.canonical);
  return table;
}
