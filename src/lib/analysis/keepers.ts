import { CanonicalPlayer } from "../players/canonical";
import { SleeperLeague } from "../sleeper/types";
import { LeagueConfig } from "../config";

export type KeeperAssignment = "keep" | "taxi" | "cut";

export interface KeeperRules {
  /** Keeper slots; IR players count against this (they hold no special slot). */
  maxKeepers: number;
  taxiSlots: number;
  /** Taxi-eligible when yearsExp <= this (1 = "under 2 accrued seasons"). */
  taxiMaxYearsExp: number;
}

/** Manual overrides; everything unpinned is optimized. */
export type KeeperPins = Record<string, KeeperAssignment>;

export interface KeeperPlan {
  keep: string[];
  taxi: string[];
  cut: string[];
  totalKeptValue: number;
  warnings: string[];
}

export function defaultRules(league: SleeperLeague, config: LeagueConfig): KeeperRules {
  return {
    // League rule (not in the Sleeper API): dynasty keeps 13. The keeper
    // league falls back to Sleeper's max_keepers. Both editable in the UI.
    maxKeepers: config.isDynasty ? 13 : (league.settings.max_keepers ?? 3),
    taxiSlots: league.settings.taxi_slots ?? 0,
    taxiMaxYearsExp: 1,
  };
}

export function taxiEligible(p: CanonicalPlayer | undefined, rules: KeeperRules): boolean {
  return p !== undefined && p.yearsExp !== null && p.yearsExp <= rules.taxiMaxYearsExp;
}

/**
 * Exact optimizer over a tiny search space: try every count t of
 * optimizer-chosen taxi players (0..slots); each candidate plan puts the top-t
 * eligible players on taxi and the best maxKeepers of the rest in keeper
 * slots. This handles the key case of taxiing a young stud to free a keeper
 * slot for a veteran. Pins are honored first; the optimizer fills what's left.
 */
export function optimizeKeepers(
  playerIds: string[],
  players: Record<string, CanonicalPlayer>,
  valueOf: (p: CanonicalPlayer) => number,
  rules: KeeperRules,
  pins: KeeperPins = {}
): KeeperPlan {
  const warnings: string[] = [];
  const val = (id: string) => (players[id] ? valueOf(players[id]) : 0);

  const pinnedKeep: string[] = [];
  const pinnedTaxi: string[] = [];
  const pinnedCut: string[] = [];
  for (const id of playerIds) {
    const pin = pins[id];
    if (!pin) continue;
    if (pin === "taxi" && !taxiEligible(players[id], rules)) {
      warnings.push(
        `${players[id]?.name ?? id} is not taxi-eligible (over ${rules.taxiMaxYearsExp} yrs exp) — counted as a keeper instead.`
      );
      pinnedKeep.push(id);
    } else if (pin === "keep") pinnedKeep.push(id);
    else if (pin === "taxi") pinnedTaxi.push(id);
    else pinnedCut.push(id);
  }
  if (pinnedKeep.length > rules.maxKeepers) {
    warnings.push(`${pinnedKeep.length} players pinned to keep for ${rules.maxKeepers} keeper slots.`);
  }
  if (pinnedTaxi.length > rules.taxiSlots) {
    warnings.push(`${pinnedTaxi.length} players pinned to taxi for ${rules.taxiSlots} taxi slots.`);
  }

  const pinnedIds = new Set([...pinnedKeep, ...pinnedTaxi, ...pinnedCut]);
  const free = playerIds
    .filter((id) => !pinnedIds.has(id))
    .sort((a, b) => val(b) - val(a));
  const keepSlotsLeft = Math.max(0, rules.maxKeepers - pinnedKeep.length);
  const taxiSlotsLeft = Math.max(0, rules.taxiSlots - pinnedTaxi.length);
  const eligibleFree = free.filter((id) => taxiEligible(players[id], rules));

  let best: { keep: string[]; taxi: string[]; total: number } | null = null;
  for (let t = 0; t <= Math.min(taxiSlotsLeft, eligibleFree.length); t++) {
    const taxiPick = eligibleFree.slice(0, t);
    const taxiSet = new Set(taxiPick);
    const keepPick = free.filter((id) => !taxiSet.has(id)).slice(0, keepSlotsLeft);
    const total = [...taxiPick, ...keepPick].reduce((s, id) => s + val(id), 0);
    if (!best || total > best.total) best = { keep: keepPick, taxi: taxiPick, total };
  }

  const keep = [...pinnedKeep, ...(best?.keep ?? [])].sort((a, b) => val(b) - val(a));
  const taxi = [...pinnedTaxi, ...(best?.taxi ?? [])].sort((a, b) => val(b) - val(a));
  const keptSet = new Set([...keep, ...taxi]);
  const cut = playerIds.filter((id) => !keptSet.has(id)).sort((a, b) => val(b) - val(a));

  return {
    keep,
    taxi,
    cut,
    totalKeptValue: [...keep, ...taxi].reduce((s, id) => s + val(id), 0),
    warnings,
  };
}
