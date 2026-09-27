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
export type SingleSource = "fc" | "dp" | "dd" | "dtv" | "proj";
export type ValueSource = "consensus" | SingleSource;

export interface ValueMode {
  horizon: ValueHorizon;
  source: ValueSource;
}

export const SOURCE_LABELS: Record<ValueSource, string> = {
  consensus: "Consensus",
  fc: "FantasyCalc",
  dp: "DynastyProcess",
  dd: "Dynasty Dealer",
  dtv: "DynastyTradeValues",
  proj: "Projections",
};

export const HORIZON_LABELS: Record<ValueHorizon, string> = {
  dynasty: "Dynasty",
  season: "This season",
  keeper: "Keeper",
};

/** The independent opinions behind each horizon; Consensus averages them. */
export const HORIZON_SOURCES: Record<ValueHorizon, SingleSource[]> = {
  dynasty: ["fc", "dp", "dd", "dtv"],
  season: ["fc", "proj"],
  // Dynasty Dealer only publishes superflex-leaning values, so it sits out 1QB.
  keeper: ["fc", "dp", "dtv"],
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
  /** When each source's numbers were produced (ms), where known. */
  sourceDates?: Partial<Record<SingleSource, number>>;
}

const SCALE = 10000;
const key = (h: ValueHorizon, s: SingleSource) => `${h}:${s}`;

function rawValue(p: CanonicalPlayer, horizon: ValueHorizon, source: SingleSource, ctx: ValueContext): number {
  const v = p.values;
  switch (horizon) {
    case "dynasty":
      if (source === "fc") return v.fcDynastySf?.value ?? 0;
      if (source === "dp") return v.dp?.sf ?? 0;
      if (source === "dd") return v.dd?.value ?? 0;
      if (source === "dtv") return v.dtv?.sf ?? 0;
      return 0;
    case "keeper":
      if (source === "fc") return v.fcDynasty1qb?.value ?? 0;
      if (source === "dp") return v.dp?.oneQb ?? 0;
      if (source === "dtv") return v.dtv?.oneQb ?? 0;
      return 0;
    case "season":
      if (source === "fc") return v.fcRedraft?.value ?? 0;
      if (source === "proj") return ctx.production[p.sleeperId] ?? 0;
      return 0;
  }
}

export function computeValueContext(
  players: Record<string, CanonicalPlayer>,
  production: Record<string, number> = {},
  sourceDates: Partial<Record<SingleSource, number>> = {}
): ValueContext {
  const ctx: ValueContext = { maxes: {}, production, sourceDates };
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

/**
 * Injury adjustment on top of a source's number (markets react slowly):
 * this-season values lose the share of the season he'll miss; long-term
 * values take a smaller hit for a lost season, net of any drop FantasyCalc's
 * market already shows.
 */
export function injuryFactor(p: CanonicalPlayer, horizon: ValueHorizon, source: SingleSource): number {
  const o = p.outlook;
  if (!o) return 1;
  if (horizon === "season") return 1 - o.missShare;
  return source === "fc" ? o.fcLongTermFactor : o.longTermFactor;
}

/**
 * A source hasn't caught up with this player's injury: its numbers were
 * produced before the injury news broke.
 */
export function staleFor(p: CanonicalPlayer, source: SingleSource, ctx: ValueContext): boolean {
  const since = p.outlook?.since;
  const produced = ctx.sourceDates?.[source];
  return since !== null && since !== undefined && produced !== undefined && produced < since;
}

/** One source's opinion on the shared 0-10,000 scale (share of its top player). */
export function sourceValue(
  p: CanonicalPlayer,
  horizon: ValueHorizon,
  source: SingleSource,
  ctx: ValueContext
): number {
  const raw = rawValue(p, horizon, source, ctx);
  return raw > 0 ? (raw / (ctx.maxes[key(horizon, source)] ?? 1)) * SCALE * injuryFactor(p, horizon, source) : 0;
}

function tepAdjust(value: number, position: string): number {
  return position === "TE" ? Math.round(value * TE_PREMIUM_MULTIPLIER) : value;
}

/**
 * A player's value under a mode. Consensus averages every source that has an
 * opinion on the player (a source that doesn't list them, is down, or hasn't
 * caught up with his injury simply doesn't vote). TE premium applies in both
 * leagues.
 */
export function playerValue(
  p: CanonicalPlayer,
  league: LeagueConfig,
  mode: ValueMode,
  ctx: ValueContext
): number {
  let v: number;
  if (mode.source === "consensus") {
    const all = HORIZON_SOURCES[mode.horizon]
      .map((s) => ({ v: sourceValue(p, mode.horizon, s, ctx), stale: staleFor(p, s, ctx) }))
      .filter((x) => x.v > 0);
    const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    v = mean(all.map((x) => x.v));
    // A source that predates his injury news hasn't priced it in, so it may
    // only pull him down: it sits out when it's above the current sources.
    const current = all.filter((x) => !x.stale).map((x) => x.v);
    if (current.length && current.length < all.length) {
      const bar = mean(current);
      v = Math.min(v, mean(all.filter((x) => !x.stale || x.v <= bar).map((x) => x.v)));
    }
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
  dd?: PickValueTable;
  dtv?: PickValueTable;
}

const PICK_SOURCES = ["fc", "dp", "dd", "dtv"] as const;

/** FantasyCalc's typical top dynasty value — the static pick curve's scale. */
const FC_REFERENCE_MAX = 10500;

/**
 * Value of a draft pick on the same 0-10,000 scale as players. Dynasty picks
 * come from every market that prices them (FantasyCalc, DynastyProcess,
 * Dynasty Dealer, DynastyTradeValues); a source without pick prices falls
 * back to FantasyCalc's. The 1QB keeper league's draft isn't a rookie draft,
 * so its picks use the static curve.
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

  const priced = new Map<SingleSource, number>();
  for (const s of PICK_SOURCES) {
    const table = tables[s];
    if (table && table.source !== "static") priced.set(s, norm(table, s));
  }
  const fallback = norm({ values: {}, source: "static" }, "fc");
  let v: number;
  if (mode.source === "consensus") {
    const votes = [...priced.values()];
    v = votes.length ? votes.reduce((a, b) => a + b, 0) / votes.length : fallback;
  } else {
    v = priced.get(mode.source) ?? priced.get("fc") ?? priced.values().next().value ?? fallback;
  }
  return Math.round(v);
}
