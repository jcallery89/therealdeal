import { cache } from "../cache";
import { TTL } from "../config";
import { DataSourceKind, Sourced, worstSource } from "../datasource";
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
    ktc?: { sf: number; oneQb: number };
  };
  trending?: { add?: number; drop?: number };
}

export interface CanonicalTable {
  players: Record<string, CanonicalPlayer>;
  /** FantasyCalc draft-pick entries (sleeperId null), per format. */
  fcPicks: { dynastySf: FcEntry[]; redraft: FcEntry[] };
  meta: {
    source: DataSourceKind;
    /** Per-value-source health, so optional sources can degrade softly. */
    sources: { fc: DataSourceKind; ktc: DataSourceKind };
    fetchedAt: number;
    ktcUnmatched: string[];
    counts: { players: number; fcDynastySf: number; fcRedraft: number; ktc: number };
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
/** Optional sources degrade to an empty list rather than failing the page. */
async function optional<T>(p: Promise<Sourced<T[]>>): Promise<Sourced<T[]>> {
  try {
    return await p;
  } catch (err) {
    console.warn("[canonical] optional source unavailable:", err);
    return { data: [], source: "unavailable", fetchedAt: Date.now() };
  }
}

/** Degraded tables are retried soon instead of sticking for the full TTL. */
const DEGRADED_TTL_MS = 2 * 60 * 1000;

export async function buildCanonicalTable(): Promise<CanonicalTable> {
  const hit = cache.get<CanonicalTable>("canonical");
  if (hit?.fresh) return hit.data;

  // The player database is required (throws -> error page); value and
  // trending sources are optional.
  const [playersRes, fcDynRes, fcRedRes, ktcRes, trendAddRes, trendDropRes] =
    await Promise.all([
      getPlayersMap(),
      optional(getFcValues("dynasty_sf")),
      optional(getFcValues("redraft_1qb")),
      optional(getKtcValues()),
      optional(getTrending("add")),
      optional(getTrending("drop")),
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

  const fcPicks: CanonicalTable["fcPicks"] = { dynastySf: [], redraft: [] };
  let fcDynCount = 0;
  for (const e of fcDynRes.data) {
    if (!e.player.sleeperId || isPickName(e.player.name)) {
      if (isPickName(e.player.name)) fcPicks.dynastySf.push(e);
      continue;
    }
    const p = players[e.player.sleeperId];
    if (p) {
      p.values.fcDynastySf = fcValueShape(e);
      fcDynCount++;
    }
  }
  let fcRedCount = 0;
  for (const e of fcRedRes.data) {
    if (!e.player.sleeperId || isPickName(e.player.name)) {
      if (isPickName(e.player.name)) fcPicks.redraft.push(e);
      continue;
    }
    const p = players[e.player.sleeperId];
    if (p) {
      p.values.fcRedraft = fcValueShape(e);
      fcRedCount++;
    }
  }

  const ktcUnmatched: string[] = [];
  let ktcCount = 0;
  for (const k of ktcRes.data) {
    const candidates = byName.get(normalizeName(k.playerName)) ?? [];
    let matchId: string | undefined;
    if (candidates.length === 1) {
      matchId = candidates[0];
    } else if (candidates.length > 1) {
      matchId =
        candidates.find((id) => players[id].position === k.position && players[id].team === k.team) ??
        candidates.find((id) => players[id].position === k.position);
    }
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
    meta: {
      source: worstSource(
        playersRes.source,
        fcDynRes.source,
        fcRedRes.source,
        ktcRes.source
      ),
      sources: {
        fc: worstSource(fcDynRes.source, fcRedRes.source),
        ktc: ktcRes.source,
      },
      fetchedAt: Date.now(),
      ktcUnmatched,
      counts: {
        players: Object.keys(players).length,
        fcDynastySf: fcDynCount,
        fcRedraft: fcRedCount,
        ktc: ktcCount,
      },
    },
  };
  const degraded = table.meta.sources.fc !== "live" || table.meta.sources.ktc !== "live";
  cache.set("canonical", table, degraded && table.meta.source !== "fixture" ? DEGRADED_TTL_MS : TTL.canonical);
  return table;
}
