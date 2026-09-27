import { LeagueConfig, TE_PREMIUM_MULTIPLIER } from "../config";
import { CanonicalPlayer } from "../players/canonical";
import { DraftPick, PickValueTable, pickValue } from "./picks";

/**
 * What a value measures:
 * - "dynasty": long-term superflex value (Dynasty league).
 * - "season": this season only (The Real Deal).
 * - "keeper": long-term 1QB value (The Real Deal keepers).
 */
export type ValueHorizon = "dynasty" | "season" | "keeper";
export type SingleSource = "fc" | "dp" | "ktc" | "proj";
export type ValueSource = "consensus" | SingleSource;

export interface ValueMode {
  horizon: ValueHorizon;
  source: ValueSource;
}

export const SOURCE_LABELS: Record<ValueSource, string> = {
  consensus: "Consensus",
  fc: "FantasyCalc",
  dp: "DynastyProcess",
  ktc: "KeepTradeCut",
  proj: "Projections",
};

export const HORIZON_LABELS: Record<ValueHorizon, string> = {
  dynasty: "Dynasty",
  season: "This season",
  keeper: "Keeper",
};

/** The independent opinions behind each horizon; Consensus averages them. */
export const HORIZON_SOURCES: Record<ValueHorizon, SingleSource[]> = {
  dynasty: ["fc", "dp", "ktc"],
  season: ["fc", "proj"],
  keeper: ["fc", "dp", "ktc"],
};

export function horizonsFor(league: LeagueConfig): ValueHorizon[] {
  return league.isDynasty ? ["dynasty"] : ["season", "keeper"];
}

/** Default lens for trades, rosters, and analytics. */
export function defaultMode(league: LeagueConfig): ValueMode {
  return { horizon: league.isDynasty ? "dynasty" : "season", source: "consensus" };
}

/** Keep/cut decisions look at long-term value. */
export function planningMode(league: LeagueConfig): ValueMode {
  return { horizon: league.isDynasty ? "dynasty" : "keeper", source: "consensus" };
}

export interface ValueContext {
  /** Top raw value per `${horizon}:${source}` — the normalization scale. */
  maxes: Record<string, number>;
  /** player_id -> this-season PPG over replacement (league-scored). */
  production: Record<string, number>;
}

const SCALE = 10000;
const key = (h: ValueHorizon, s: SingleSource) => `${h}:${s}`;

function rawValue(p: CanonicalPlayer, horizon: ValueHorizon, source: SingleSource, ctx: ValueContext): number {
  const v = p.values;
  switch (horizon) {
    case "dynasty":
      if (source === "fc") return v.fcDynastySf?.value ?? 0;
      if (source === "dp") return v.dp?.sf ?? 0;
      if (source === "ktc") return v.ktc?.sf ?? 0;
      return 0;
    case "keeper":
      if (source === "fc") return v.fcDynasty1qb?.value ?? 0;
      if (source === "dp") return v.dp?.oneQb ?? 0;
      if (source === "ktc") return v.ktc?.oneQb ?? 0;
      return 0;
    case "season":
      if (source === "fc") return v.fcRedraft?.value ?? 0;
      if (source === "proj") return ctx.production[p.sleeperId] ?? 0;
      return 0;
  }
}

export function computeValueContext(
  players: Record<string, CanonicalPlayer>,
  production: Record<string, number> = {}
): ValueContext {
  const ctx: ValueContext = { maxes: {}, production };
  for (const h of Object.keys(HORIZON_SOURCES) as ValueHorizon[]) {
    for (const s of HORIZON_SOURCES[h]) {
      let max = 1;
      for (const p of Object.values(players)) max = Math.max(max, rawValue(p, h, s, ctx));
      ctx.maxes[key(h, s)] = max;
    }
  }
  return ctx;
}

