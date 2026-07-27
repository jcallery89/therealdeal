import { CanonicalPlayer } from "../players/canonical";

export const CORE_POSITIONS = ["QB", "RB", "WR", "TE"] as const;
export type CorePosition = (typeof CORE_POSITIONS)[number];

export interface StarterSlots {
  QB: number;
  RB: number;
  WR: number;
  TE: number;
  FLEX: number;
  SUPER_FLEX: number;
  total: number;
}

export function starterSlots(rosterPositions: string[]): StarterSlots {
  const s: StarterSlots = { QB: 0, RB: 0, WR: 0, TE: 0, FLEX: 0, SUPER_FLEX: 0, total: 0 };
  for (const pos of rosterPositions) {
    if (pos === "BN" || pos === "IR" || pos === "TAXI") continue;
    s.total++;
    if (pos === "QB") s.QB++;
    else if (pos === "RB") s.RB++;
    else if (pos === "WR") s.WR++;
    else if (pos === "TE") s.TE++;
    else if (pos === "SUPER_FLEX") s.SUPER_FLEX++;
    else if (pos.includes("FLEX")) s.FLEX++;
  }
  return s;
}

/** Startable bodies needed per position (flex demand spread across eligibles). */
export function neededAtPosition(slots: StarterSlots, pos: CorePosition): number {
  if (pos === "QB") return slots.QB + slots.SUPER_FLEX;
  const flexShare = Math.ceil(slots.FLEX / 3);
  if (pos === "RB") return slots.RB + flexShare;
  if (pos === "WR") return slots.WR + flexShare;
  return slots.TE;
}

/**
 * Positional strength: sum of a team's top-N values at each position, where
 * N = starter demand at that position (flex included). Meant to be compared
 * relative to the league max, not read as an absolute number.
 */
export function positionalStrength(
  playerIds: string[],
  players: Record<string, CanonicalPlayer>,
  valueOf: (p: CanonicalPlayer) => number,
  slots: StarterSlots
): Record<CorePosition, number> {
  const out = { QB: 0, RB: 0, WR: 0, TE: 0 };
  for (const pos of CORE_POSITIONS) {
    const values = playerIds
      .map((id) => players[id])
      .filter((p) => p && p.position === pos)
      .map(valueOf)
      .sort((a, b) => b - a);
    const n = Math.max(1, neededAtPosition(slots, pos));
    out[pos] = values.slice(0, n).reduce((sum, v) => sum + v, 0);
  }
  return out;
}

export function valueWeightedAge(
  playerIds: string[],
  players: Record<string, CanonicalPlayer>,
  valueOf: (p: CanonicalPlayer) => number
): number | null {
  let weighted = 0;
  let total = 0;
  for (const id of playerIds) {
    const p = players[id];
    if (!p || p.age === null) continue;
    const v = valueOf(p);
    weighted += p.age * v;
    total += v;
  }
  return total > 0 ? weighted / total : null;
}
