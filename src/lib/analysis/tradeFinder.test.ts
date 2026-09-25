import { describe, expect, it } from "vitest";
import { LEAGUES } from "../config";
import { CanonicalPlayer } from "../players/canonical";
import { SleeperRoster } from "../sleeper/types";
import { TeamAnalytics } from "./contender";
import { StarterSlots } from "./rosterStrength";
import { diversify, findTrades, positionBalance, replacementLevels, TradeSuggestion } from "./tradeFinder";

function makePlayer(id: string, position: string, value: number, age = 25): CanonicalPlayer {
  return {
    sleeperId: id,
    name: `P-${id}`,
    position,
    team: "FA",
    age,
    yearsExp: 3,
    injuryStatus: null,
    values: { fcDynastySf: { value, overallRank: 1, positionRank: 1, trend30Day: 0 } },
  };
}

const valueOf = (p: CanonicalPlayer) => p.values.fcDynastySf?.value ?? 0;
const slots: StarterSlots = { QB: 1, RB: 2, WR: 3, TE: 1, FLEX: 1, SUPER_FLEX: 1, total: 9 };

const roster = (id: number, playerIds: string[]): SleeperRoster => ({
  roster_id: id,
  owner_id: `u${id}`,
  co_owners: null,
  players: playerIds,
  starters: [],
  reserve: [],
  taxi: [],
  settings: { wins: 5, losses: 4, ties: 0, fpts: 1000 },
});

const analytics = (id: number, score: number): TeamAnalytics => ({
  rosterId: id,
  playerValue: 0, pickValue: 0, totalValue: 0, winNowValue: 0, futureValue: 0,
  weightedAge: null, trend30: 0, wins: 5, losses: 4, ties: 0, winPct: 0.55,
  contenderScore: score,
  bucket: score > 25 ? "Contend" : score < -25 ? "Rebuild" : "Push",
});

describe("positionBalance", () => {
  it("flags deficits and surpluses vs starter demand", () => {
    const players = {
      q1: makePlayer("q1", "QB", 5000),
      r1: makePlayer("r1", "RB", 4000),
      r2: makePlayer("r2", "RB", 3500),
      r3: makePlayer("r3", "RB", 3000),
      r4: makePlayer("r4", "RB", 2500),
      r5: makePlayer("r5", "RB", 2000),
    };
    const balance = positionBalance(Object.keys(players), players, slots);
    expect(balance.QB).toBeGreaterThan(0); // 1 QB for QB+SF demand => deficit
    expect(balance.RB).toBeLessThan(0); // 5 RBs for 2+flex-share => surplus
    expect(balance.WR).toBeGreaterThan(0);
  });
});

