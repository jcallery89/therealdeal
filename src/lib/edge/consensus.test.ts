import { describe, expect, it } from "vitest";
import type { CanonicalPlayer } from "../players/canonical";
import { buildStartConsensus } from "./consensus";

const wr = (id: string): CanonicalPlayer => ({
  sleeperId: id, name: id, position: "WR", team: "AAA", age: 25, yearsExp: 3, injuryStatus: null, values: {},
});
const players = Object.fromEntries(["a", "b", "c", "d"].map((id) => [id, wr(id)]));
const projections = { a: 20, b: 15, c: 10, d: 5 };

describe("buildStartConsensus", () => {
  it("maps expert and crowd ranks onto the league's projection curve", () => {
    const c = buildStartConsensus({
      players,
      projections,
      // Experts love d (WR1); the crowd agrees with projections.
      experts: { d: { rank: 1, best: 1, worst: 2, grade: "A" }, a: { rank: 2, best: 1, worst: 3, grade: "A" } },
      started: { a: 90, b: 70, c: 40, d: 10 },
      startable: { WR: 2 },
    });
    // d: experts 20 (WR1 on the curve) x .4 + proj 5 x .35 + crowd 5 (4th) x .25 = 11
    expect(c.d.points).toBe(11);
    expect(c.d.agreement).toBe("split");
    expect(c.a.rank).toBe(1);
    expect(c.a.tier).toBe("Must start");
    expect(c.a.agreement).toBe("agree");
    expect(c.b.started).toBe(70);
  });

  it("works with projections alone", () => {
    const c = buildStartConsensus({ players, projections, experts: {}, started: {}, startable: { WR: 2 } });
    expect(c.a.points).toBe(20);
    expect(c.d.tier).toBe("Sit");
  });
});
