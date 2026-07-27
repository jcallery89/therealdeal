import { LeagueConfig } from "../config";
import { CanonicalPlayer } from "../players/canonical";
import { SleeperRoster } from "../sleeper/types";
import { DraftPick, PickValueTable, pickBucket, pickLabel, pickValue } from "../values/picks";
import { TeamAnalytics } from "./contender";
import {
  CORE_POSITIONS,
  CorePosition,
  neededAtPosition,
  StarterSlots,
} from "./rosterStrength";
import { consolidatedTotal, TradeAsset } from "./trade";

export interface TradeSuggestion {
  opponentRosterId: number;
  /** What MY team sends / receives. */
  send: TradeAsset[];
  receive: TradeAsset[];
  deltaPct: number;
  mutualScore: number;
  myNotes: string[];
  theirNotes: string[];
}

/** Positive = deficit (need bodies), negative = surplus beyond one backup. */
export function positionBalance(
  playerIds: string[],
  players: Record<string, CanonicalPlayer>,
  slots: StarterSlots
): Record<CorePosition, number> {
  const out = { QB: 0, RB: 0, WR: 0, TE: 0 };
  for (const pos of CORE_POSITIONS) {
    const count = playerIds.filter((id) => players[id]?.position === pos).length;
    const need = neededAtPosition(slots, pos) + 1; // starters + one backup
    out[pos] = need - count;
  }
  return out;
}

const MAX_GAP_PCT = 12;
const TOP_ASSETS = 12;

interface SideContext {
  rosterId: number;
  balance: Record<CorePosition, number>;
  contenderScore: number;
}

function isCore(pos: string | undefined): pos is CorePosition {
  return pos === "QB" || pos === "RB" || pos === "WR" || pos === "TE";
}

/**
 * Score how well the assets a side RECEIVES (and gives up) fit that side's
 * roster balance and posture. Positive = the trade makes sense for them.
 */
function fitScore(
  ctx: SideContext,
  receive: TradeAsset[],
  send: TradeAsset[],
  notes: string[]
): number {
  let score = 0;
  for (const a of receive) {
    if (a.kind === "pick") {
      if (ctx.contenderScore < -25) {
        score += 2;
        notes.push(`Adds draft capital to a rebuilding roster (${a.label})`);
      } else if (ctx.contenderScore > 25) score -= 1;
      continue;
    }
    if (isCore(a.position)) {
      if (ctx.balance[a.position] > 0) {
        score += 2;
        notes.push(`Fills a need at ${a.position} (${a.label})`);
      } else if (ctx.balance[a.position] < -1) {
        score -= 1;
      }
    }
    if (a.age !== null && a.age !== undefined) {
      if (ctx.contenderScore > 25 && a.age >= 26) {
        score += 1;
        notes.push(`Win-now veteran for a contender (${a.label})`);
      } else if (ctx.contenderScore < -25 && a.age <= 24) {
        score += 1;
        notes.push(`Young asset fits the rebuild (${a.label})`);
      }
    }
  }
  for (const a of send) {
    if (a.kind === "player" && isCore(a.position)) {
      if (ctx.balance[a.position] < 0) score += 1; // dealing from surplus
      else if (ctx.balance[a.position] > 0) {
        score -= 2;
        notes.push(`Thins an already-weak ${a.position} room (sends ${a.label})`);
      }
    }
  }
  // Mild penalty for asset-count bloat.
  score -= Math.max(0, send.length + receive.length - 3) * 0.5;
  return score;
}

function gapPct(sendValues: number[], receiveValues: number[]): number {
  const a = consolidatedTotal(sendValues);
  const b = consolidatedTotal(receiveValues);
  return Math.max(a, b) > 0 ? (Math.abs(a - b) / Math.max(a, b)) * 100 : 0;
}