describe("findTrades", () => {
  it("suggests a fair swap that fixes complementary positional needs", () => {
    // Team 1: QB-rich, WR-poor. Team 2: WR-rich, QB-poor. Near-equal values.
    const players: Record<string, CanonicalPlayer> = {
      myQ1: makePlayer("myQ1", "QB", 5000),
      myQ2: makePlayer("myQ2", "QB", 4800),
      myQ3: makePlayer("myQ3", "QB", 4600),
      myW1: makePlayer("myW1", "WR", 2000),
      opW1: makePlayer("opW1", "WR", 5100),
      opW2: makePlayer("opW2", "WR", 4700),
      opW3: makePlayer("opW3", "WR", 4400),
      opW4: makePlayer("opW4", "WR", 4200),
      opW5: makePlayer("opW5", "WR", 4000),
      opQ1: makePlayer("opQ1", "QB", 1500),
    };
    const rosters = [
      roster(1, ["myQ1", "myQ2", "myQ3", "myW1"]),
      roster(2, ["opW1", "opW2", "opW3", "opW4", "opW5", "opQ1"]),
    ];
    const suggestions = findTrades({
      league: LEAGUES[1],
      myRosterId: 1,
      rosters,
      players,
      valueOf,
      slots,
      teamAnalytics: [analytics(1, 0), analytics(2, 0)],
      picks: [],
      pickValueOf: () => 0,
      teamNameById: new Map([[1, "Me"], [2, "Them"]]),
    });
    expect(suggestions.length).toBeGreaterThan(0);
    const top = suggestions[0];
    expect(top.deltaPct).toBeLessThan(12);
    expect(top.mutualScore).toBeGreaterThan(0);
    expect(top.send.some((a) => a.position === "QB")).toBe(true);
    expect(top.receive.some((a) => a.position === "WR")).toBe(true);
  });

  it("returns nothing when no trade helps both sides", () => {
    // Identical mirror rosters: any swap is churn.
    const players: Record<string, CanonicalPlayer> = {
      a1: makePlayer("a1", "RB", 4000, 25),
      b1: makePlayer("b1", "RB", 4000, 25),
    };
    const suggestions = findTrades({
      league: LEAGUES[1],
      myRosterId: 1,
      rosters: [roster(1, ["a1"]), roster(2, ["b1"])],
      players,
      valueOf,
      slots,
      teamAnalytics: [analytics(1, 0), analytics(2, 0)],
      picks: [],
      pickValueOf: () => 0,
      teamNameById: new Map(),
    });
    expect(suggestions).toEqual([]);
  });
});

describe("replacement-level needs", () => {
  it("doesn't count sub-replacement bodies as depth", () => {
    // Two teams, QB demand 2 each (QB + SF) -> replacement = 4th-best QB.
    const players: Record<string, CanonicalPlayer> = {
      a1: makePlayer("a1", "QB", 9000),
      a2: makePlayer("a2", "QB", 8000),
      b1: makePlayer("b1", "QB", 7000),
      b2: makePlayer("b2", "QB", 6000),
      b3: makePlayer("b3", "QB", 300),
      b4: makePlayer("b4", "QB", 200),
      b5: makePlayer("b5", "QB", 100),
    };
    const rosters = [roster(1, ["a1", "a2"]), roster(2, ["b1", "b2", "b3", "b4", "b5"])];
    const repl = replacementLevels(rosters, players, valueOf, slots);
    expect(repl.QB).toBe(6000);
    // Team 2 has five QBs but only two startable: balanced, not a surplus.
    const bal = positionBalance(rosters[1].players!, players, slots, valueOf, repl);
    expect(bal.QB).toBe(0);
    // Raw-count mode would have called that a big surplus.
    expect(positionBalance(rosters[1].players!, players, slots).QB).toBeLessThan(0);
  });
});

describe("diversify", () => {
  const sug = (opp: number, send: string, receive: string, score: number): TradeSuggestion => ({
    opponentRosterId: opp,
    send: [{ kind: "player", id: send, label: send, value: 1 }],
    receive: [{ kind: "player", id: receive, label: receive, value: 1 }],
    deltaPct: 1,
    mutualScore: score,
    myNotes: [],
    theirNotes: [],
  });

  it("caps suggestions per opponent and per asset", () => {
    const ranked = [
      sug(2, "star", "x1", 9),
      sug(2, "star", "x2", 8),
      sug(2, "other", "x3", 7), // 3rd for opponent 2 -> dropped
      sug(3, "star", "y1", 6), // star already used twice -> dropped
      sug(3, "depth", "x1", 5), // their x1 already used -> dropped
      sug(3, "depth", "y2", 4),
    ];
    const picked = diversify(ranked, 10).map((s) => `${s.opponentRosterId}:${s.send[0].id}:${s.receive[0].id}`);
    expect(picked).toEqual(["2:star:x1", "2:star:x2", "3:depth:y2"]);
  });

  it("respects the limit", () => {
    const ranked = Array.from({ length: 8 }, (_, i) => sug(i, `m${i}`, `t${i}`, 10 - i));
    expect(diversify(ranked, 3)).toHaveLength(3);
  });
});
