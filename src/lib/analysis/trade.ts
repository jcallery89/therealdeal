import { LeagueConfig } from "../config";
import { CanonicalPlayer } from "../players/canonical";
import {
  CorePosition,
  CORE_POSITIONS,
  neededAtPosition,
  StarterSlots,
  valueWeightedAge,
} from "./rosterStrength";

export interface TradeAsset {
  kind: "player" | "pick";
  /** Sleeper player_id, or `${season}-${round}-${originalRosterId}` for picks. */
  id: string;
  label: string;
  value: number;
  position?: string;
  age?: number | null;
}

export interface TradeSide {
  rosterId: number | null;
  /** Assets this side SENDS. */
  assets: TradeAsset[];
}

export interface FitNote {
  tone: "good" | "bad" | "neutral";
  text: string;
}

export interface SideEvaluation {
  rawTotal: number;
  adjTotal: number;
  fit: FitNote[];
}

export interface TradeEvaluation {
  a: SideEvaluation;
  b: SideEvaluation;
  /** Positive favors side A (A receives more adjusted value), negative favors B. */
  delta: number;
  deltaPct: number;
  verdict: string;
  favors: "A" | "B" | null;
}

/**
 * Consolidation adjustment: a side's assets are weighted descending
 * (1, 0.95, 0.9, ... floor 0.7) before summing, encoding that packaging
 * multiple lesser assets loses a little value — 2-for-1s favor the side
 * receiving the best player.
 */
export const CONSOLIDATION_STEP = 0.05;
export const CONSOLIDATION_FLOOR = 0.7;

export function consolidatedTotal(values: number[]): number {
  return [...values]
    .sort((a, b) => b - a)
    .reduce(
      (sum, v, i) => sum + v * Math.max(CONSOLIDATION_FLOOR, 1 - i * CONSOLIDATION_STEP),
      0
    );
}

export interface RosterContext {
  rosterId: number;
  teamName: string;
  playerIds: string[];
  /** Contender-rebuild score in [-100, 100], if known. */
  contenderScore?: number;
}

interface FitParams {
  league: LeagueConfig;
  slots: StarterSlots;
  players: Record<string, CanonicalPlayer>;
  valueOf: (p: CanonicalPlayer) => number;
  roster: RosterContext;
  incoming: TradeAsset[];
  outgoing: TradeAsset[];
}

function startableCount(
  playerIds: string[],
  players: Record<string, CanonicalPlayer>,
  pos: CorePosition
): number {
  return playerIds.filter((id) => players[id]?.position === pos).length;
}

export function rosterFit(params: FitParams): FitNote[] {
  const { slots, players, valueOf, roster, incoming, outgoing } = params;
  const notes: FitNote[] = [];

  const outgoingPlayerIds = new Set(
    outgoing.filter((a) => a.kind === "player").map((a) => a.id)
  );
  const incomingPlayerIds = incoming
    .filter((a) => a.kind === "player")
    .map((a) => a.id);
  const postIds = roster.playerIds
    .filter((id) => !outgoingPlayerIds.has(id))
    .concat(incomingPlayerIds);

  for (const pos of CORE_POSITIONS) {
    const need = neededAtPosition(slots, pos);
    const before = startableCount(roster.playerIds, players, pos);
    const after = startableCount(postIds, players, pos);
    if (after < need && before >= need) {
      notes.push({ tone: "bad", text: `Leaves ${roster.teamName} thin at ${pos} (${after} for ${need} starting slots)` });
    } else if (before < need && after >= before + 1) {
      notes.push({ tone: "good", text: `Fills a starting need at ${pos}` });
    }
  }

  const ageBefore = valueWeightedAge(roster.playerIds, players, valueOf);
  const ageAfter = valueWeightedAge(postIds, players, valueOf);
  if (ageBefore !== null && ageAfter !== null) {
    const diff = ageAfter - ageBefore;
    if (Math.abs(diff) >= 0.4) {
      notes.push({
        tone: "neutral",
        text: `Roster gets ${diff < 0 ? "younger" : "older"} by ${Math.abs(diff).toFixed(1)} yrs (value-weighted)`,
      });
    }
  }

  const incomingPicks = incoming.filter((a) => a.kind === "pick").length;
  const incomingYoung = incomingPlayerIds.filter((id) => {
    const p = players[id];
    return p?.age !== null && p !== undefined && p.age < 25;
  }).length;
  const futureLean = incomingPicks + incomingYoung;
  const winNowLean = incomingPlayerIds.length - incomingYoung;
  const score = roster.contenderScore;
  if (score !== undefined && incoming.length > 0) {
    if (score > 25 && winNowLean > futureLean) {
      notes.push({ tone: "good", text: "Adds win-now value — fits a contending roster" });
    } else if (score < -25 && futureLean > winNowLean) {
      notes.push({ tone: "good", text: "Adds youth/picks — fits the rebuild timeline" });
    } else if (score > 25 && futureLean > winNowLean) {
      notes.push({ tone: "neutral", text: "Future-leaning return for a contending roster" });
    } else if (score < -25 && winNowLean > futureLean) {
      notes.push({ tone: "neutral", text: "Win-now return for a rebuilding roster" });
    }
  }

  return notes;
}

export function evaluateTrade(
  sideA: TradeSide,
  sideB: TradeSide,
  teamNames: { a: string; b: string },
  fitParams?: { a: FitParams | null; b: FitParams | null }
): TradeEvaluation {
  const rawA = sideA.assets.reduce((s, x) => s + x.value, 0);
  const rawB = sideB.assets.reduce((s, x) => s + x.value, 0);
  const adjA = consolidatedTotal(sideA.assets.map((x) => x.value));
  const adjB = consolidatedTotal(sideB.assets.map((x) => x.value));

  // Side A RECEIVES what side B sends.
  const receivedA = adjB;
  const receivedB = adjA;
  const delta = receivedA - receivedB;
  const deltaPct = Math.max(receivedA, receivedB) > 0
    ? (Math.abs(delta) / Math.max(receivedA, receivedB)) * 100
    : 0;

  let verdict: string;
  let favors: "A" | "B" | null = null;
  if (deltaPct < 5) {
    verdict = "Fair trade";
  } else {
    favors = delta > 0 ? "A" : "B";
    const name = favors === "A" ? teamNames.a : teamNames.b;
    verdict = deltaPct < 15 ? `Slightly favors ${name}` : `Favors ${name}`;
  }

  return {
    a: { rawTotal: rawA, adjTotal: adjA, fit: fitParams?.a ? rosterFit(fitParams.a) : [] },
    b: { rawTotal: rawB, adjTotal: adjB, fit: fitParams?.b ? rosterFit(fitParams.b) : [] },
    delta,
    deltaPct,
    verdict,
    favors,
  };
}
