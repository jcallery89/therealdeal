import { scoreStatLine } from "../analysis/lineup";
import { CORE_POSITIONS, neededAtPosition, starterSlots } from "../analysis/rosterStrength";
import { CanonicalPlayer } from "../players/canonical";
import type { StatLines } from "../sleeper/stats";

/** Games of projection "weight" a real game is worth when blending PPG. */
const PRIOR_GAMES = 4;
const DEFAULT_SEASON_GAMES = 17;

/**
 * This-season production value: points per game above a replacement-level
 * starter, scored with the league's actual settings (TE premium included).
 * PPG blends actual season-to-date scoring with Sleeper's season projection,
 * trusting actual results more as games accumulate. Replacement level at a
 * position is the best player who wouldn't start in this league
 * (teams x starters needed). Returns player_id -> PPG over replacement (> 0).
 */
export function computeProductionValues(opts: {
  players: Record<string, CanonicalPlayer>;
  teams: number;
  rosterPositions: string[];
  scoring: Record<string, number>;
  seasonStats: StatLines;
  seasonProjections: StatLines;
}): Record<string, number> {
  const { players, teams, rosterPositions, scoring, seasonStats, seasonProjections } = opts;
  const slots = starterSlots(rosterPositions);
  const core = new Set<string>(CORE_POSITIONS);

  const ppgById = new Map<string, number>();
  for (const p of Object.values(players)) {
    if (!core.has(p.position)) continue;
    const stats = seasonStats[p.sleeperId];
    const proj = seasonProjections[p.sleeperId];
    const gp = stats?.gp ?? 0;
    const actual = stats && gp > 0 ? scoreStatLine(stats, scoring, p.position) / gp : null;
    const projected = proj
      ? scoreStatLine(proj, scoring, p.position) / (proj.gp || DEFAULT_SEASON_GAMES)
      : null;
    let ppg: number | null = null;
    if (actual !== null && projected !== null) {
      const w = gp / (gp + PRIOR_GAMES);
      ppg = w * actual + (1 - w) * projected;
    } else {
      ppg = actual ?? projected;
    }
    if (ppg !== null && ppg > 0) ppgById.set(p.sleeperId, ppg);
  }

  const out: Record<string, number> = {};
  for (const pos of CORE_POSITIONS) {
    const ranked = [...ppgById.entries()]
      .filter(([id]) => players[id].position === pos)
      .sort((a, b) => b[1] - a[1]);
    const starters = teams * Math.max(1, neededAtPosition(slots, pos));
    const replacement = ranked[starters]?.[1] ?? 0;
    for (const [id, ppg] of ranked) {
      const over = ppg - replacement;
      if (over > 0) out[id] = Math.round(over * 100) / 100;
    }
  }
  return out;
}
