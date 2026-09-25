import { LeagueConfig } from "../config";
import { CanonicalPlayer } from "../players/canonical";
import type { StatLines } from "../sleeper/stats";
import { SleeperRoster } from "../sleeper/types";
import { trend30 } from "../values/engine";
import { scoreStatLine } from "./lineup";

export const EXPLORER_POSITIONS = ["QB", "RB", "WR", "TE", "K", "DEF"] as const;

export interface PlayerRow {
  id: string;
  name: string;
  position: string;
  team: string | null;
  age: number | null;
  injury: string | null;
  /** Roster that owns the player in this league; null = free agent. */
  ownerRosterId: number | null;
  value: number;
  /** Rank by value within the position (valued players only). */
  posRank: number | null;
  trend: number;
  /** Season-to-date fantasy points under this league's scoring. */
  seasonPts: number | null;
  gp: number | null;
  ppg: number | null;
  /** This week's projected points under this league's scoring. */
  proj: number | null;
  adds: number | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * One row per fantasy-relevant player: anyone rostered in this league, or
 * with market value, season production, or a projection. Scored with the
 * league's actual settings (TE premium included).
 */
export function buildPlayerRows(opts: {
  players: Record<string, CanonicalPlayer>;
  rosters: SleeperRoster[];
  valueOf: (p: CanonicalPlayer) => number;
  league: LeagueConfig;
  scoring: Record<string, number>;
  seasonStats: StatLines;
  projections: StatLines;
}): PlayerRow[] {
  const { players, rosters, valueOf, league, scoring, seasonStats, projections } = opts;
  const owner = new Map<string, number>();
  for (const r of rosters) for (const id of r.players ?? []) owner.set(id, r.roster_id);
  const positions = new Set<string>(EXPLORER_POSITIONS);

  const rows: PlayerRow[] = [];
  for (const p of Object.values(players)) {
    if (!positions.has(p.position)) continue;
    const stats = seasonStats[p.sleeperId];
    const projStats = projections[p.sleeperId];
    const seasonPts = stats ? round1(scoreStatLine(stats, scoring, p.position)) : null;
    const gp = stats?.gp ?? null;
    const proj = projStats ? round1(scoreStatLine(projStats, scoring, p.position)) : null;
    const value = valueOf(p);
    const ownerRosterId = owner.get(p.sleeperId) ?? null;
    const relevant =
      ownerRosterId !== null || value > 0 || (seasonPts ?? 0) > 0 || (proj ?? 0) > 0;
    if (!relevant) continue;
    rows.push({
      id: p.sleeperId,
      name: p.name,
      position: p.position,
      team: p.team,
      age: p.age,
      injury: p.injuryStatus,
      ownerRosterId,
      value,
      posRank: null,
      trend: trend30(p, league),
      seasonPts,
      gp,
      ppg: seasonPts !== null && gp ? round1(seasonPts / gp) : null,
      proj,
      adds: p.trending?.add ?? null,
    });
  }

  // Positional value ranks.
  const byPos = new Map<string, PlayerRow[]>();
  for (const r of rows) {
    if (r.value <= 0) continue;
    const list = byPos.get(r.position) ?? [];
    list.push(r);
    byPos.set(r.position, list);
  }
  for (const list of byPos.values()) {
    list.sort((a, b) => b.value - a.value).forEach((r, i) => (r.posRank = i + 1));
  }
  return rows.sort((a, b) => b.value - a.value);
}

export type SortKey = "value" | "posRank" | "ppg" | "seasonPts" | "gp" | "proj" | "trend" | "age" | "adds" | "name";

/** Sort rows by a column; missing values always sink to the bottom. */
export function sortRows(rows: PlayerRow[], key: SortKey, dir: "asc" | "desc"): PlayerRow[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (key === "name") return sign * a.name.localeCompare(b.name);
    const av = a[key];
    const bv = b[key];
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    return sign * ((av as number) - (bv as number));
  });
}
