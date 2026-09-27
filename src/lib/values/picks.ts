import { FcEntry } from "../fantasycalc/types";
import { SleeperDraft, SleeperRoster, SleeperTradedPick } from "../sleeper/types";
import { PICK_SEASONS_AHEAD, ROOKIE_DRAFT_ROUNDS } from "../config";

export type PickBucket = "early" | "mid" | "late" | null;

export interface DraftPick {
  season: string;
  round: number;
  /** Roster whose draft slot this is (determines early/mid/late). */
  originalRosterId: number;
  /** Roster that currently owns the pick. */
  ownerRosterId: number;
  /** Projected early/mid/late position; only known for the next draft. */
  bucket: PickBucket;
}

export interface PickValueTable {
  /** key: `${season}-${round}` or `${season}-${round}-${bucket}` */
  values: Record<string, number>;
  source: "fantasycalc" | "dynastyprocess" | "dynastydealer" | "dynastytradevalues" | "static";
}

/** "2027 Early 1st", "2027 1st", "2027 Round 1" */
const PICK_NAME_RE =
  /^(\d{4})\s+(?:(Early|Mid|Late)\s+)?(?:Round\s+(\d)|(\d)(?:st|nd|rd|th))$/i;
/** "2026 Pick 1.03" — an exact draft slot. */
const SLOT_PICK_RE = /^(\d{4})\s+Pick\s+(\d+)\.(\d+)$/i;

export function isPickName(name: string): boolean {
  const n = name.trim();
  return PICK_NAME_RE.test(n) || SLOT_PICK_RE.test(n);
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

/**
 * Build a pick value table from named pick rows. Bucketed names map directly;
 * exact slots ("2026 Pick 1.03") are averaged into early/mid/late terciles of
 * that round (team count inferred from the highest slot), plus a generic
 * round value. Falls back to the static curve when nothing parses.
 */
export function parsePickRows(
  rows: { name: string; value: number }[],
  source: Exclude<PickValueTable["source"], "static">
): PickValueTable {
  const values: Record<string, number> = {};
  const slots = new Map<string, { slot: number; value: number }[]>();
  for (const { name, value } of rows) {
    const n = name.trim();
    const m = n.match(PICK_NAME_RE);
    if (m) {
      const bucket = m[2]?.toLowerCase() ?? null;
      const round = parseInt(m[3] ?? m[4], 10);
      values[bucket ? `${m[1]}-${round}-${bucket}` : `${m[1]}-${round}`] = value;
      continue;
    }
    const s = n.match(SLOT_PICK_RE);
    if (s) {
      const key = `${s[1]}-${parseInt(s[2], 10)}`;
      const list = slots.get(key) ?? [];
      list.push({ slot: parseInt(s[3], 10), value });
      slots.set(key, list);
    }
  }
  const avg = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
  for (const [key, list] of slots) {
    const teams = Math.max(...list.map((x) => x.slot));
    for (const b of ["early", "mid", "late"] as const) {
      const inBucket = list.filter((x) => bucketForSlot(x.slot, teams) === b).map((x) => x.value);
      if (inBucket.length && values[`${key}-${b}`] === undefined) values[`${key}-${b}`] = avg(inBucket);
    }
    if (values[key] === undefined) values[key] = avg(list.map((x) => x.value));
  }
  return Object.keys(values).length > 0 ? { values, source } : { values, source: "static" };
}

export function parseFcPicks(entries: FcEntry[]): PickValueTable {
  return parsePickRows(
    entries.map((e) => ({ name: e.player.name, value: e.value })),
    "fantasycalc"
  );
}

export function pickValue(
  table: PickValueTable,
  season: string,
  round: number,
  bucket: PickBucket,
  currentSeason: string
): number {
  if (table.source !== "static") {
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
 * Seasons with tradeable picks: the league's own season while its draft is
 * still pending (picks for it exist until the draft runs), then the next
 * PICK_SEASONS_AHEAD seasons.
 */
export function pickSeasons(leagueSeason: string, draft: SleeperDraft | null): string[] {
  const base = parseInt(leagueSeason, 10);
  const includeCurrent = draft !== null && draft.season === leagueSeason && draft.status !== "complete";
  const seasons = includeCurrent ? [leagueSeason] : [];
  for (let i = 1; i <= PICK_SEASONS_AHEAD; i++) seasons.push(String(base + i));
  return seasons;
}

/**
 * Draft rounds to track: Sleeper's configured rounds when known (rookie drafts
 * are short; a keeper league's full draft is long), never fewer than any round
 * that appears in a trade.
 */
export function pickRounds(draft: SleeperDraft | null, tradedPicks: SleeperTradedPick[]): number {
  const maxTraded = tradedPicks.reduce((m, tp) => Math.max(m, tp.round), 0);
  return Math.max(draft?.settings.rounds ?? ROOKIE_DRAFT_ROUNDS, maxTraded, 1);
}

/** Early/mid/late from a 1-based draft slot. */
export function bucketForSlot(slot: number, teams: number): PickBucket {
  const t = (slot - 1) / Math.max(1, teams);
  return t < 1 / 3 ? "early" : t < 2 / 3 ? "mid" : "late";
}

/**
 * Every team's pick inventory: each roster natively owns its picks for each
 * season/round, then traded_picks reassigns ownership of (season, round,
 * original roster) tuples. Picks in the first (next) draft get an early/mid/
 * late bucket from `slotByRoster` (official order or standings estimate).
 */
export function computePickInventory(
  rosters: SleeperRoster[],
  tradedPicks: SleeperTradedPick[],
  seasons: string[],
  rounds: number,
  slotByRoster: Map<number, number> | null = null
): DraftPick[] {
  const picks = new Map<string, DraftPick>();
  for (const r of rosters) {
    seasons.forEach((season, i) => {
      const slot = i === 0 ? slotByRoster?.get(r.roster_id) : undefined;
      for (let round = 1; round <= rounds; round++) {
        picks.set(`${season}-${round}-${r.roster_id}`, {
          season,
          round,
          originalRosterId: r.roster_id,
          ownerRosterId: r.roster_id,
          bucket: slot !== undefined ? bucketForSlot(slot, rosters.length) : null,
        });
      }
    });
  }
  for (const tp of tradedPicks) {
    const pick = picks.get(`${tp.season}-${tp.round}-${tp.roster_id}`);
    if (pick) pick.ownerRosterId = tp.owner_id;
  }
  return [...picks.values()];
}