export function findTrades(opts: {
  league: LeagueConfig;
  myRosterId: number;
  rosters: SleeperRoster[];
  players: Record<string, CanonicalPlayer>;
  valueOf: (p: CanonicalPlayer) => number;
  slots: StarterSlots;
  teamAnalytics: TeamAnalytics[];
  picks: DraftPick[];
  pickValues: PickValueTable;
  currentSeason: string;
  teamNameById: Map<number, string>;
  limit?: number;
}): TradeSuggestion[] {
  const {
    myRosterId, rosters, players, valueOf, slots, teamAnalytics,
    picks, pickValues, currentSeason, teamNameById,
  } = opts;

  const assetsFor = (rosterId: number): TradeAsset[] => {
    const roster = rosters.find((r) => r.roster_id === rosterId);
    return (roster?.players ?? [])
      .map((id) => players[id])
      .filter((p): p is CanonicalPlayer => p !== undefined)
      .map((p) => ({
        kind: "player" as const,
        id: p.sleeperId,
        label: p.name,
        value: valueOf(p),
        position: p.position,
        age: p.age,
      }))
      .filter((a) => a.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, TOP_ASSETS);
  };

  const pickAssetsFor = (rosterId: number): TradeAsset[] =>
    picks
      .filter((p) => p.ownerRosterId === rosterId)
      .map((p) => ({
        kind: "pick" as const,
        id: `${p.season}-${p.round}-${p.originalRosterId}`,
        label: pickLabel(p, teamNameById),
        value: pickValue(pickValues, p.season, p.round, pickBucket(p, rosters, currentSeason), currentSeason),
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);

  const ctxFor = (rosterId: number): SideContext => {
    const roster = rosters.find((r) => r.roster_id === rosterId);
    return {
      rosterId,
      balance: positionBalance(roster?.players ?? [], players, slots),
      contenderScore: teamAnalytics.find((t) => t.rosterId === rosterId)?.contenderScore ?? 0,
    };
  };

  const myAssets = assetsFor(myRosterId);
  const myPicks = pickAssetsFor(myRosterId);
  const myCtx = ctxFor(myRosterId);

  const suggestions: TradeSuggestion[] = [];
  const consider = (
    opponentRosterId: number,
    theirCtx: SideContext,
    send: TradeAsset[],
    receive: TradeAsset[]
  ) => {
    const delta = gapPct(send.map((a) => a.value), receive.map((a) => a.value));
    if (delta >= MAX_GAP_PCT) return;
    const myNotes: string[] = [];
    const theirNotes: string[] = [];
    const myScore = fitScore(myCtx, receive, send, myNotes);
    const theirScore = fitScore(theirCtx, send, receive, theirNotes);
    if (myScore <= 0 || theirScore <= 0) return;
    suggestions.push({
      opponentRosterId,
      send,
      receive,
      deltaPct: Math.round(delta * 10) / 10,
      mutualScore: Math.round(Math.min(myScore, theirScore) * 10) / 10,
      myNotes: [...new Set(myNotes)].slice(0, 3),
      theirNotes: [...new Set(theirNotes)].slice(0, 3),
    });
  };

  for (const opp of rosters) {
    if (opp.roster_id === myRosterId) continue;
    const theirCtx = ctxFor(opp.roster_id);
    const theirAssets = assetsFor(opp.roster_id);
    const theirPicks = pickAssetsFor(opp.roster_id);

    // 1-for-1 player swaps.
    for (const mine of myAssets) {
      for (const theirs of theirAssets) {
        if (mine.position === theirs.position && Math.abs((mine.age ?? 0) - (theirs.age ?? 0)) < 2) {
          continue; // same-position same-age swaps are churn, not fit
        }
        consider(opp.roster_id, theirCtx, [mine], [theirs]);
      }
    }

    // 2-for-1 consolidations, both directions (bounded to top assets).
    for (const big of theirAssets.slice(0, 5)) {
      for (let i = 0; i < myAssets.length; i++) {
        for (let j = i + 1; j < myAssets.length; j++) {
          consider(opp.roster_id, theirCtx, [myAssets[i], myAssets[j]], [big]);
        }
      }
    }
    for (const big of myAssets.slice(0, 5)) {
      for (let i = 0; i < theirAssets.length; i++) {
        for (let j = i + 1; j < theirAssets.length; j++) {
          consider(opp.roster_id, theirCtx, [big], [theirAssets[i], theirAssets[j]]);
        }
      }
    }

    // Player-for-picks in the posture-sensible direction.
    if (myCtx.contenderScore < -25 || theirCtx.contenderScore > 25) {
      for (const mine of myAssets.slice(0, 6)) {
        for (const pick of theirPicks) consider(opp.roster_id, theirCtx, [mine], [pick]);
        for (let i = 0; i < theirPicks.length; i++) {
          for (let j = i + 1; j < theirPicks.length; j++) {
            consider(opp.roster_id, theirCtx, [mine], [theirPicks[i], theirPicks[j]]);
          }
        }
      }
    }
    if (myCtx.contenderScore > 25 || theirCtx.contenderScore < -25) {
      for (const theirs of theirAssets.slice(0, 6)) {
        for (const pick of myPicks) consider(opp.roster_id, theirCtx, [pick], [theirs]);
      }
    }
  }

  return suggestions
    .sort((a, b) => b.mutualScore - a.mutualScore || a.deltaPct - b.deltaPct)
    .slice(0, opts.limit ?? 10);
}
