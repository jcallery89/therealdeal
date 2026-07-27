import { FcEntry } from "../fantasycalc/types";
import { SleeperRoster, SleeperTradedPick } from "../sleeper/types";
import { PICK_SEASONS_AHEAD, ROOKIE_DRAFT_ROUNDS } from "../config";

export type PickBucket = "early" | "mid" | "late" | null;

export interface DraftPick {
  season: string;
  round: number;
  /** Roster whose draft slot this is (determines early/mid/late). */
  originalRosterId: number;
  /** Roster that currently owns the pick. */
  ownerRosterId: number;
}

export interface PickValueTable {
  /** key: `${season}-${round}` or `${season}-${round}-${bucket}` */
  values: Record<string, number>;
  source: "fantasycalc" | "static";
}

const PICK_NAME_RE =
  /^(\d{4})\s+(?:(Early|Mid|Late)\s+)?(?:Round\s+(\d)|(\d)(?:st|nd|rd|th))$/i;

export function isPickName(name: string): boolean {
  return PICK_NAME_RE.test(name.trim());
}

/**
 * Static fallback (dynasty SF scale, share of FC's typical top value) used
 * when FantasyCalc pick entries can't be parsed. Rough market curve: future
 * picks discounted ~10%/yr.
 */
const STATIC_ROUND_VALUES: Record<number, Record<string, number>> = {
  1: { early: 6500, mid: 5000, late: 3800, generic: 5000 },
  2: { early: 2600, mid: 2000, late: 1500, generic: 2000 },
  3: { early: 900, mid: 700, late: 500, generic: 700 },
  4: { early: 350, mid: 250, late: 180, generic: 250 },
};

export function parseFcPicks(entries: FcEntry[]): PickValueTable {
  const values: Record<string, number> = {};
  for (const e of entries) {
    const m = e.player.name.trim().match(PICK_NAME_RE);
    if (!m) continue;
    const season = m[1];
    const bucket = m[2]?.toLowerCase() ?? null;
    const round = parseInt(m[3] ?? m[4], 10);
    const key = bucket ? `${season}-${round}-${bucket}` : `${season}-${round}`;
    values[key] = e.value;
  }
  return Object.keys(values).length > 0
    ? { values, source: "fantasycalc" }
    : { values, source: "static" };
}

export function pickValue(
  table: PickValueTable,
  season: string,
  round: number,
  bucket: PickBucket,
  currentSeason: string
): number {
  if (table.source === "fantasycalc") {
    const keys = [
      bucket ? `${season}-${round}-${bucket}` : null,
      `${season}-${round}`,
      `${season}-${round}-mid`,
    ].filter((k): k is string => k !== null);
    for (const k of keys) {
      const v = table.values[k];
      if (v !== undefined) return v;
    }
  }
  const base = STATIC_ROUND_VALUES[round]?.[bucket ?? "generic"] ?? 100;
  const yearsOut = Math.max(0, parseInt(season, 10) - parseInt(currentSeason, 10));
  return Math.round(base * Math.pow(0.9, yearsOut));
}

export function pickLabel(pick: DraftPick, teamNameByRosterId: Map<number, string>): string {
  const via =
    pick.originalRosterId !== pick.ownerRosterId
      ? ` (via ${teamNameByRosterId.get(pick.originalRosterId) ?? `Team ${pick.originalRosterId}`})`
      : "";
  const ord = ["", "1st", "2nd", "3rd", "4th", "5th"][pick.round] ?? `R${pick.round}`;
  return `${pick.season} ${ord}${via}`;
}

/**
 * Compute every team's pick inventory: each roster natively owns its picks
 * for the next PICK_SEASONS_AHEAD seasons, then traded_picks reassigns
 * ownership of (season, round, original roster) tuples.
 */
export function computePickInventory(
  rosters: SleeperRoster[],
  tradedPicks: SleeperTradedPick[],
  currentSeason: string
): DraftPick[] {
  const startSeason = parseInt(currentSeason, 10) + 1;
  const picks = new Map<string, DraftPick>();
  for (const r of rosters) {
    for (let s = 0; s < PICK_SEASONS_AHEAD; s++) {
      const season = String(startSeason + s);
      for (let round = 1; round <= ROOKIE_DRAFT_ROUNDS; round++) {
        picks.set(`${season}-${round}-${r.roster_id}`, {
          season,
          round,
          originalRosterId: r.roster_id,
          ownerRosterId: r.roster_id,
        });
      }
    }
  }
  for (const tp of tradedPicks) {
    const key = `${tp.season}-${tp.round}-${tp.roster_id}`;
    const pick = picks.get(key);
    if (pick) pick.ownerRosterId = tp.owner_id;
  }
  return [...picks.values()];
}

/**
 * Early/mid/late bucket for a pick from the original team's current standing
 * (worse record => earlier pick). Only meaningful for the next draft; later
 * seasons return null (generic round value).
 */
export function pickBucket(
  pick: DraftPick,
  rosters: SleeperRoster[],
  currentSeason: string
): PickBucket {
  if (parseInt(pick.season, 10) > parseInt(currentSeason, 10) + 1) return null;
  const sorted = [...rosters].sort((a, b) => {
    const wa = a.settings.wins / Math.max(1, a.settings.wins + a.settings.losses + a.settings.ties);
    const wb = b.settings.wins / Math.max(1, b.settings.wins + b.settings.losses + b.settings.ties);
    if (wa !== wb) return wa - wb;
    return (a.settings.fpts ?? 0) - (b.settings.fpts ?? 0);
  });
  const idx = sorted.findIndex((r) => r.roster_id === pick.originalRosterId);
  if (idx < 0) return null;
  const tercile = idx / sorted.length;
  return tercile < 1 / 3 ? "early" : tercile < 2 / 3 ? "mid" : "late";
}
