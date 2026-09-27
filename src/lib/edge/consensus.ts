import type { CanonicalPlayer } from "../players/canonical";

/** One player's weekly start/sit picture across every source. */
export interface StartConsensus {
  /** Consensus projected points under the league's scoring. */
  points: number;
  /** Consensus positional rank this week. */
  rank: number;
  tier: "Must start" | "Start" | "Flex" | "Sit";
  /** Do the sources broadly agree on this player's tier? */
  agreement: "agree" | "split";
  experts?: { rank: number; best: number; worst: number; grade: string | null };
  /** Sleeper projection, league-scored. */
  projection?: number;
  projectionRank?: number;
  /** % of Sleeper leagues starting him (the crowd). */
  started?: number;
  crowdRank?: number;
}

export interface ExpertRank {
  rank: number;
  best: number;
  worst: number;
  grade: string | null;
}

/** How much each source counts in the blend (renormalized over available ones). */
const WEIGHTS = { experts: 0.4, projection: 0.35, crowd: 0.25 };

const POSITIONS = ["QB", "RB", "WR", "TE"];

/**
 * Blends expert consensus ranks (FantasyPros), Sleeper projections and
 * Sleeper start rates into one number. Ranks are converted to points with
 * the league's own projection curve at that position, so experts' "WR14"
 * means "what the 14th-best WR projects for in this league's scoring".
 *
 * `startable` = league-wide starters at each position (teams x demand).
 */
export function buildStartConsensus(opts: {
  players: Record<string, CanonicalPlayer>;
  projections: Record<string, number>;
  experts: Record<string, ExpertRank>;
  started: Record<string, number>;
  startable: Record<string, number>;
}): Record<string, StartConsensus> {
  const { players, projections, experts, started, startable } = opts;
  const out: Record<string, StartConsensus> = {};

  for (const pos of POSITIONS) {
    const ids = new Set<string>();
    for (const src of [projections, experts, started]) {
      for (const id of Object.keys(src)) if (players[id]?.position === pos) ids.add(id);
    }
    if (ids.size === 0) continue;

    const curve = [...ids]
      .map((id) => projections[id] ?? 0)
      .filter((v) => v > 0)
      .sort((a, b) => b - a);
    const pointsAtRank = (rank: number) =>
      curve.length ? curve[Math.min(curve.length - 1, Math.max(0, Math.round(rank) - 1))] : 0;

    const rankBy = (score: (id: string) => number | undefined) => {
      const ranked = [...ids]
        .filter((id) => (score(id) ?? 0) > 0)
        .sort((a, b) => score(b)! - score(a)!);
      return new Map(ranked.map((id, i) => [id, i + 1]));
    };
    const projRank = rankBy((id) => projections[id]);
    const crowdRank = rankBy((id) => started[id]);

    const rows: { id: string; points: number; ranks: number[]; c: StartConsensus }[] = [];
    for (const id of ids) {
      const parts: [number, number][] = [];
      const ranks: number[] = [];
      const c = {} as StartConsensus;
      const e = experts[id];
      if (e && curve.length) {
        parts.push([pointsAtRank(e.rank), WEIGHTS.experts]);
        ranks.push(e.rank);
        c.experts = e;
      }
      if (projections[id] !== undefined) {
        parts.push([projections[id], WEIGHTS.projection]);
        c.projection = projections[id];
        const r = projRank.get(id);
        if (r) {
          c.projectionRank = r;
          ranks.push(r);
        }
      }
      const cr = crowdRank.get(id);
      if (cr && curve.length) {
        parts.push([pointsAtRank(cr), WEIGHTS.crowd]);
        ranks.push(cr);
        c.started = started[id];
        c.crowdRank = cr;
      }
      if (parts.length === 0) continue;
      const w = parts.reduce((s, [, wt]) => s + wt, 0);
      const points = parts.reduce((s, [v, wt]) => s + v * wt, 0) / w;
      rows.push({ id, points: Math.round(points * 10) / 10, ranks, c });
    }

    rows.sort((a, b) => b.points - a.points);
    const n = Math.max(1, startable[pos] ?? 10);
    const tierFor = (rank: number): StartConsensus["tier"] =>
      rank <= Math.ceil(n * 0.5) ? "Must start" : rank <= n ? "Start" : rank <= Math.ceil(n * 1.4) ? "Flex" : "Sit";
    rows.forEach((row, i) => {
      // Agree = every source lands on the same side of the startable line,
      // or they're within a few spots of each other.
      const sides = new Set(row.ranks.map((r) => r <= n));
      const spread = row.ranks.length ? Math.max(...row.ranks) - Math.min(...row.ranks) : 0;
      out[row.id] = {
        ...row.c,
        points: row.points,
        rank: i + 1,
        tier: tierFor(i + 1),
        agreement: sides.size <= 1 || spread <= Math.max(2, n * 0.25) ? "agree" : "split",
      };
    });
  }
  return out;
}
