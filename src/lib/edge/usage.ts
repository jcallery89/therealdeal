import type { SnapCount, WeeklyStat } from "../nflverse/client";
import type { DefenseFactors, UsageSummary, WeekUsage } from "./types";

const recPts = (s: WeeklyStat) => s.receptions + s.recYds / 10 + 6 * s.recTd;
const rushPts = (s: WeeklyStat) => s.rushYds / 10 + 6 * s.rushTd;
const passPts = (s: WeeklyStat) => s.passYds / 25 + 4 * s.passTd - 2 * s.passInt;

interface Rates {
  target: number;
  carry: number;
  attempt: number;
}

/**
 * League-wide PPR points per opportunity at each position, from this season's
 * data. Expected points = a player's opportunities at those rates, so
 * "actual minus expected" isolates efficiency and touchdown luck.
 */
export function opportunityRates(stats: WeeklyStat[]): Record<string, Rates> {
  const sums: Record<string, { rec: number; tgt: number; rush: number; car: number; pass: number; att: number }> = {};
  for (const s of stats) {
    const t = (sums[s.position] ??= { rec: 0, tgt: 0, rush: 0, car: 0, pass: 0, att: 0 });
    t.rec += recPts(s);
    t.tgt += s.targets;
    t.rush += rushPts(s);
    t.car += s.carries;
    t.pass += passPts(s);
    t.att += s.passAtt;
  }
  const out: Record<string, Rates> = {};
  for (const [pos, t] of Object.entries(sums)) {
    out[pos] = {
      target: t.tgt ? t.rec / t.tgt : 0,
      carry: t.car ? t.rush / t.car : 0,
      attempt: t.att ? t.pass / t.att : 0,
    };
  }
  return out;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const avgOrNull = (xs: number[]) => (xs.length ? avg(xs) : null);
const round = (n: number, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

/**
 * Per-player usage keyed by Sleeper id. `toSleeper` maps nflverse ids
 * (GSIS for stats, PFR for snaps) with a name fallback.
 */
export function buildUsage(opts: {
  stats: WeeklyStat[];
  snaps: SnapCount[];
  statId: (s: WeeklyStat) => string | undefined;
  snapId: (s: SnapCount) => string | undefined;
}): Record<string, UsageSummary> {
  const rates = opportunityRates(opts.stats);

  // Team carries per week, for carry share.
  const teamCarries = new Map<string, number>();
  for (const s of opts.stats) {
    const key = `${s.team}:${s.week}`;
    teamCarries.set(key, (teamCarries.get(key) ?? 0) + s.carries);
  }

  const snapBy = new Map<string, Map<number, number>>();
  for (const s of opts.snaps) {
    const id = opts.snapId(s);
    if (!id) continue;
    const m = snapBy.get(id) ?? new Map<number, number>();
    m.set(s.week, s.offensePct);
    snapBy.set(id, m);
  }

  const byPlayer = new Map<string, WeeklyStat[]>();
  for (const s of opts.stats) {
    const id = opts.statId(s);
    if (!id) continue;
    const list = byPlayer.get(id) ?? [];
    list.push(s);
    byPlayer.set(id, list);
  }

  const out: Record<string, UsageSummary> = {};
  for (const [id, rows] of byPlayer) {
    rows.sort((a, b) => a.week - b.week);
    const r = rates[rows[0].position] ?? { target: 0, carry: 0, attempt: 0 };
    const xfp = (s: WeeklyStat) => s.targets * r.target + s.carries * r.carry + s.passAtt * r.attempt;
    const carryShare = (s: WeeklyStat) => {
      const team = teamCarries.get(`${s.team}:${s.week}`) ?? 0;
      return team ? s.carries / team : 0;
    };
    const snaps = snapBy.get(id);
    const weeks: WeekUsage[] = rows.map((s) => ({
      week: s.week,
      snapPct: snaps?.get(s.week) ?? null,
      targets: s.targets,
      carries: s.carries,
      points: round(s.pprPoints, 1),
    }));
    const recent = rows.slice(-2);
    const prior = rows.slice(0, -2);
    const snapVals = (list: WeeklyStat[]) =>
      list.map((s) => snaps?.get(s.week)).filter((v): v is number => v !== undefined);

    out[id] = {
      games: rows.length,
      snapPct: avgOrNull(snapVals(rows)),
      snapRecent: avgOrNull(snapVals(recent)),
      snapPrior: avgOrNull(snapVals(prior)),
      targetShare: round(avg(rows.map((s) => s.targetShare))),
      targetShareRecent: round(avg(recent.map((s) => s.targetShare))),
      carryShare: round(avg(rows.map(carryShare))),
      carryShareRecent: round(avg(recent.map(carryShare))),
      woprRecent: round(avg(recent.map((s) => s.wopr))),
      ppg: round(avg(rows.map((s) => s.pprPoints)), 1),
      xppg: round(avg(rows.map(xfp)), 1),
      xppgRecent: round(avg(recent.map(xfp)), 1),
      tdPerGame: round(avg(rows.map((s) => s.rushTd + s.recTd)), 2),
      weeks: weeks.slice(-4),
    };
  }
  return out;
}

/**
 * PPR points each defense allows per game to each position, relative to the
 * league average (1.2 = gives up 20% more than average: a soft matchup).
 */
export function defenseFactors(stats: WeeklyStat[]): DefenseFactors {
  // defense -> position -> week -> points
  const allowed = new Map<string, Map<string, Map<number, number>>>();
  for (const s of stats) {
    if (!s.opponent) continue;
    const byPos = allowed.get(s.opponent) ?? new Map<string, Map<number, number>>();
    const byWeek = byPos.get(s.position) ?? new Map<number, number>();
    byWeek.set(s.week, (byWeek.get(s.week) ?? 0) + s.pprPoints);
    byPos.set(s.position, byWeek);
    allowed.set(s.opponent, byPos);
  }
  const perGame: Record<string, Record<string, number>> = {};
  const leagueTotals: Record<string, number[]> = {};
  for (const [def, byPos] of allowed) {
    for (const [pos, byWeek] of byPos) {
      const v = avg([...byWeek.values()]);
      (perGame[def] ??= {})[pos] = v;
      (leagueTotals[pos] ??= []).push(v);
    }
  }
  const out: DefenseFactors = {};
  for (const [def, byPos] of Object.entries(perGame)) {
    out[def] = {};
    for (const [pos, v] of Object.entries(byPos)) {
      const lg = avg(leagueTotals[pos]);
      out[def][pos] = lg ? round(v / lg, 2) : 1;
    }
  }
  return out;
}
