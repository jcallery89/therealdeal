import { describe, expect, it } from "vitest";
import { LEAGUES } from "../config";
import { CanonicalPlayer } from "../players/canonical";
import { SleeperRoster } from "../sleeper/types";
import { TeamAnalytics } from "./contender";
import { StarterSlots } from "./rosterStrength";
import { findTrades, positionBalance } from "./tradeFinder";

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
      pickValues: { values: {}, source: "static" },
      currentSeason: "2025",
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
      pickValues: { values: {}, source: "static" },
      currentSeason: "2025",
      teamNameById: new Map(),
    });
    expect(suggestions).toEqual([]);
  });
});
