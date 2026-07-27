import { LeagueConfig } from "../config";
import { CanonicalPlayer } from "../players/canonical";
import { SleeperRoster } from "../sleeper/types";
import { DraftPick, PickValueTable, pickBucket, pickValue } from "../values/picks";
import { playerValue, ValueContext, ValueSource, trend30 } from "../values/engine";

export type PostureBucket = "Contend" | "Push" | "Retool" | "Rebuild";

export interface TeamAnalytics {
  rosterId: number;
  playerValue: number;
  pickValue: number;
  totalValue: number;
  /** Win-now proxy: sum of redraft values (players only). */
  winNowValue: number;
  /** Future proxy: pick value + value held in players under 25. */
  futureValue: number;
  weightedAge: number | null;
  trend30: number;
  wins: number;
  losses: number;
  ties: number;
  winPct: number;
  /** [-100, 100]; positive = win-now posture. */
  contenderScore: number;
  bucket: PostureBucket;
}

function zScores(values: number[]): number[] {
  const mean = values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
  const sd = Math.sqrt(
    values.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, values.length)
  );
  return values.map((v) => (sd > 0 ? (v - mean) / sd : 0));
}

export function bucketForScore(score: number): PostureBucket {
  if (score > 25) return "Contend";
  if (score >= 0) return "Push";
  if (score >= -25) return "Retool";
  return "Rebuild";
}

export function computeTeamAnalytics(opts: {
  league: LeagueConfig;
  rosters: SleeperRoster[];
  players: Record<string, CanonicalPlayer>;
  ctx: ValueContext;
  source: ValueSource;
  picks: DraftPick[];
  pickValues: PickValueTable;
  currentSeason: string;
}): TeamAnalytics[] {
  const { league, rosters, players, ctx, source, picks, pickValues, currentSeason } = opts;

  const base = rosters.map((r) => {
    const ids = r.players ?? [];
    let pv = 0, winNow = 0, future = 0, trendSum = 0, weighted = 0, weightTotal = 0;
    for (const id of ids) {
      const p = players[id];
      if (!p) continue;
      const v = playerValue(p, league, source, ctx);
      pv += v;
      winNow += p.values.fcRedraft?.value ?? 0;
      if (p.age !== null && p.age < 25) future += v;
      trendSum += trend30(p, league);
      if (p.age !== null && v > 0) {
        weighted += p.age * v;
        weightTotal += v;
      }
    }
    let pickTotal = 0;
    for (const pick of picks.filter((p) => p.ownerRosterId === r.roster_id)) {
      pickTotal += pickValue(
        pickValues,
        pick.season,
        pick.round,
        pickBucket(pick, rosters, currentSeason),
        currentSeason
      );
    }
    if (league.isDynasty) future += pickTotal;
    const { wins, losses, ties } = r.settings;
    const games = Math.max(1, wins + losses + ties);
    return {
      rosterId: r.roster_id,
      playerValue: pv,
      pickValue: pickTotal,
      totalValue: pv + (league.isDynasty ? pickTotal : 0),
      winNowValue: winNow,
      futureValue: future,
      weightedAge: weightTotal > 0 ? weighted / weightTotal : null,
      trend30: trendSum,
      wins,
      losses,
      ties,
      winPct: (wins + 0.5 * ties) / games,
    };
  });

  const zWinNow = zScores(base.map((t) => t.winNowValue));
  const zWinPct = zScores(base.map((t) => t.winPct));
  const zFuture = zScores(base.map((t) => t.futureValue));

  return base.map((t, i) => {
    const raw = 0.4 * zWinNow[i] + 0.3 * zWinPct[i] - 0.3 * zFuture[i];
    const contenderScore = Math.max(-100, Math.min(100, Math.round(raw * 55)));
    return { ...t, contenderScore, bucket: bucketForScore(contenderScore) };
  });
}
