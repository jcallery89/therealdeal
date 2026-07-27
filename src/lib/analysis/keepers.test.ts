import { describe, expect, it } from "vitest";
import { CanonicalPlayer } from "../players/canonical";
import { KeeperRules, optimizeKeepers } from "./keepers";

function makePlayer(id: string, value: number, yearsExp: number): CanonicalPlayer {
  return {
    sleeperId: id,
    name: `Player ${id}`,
    position: "RB",
    team: "FA",
    age: 24,
    yearsExp,
    injuryStatus: null,
    values: { fcDynastySf: { value, overallRank: 1, positionRank: 1, trend30Day: 0 } },
  };
}

const valueOf = (p: CanonicalPlayer) => p.values.fcDynastySf?.value ?? 0;

function build(specs: [string, number, number][]) {
  const players: Record<string, CanonicalPlayer> = {};
  for (const [id, value, exp] of specs) players[id] = makePlayer(id, value, exp);
  return { players, ids: specs.map((s) => s[0]) };
}

const rules: KeeperRules = { maxKeepers: 2, taxiSlots: 1, taxiMaxYearsExp: 1 };

describe("optimizeKeepers", () => {
  it("keeps the highest-value players and cuts the rest", () => {
    const { players, ids } = build([
      ["a", 100, 5],
      ["b", 90, 5],
      ["c", 10, 5],
    ]);
    const plan = optimizeKeepers(ids, players, valueOf, { ...rules, taxiSlots: 0 });
    expect(plan.keep).toEqual(["a", "b"]);
    expect(plan.cut).toEqual(["c"]);
    expect(plan.totalKeptValue).toBe(190);
  });

  it("taxis a young stud to free a keeper slot for a veteran", () => {
    // Rookie (100) belongs on taxi so vet (40) survives in a keeper slot.
    const { players, ids } = build([
      ["rookie", 100, 0],
      ["vet1", 90, 8],
      ["vet2", 80, 8],
      ["vet3", 40, 8],
    ]);
    const plan = optimizeKeepers(ids, players, valueOf, rules);
    expect(plan.taxi).toEqual(["rookie"]);
    expect(plan.keep).toEqual(["vet1", "vet2"]);
    expect(plan.cut).toEqual(["vet3"]);
  });

  it("leaves taxi slots empty when nobody is eligible", () => {
    const { players, ids } = build([
      ["a", 100, 5],
      ["b", 90, 5],
      ["c", 80, 5],
    ]);
    const plan = optimizeKeepers(ids, players, valueOf, rules);
    expect(plan.taxi).toEqual([]);
    expect(plan.keep).toEqual(["a", "b"]);
    expect(plan.cut).toEqual(["c"]);
  });

  it("respects cut pins even for top-value players", () => {
    const { players, ids } = build([
      ["a", 100, 5],
      ["b", 90, 5],
      ["c", 10, 5],
    ]);
    const plan = optimizeKeepers(ids, players, valueOf, { ...rules, taxiSlots: 0 }, { a: "cut" });
    expect(plan.keep).toEqual(["b", "c"]);
    expect(plan.cut).toEqual(["a"]);
  });

  it("rejects ineligible taxi pins with a warning, counting them as keepers", () => {
    const { players, ids } = build([
      ["vet", 100, 8],
      ["b", 90, 5],
      ["c", 10, 0],
    ]);
    const plan = optimizeKeepers(ids, players, valueOf, rules, { vet: "taxi" });
    expect(plan.warnings.some((w) => w.includes("not taxi-eligible"))).toBe(true);
    expect(plan.keep).toContain("vet");
  });

  it("warns when more players are pinned to keep than slots allow", () => {
    const { players, ids } = build([
      ["a", 100, 5],
      ["b", 90, 5],
      ["c", 80, 5],
    ]);
    const plan = optimizeKeepers(ids, players, valueOf, { ...rules, taxiSlots: 0 }, {
      a: "keep",
      b: "keep",
      c: "keep",
    });
    expect(plan.warnings.some((w) => w.includes("keeper slots"))).toBe(true);
    expect(plan.keep).toHaveLength(3); // pins are honored; UI shows the warning
  });
});