/** Whether a source has any data for this horizon right now. */
export function sourceAvailable(horizon: ValueHorizon, source: ValueSource, ctx: ValueContext): boolean {
  if (source === "consensus") return HORIZON_SOURCES[horizon].some((s) => sourceAvailable(horizon, s, ctx));
  return HORIZON_SOURCES[horizon].includes(source) && (ctx.maxes[key(horizon, source)] ?? 1) > 1;
}

/** One source's opinion on the shared 0-10,000 scale (share of its top player). */
export function sourceValue(
  p: CanonicalPlayer,
  horizon: ValueHorizon,
  source: SingleSource,
  ctx: ValueContext
): number {
  const raw = rawValue(p, horizon, source, ctx);
  return raw > 0 ? (raw / (ctx.maxes[key(horizon, source)] ?? 1)) * SCALE : 0;
}

function tepAdjust(value: number, position: string): number {
  return position === "TE" ? Math.round(value * TE_PREMIUM_MULTIPLIER) : value;
}

/**
 * A player's value under a mode. Consensus averages every source that has an
 * opinion on the player (a source that doesn't list them, or is down, simply
 * doesn't vote). TE premium applies in both leagues.
 */
export function playerValue(
  p: CanonicalPlayer,
  league: LeagueConfig,
  mode: ValueMode,
  ctx: ValueContext
): number {
  let v: number;
  if (mode.source === "consensus") {
    const votes = HORIZON_SOURCES[mode.horizon]
      .map((s) => sourceValue(p, mode.horizon, s, ctx))
      .filter((x) => x > 0);
    v = votes.length ? votes.reduce((a, b) => a + b, 0) / votes.length : 0;
  } else {
    v = sourceValue(p, mode.horizon, mode.source, ctx);
  }
  return tepAdjust(Math.round(v), p.position);
}

export function trend30(p: CanonicalPlayer, league: LeagueConfig): number {
  return (league.isDynasty ? p.values.fcDynastySf?.trend30Day : p.values.fcRedraft?.trend30Day) ?? 0;
}

// ---------------------------------------------------------------------------
// Draft picks

export interface PickTables {
  fc: PickValueTable;
  dp: PickValueTable;
}

/** FantasyCalc's typical top dynasty value — the static pick curve's scale. */
const FC_REFERENCE_MAX = 10500;

/**
 * Value of a draft pick on the same 0-10,000 scale as players. Dynasty picks
 * come from FantasyCalc and DynastyProcess (KTC picks aren't scraped, so KTC
 * mode uses FantasyCalc's). The 1QB keeper league's draft isn't a rookie
 * draft, so its picks use the static curve.
 */
export function draftPickValue(
  pick: DraftPick,
  tables: PickTables,
  leagueSeason: string,
  league: LeagueConfig,
  mode: ValueMode,
  ctx: ValueContext
): number {
  const norm = (table: PickValueTable, source: SingleSource) => {
    const max = table.source === "static" ? FC_REFERENCE_MAX : ctx.maxes[key("dynasty", source)] ?? 1;
    const scale = max > 1 ? max : FC_REFERENCE_MAX;
    return (pickValue(table, pick.season, pick.round, pick.bucket, leagueSeason) / scale) * SCALE;
  };
  if (!league.isDynasty) return Math.round(norm({ values: {}, source: "static" }, "fc"));

  const fc = tables.fc.source !== "static" ? norm(tables.fc, "fc") : null;
  const dp = tables.dp.source !== "static" ? norm(tables.dp, "dp") : null;
  const fallback = norm({ values: {}, source: "static" }, "fc");
  let v: number;
  if (mode.source === "dp") v = dp ?? fc ?? fallback;
  else if (mode.source === "consensus") {
    const votes = [fc, dp].filter((x): x is number => x !== null);
    v = votes.length ? votes.reduce((a, b) => a + b, 0) / votes.length : fallback;
  } else v = fc ?? dp ?? fallback;
  return Math.round(v);
}
