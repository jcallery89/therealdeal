import { CanonicalPlayer } from "../players/canonical";
import { ProjectionEntry } from "../sleeper/types";

/** Slot label -> positions that can fill it. Unknown labels stay unfillable. */
const SLOT_ELIGIBILITY: Record<string, string[]> = {
  QB: ["QB"],
  RB: ["RB"],
  WR: ["WR"],
  TE: ["TE"],
  K: ["K"],
  DEF: ["DEF"],
  FLEX: ["RB", "WR", "TE"],
  WRRB_FLEX: ["WR", "RB"],
  REC_FLEX: ["WR", "TE"],
  SUPER_FLEX: ["QB", "RB", "WR", "TE"],
};

/**
 * Project fantasy points under the league's actual scoring settings.
 * If the stat line is granular (has yardage keys) we score it stat-by-stat;
 * otherwise we fall back to Sleeper's pre-computed pts_ppr. TE-premium
 * (bonus_rec_te) is applied per reception for TEs in both paths.
 */
export function scoreProjection(
  stats: Record<string, number>,
  scoring: Record<string, number>,
  position: string
): number {
  const teBonus =
    position === "TE" ? (scoring.bonus_rec_te ?? 0) * (stats.rec ?? 0) : 0;
  const granular = ["pass_yd", "rush_yd", "rec_yd"].some((k) => k in stats);
  if (granular) {
    let pts = 0;
    for (const [key, perUnit] of Object.entries(scoring)) {
      if (key === "bonus_rec_te") continue;
      const stat = stats[key];
      if (stat !== undefined) pts += perUnit * stat;
    }
    return pts + teBonus;
  }
  return (stats.pts_ppr ?? 0) + teBonus;
}

export function buildProjectionMap(
  entries: ProjectionEntry[] | null,
  players: Record<string, CanonicalPlayer>,
  scoring: Record<string, number>
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const e of entries ?? []) {
    const p = players[e.player_id];
    if (!p || !e.stats) continue;
    map[e.player_id] = Math.round(scoreProjection(e.stats, scoring, p.position) * 10) / 10;
  }
  return map;
}

export interface LineupSlot {
  slot: string;
  playerId: string | null;
  projected: number;
}

/**
 * Optimal lineup: fill fixed slots first, then flexes (narrowest eligibility
 * first), greedily taking the highest-projected remaining eligible player.
 * With superset flex eligibility this greedy order is optimal.
 */
export function optimalLineup(
  activePlayerIds: string[],
  rosterPositions: string[],
  players: Record<string, CanonicalPlayer>,
  projections: Record<string, number>
): LineupSlot[] {
  const slots = rosterPositions
    .filter((p) => p !== "BN" && p !== "IR" && p !== "TAXI")
    .map((slot, index) => ({
      slot,
      index,
      eligible: SLOT_ELIGIBILITY[slot] ?? [],
    }))
    // fixed positions before flexes; narrower flexes before wider
    .sort((a, b) => a.eligible.length - b.eligible.length);

  const available = new Set(activePlayerIds);
  const proj = (id: string) => projections[id] ?? 0;
  const filled = new Map<number, LineupSlot>();

  for (const { slot, index, eligible } of slots) {
    let bestId: string | null = null;
    for (const id of available) {
      const p = players[id];
      if (!p || !eligible.includes(p.position)) continue;
      if (bestId === null || proj(id) > proj(bestId)) bestId = id;
    }
    if (bestId !== null) available.delete(bestId);
    filled.set(index, { slot, playerId: bestId, projected: bestId ? proj(bestId) : 0 });
  }

  return [...filled.entries()].sort((a, b) => a[0] - b[0]).map(([, s]) => s);
}

export interface LineupAdvice {
  optimal: LineupSlot[];
  optimalTotal: number;
  currentTotal: number;
  /** Players the optimizer starts that are currently benched. */
  promote: string[];
  /** Current starters the optimizer benches. */
  sit: string[];
}

export function lineupAdvice(
  currentStarters: string[],
  activePlayerIds: string[],
  rosterPositions: string[],
  players: Record<string, CanonicalPlayer>,
  projections: Record<string, number>
): LineupAdvice {
  const optimal = optimalLineup(activePlayerIds, rosterPositions, players, projections);
  const optimalIds = new Set(
    optimal.map((s) => s.playerId).filter((id): id is string => id !== null)
  );
  const current = currentStarters.filter((id) => id !== "0");
  const currentSet = new Set(current);
  const proj = (id: string) => projections[id] ?? 0;

  return {
    optimal,
    optimalTotal: Math.round(optimal.reduce((s, x) => s + x.projected, 0) * 10) / 10,
    currentTotal: Math.round(current.reduce((s, id) => s + proj(id), 0) * 10) / 10,
    promote: [...optimalIds].filter((id) => !currentSet.has(id)).sort((a, b) => proj(b) - proj(a)),
    sit: current.filter((id) => !optimalIds.has(id)).sort((a, b) => proj(b) - proj(a)),
  };
}
