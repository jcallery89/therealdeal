import { describe, expect, it } from "vitest";
import type { SnapCount, WeeklyStat } from "../nflverse/client";
import { buildUsage, defenseFactors, opportunityRates } from "./usage";

function stat(o: Partial<WeeklyStat>): WeeklyStat {
  return {
    gsisId: "g", name: "n", position: "WR", team: "AAA", opponent: "BBB", week: 1,
    passAtt: 0, passYds: 0, passTd: 0, passInt: 0, carries: 0, rushYds: 0, rushTd: 0,
    targets: 0, receptions: 0, recYds: 0, recTd: 0, airYards: 0, targetShare: 0, airYardsShare: 0, wopr: 0, pprPoints: 0,
    ...o,
  };
}

// Two WRs with identical volume: one scores TDs, one doesn't.
const stats: WeeklyStat[] = [];
for (const week of [1, 2, 3, 4]) {
  stats.push(stat({ gsisId: "lucky", week, targets: 8, receptions: 5, recYds: 60, recTd: 1, targetShare: 0.2, pprPoints: 17 }));
  stats.push(stat({ gsisId: "unlucky", week, targets: 8, receptions: 5, recYds: 60, recTd: 0, targetShare: 0.2, pprPoints: 11 }));
  stats.push(stat({ gsisId: "rb", position: "RB", week, carries: week >= 3 ? 18 : 6, rushYds: 40, targetShare: 0.05, pprPoints: 4 }));
}
const snaps: SnapCount[] = [1, 2, 3, 4].map((week) => ({
  pfrId: "rb", name: "rb", position: "RB", team: "AAA", week, offensePct: week >= 3 ? 0.8 : 0.4,
}));
const usage = buildUsage({ stats, snaps, statId: (s) => s.gsisId, snapId: (s) => s.pfrId });

describe("opportunityRates", () => {
  it("prices a target at the league's points per target", () => {
    // Per week: 17 + 11 receiving points on 16 targets.
    expect(opportunityRates(stats).WR.target).toBeCloseTo(28 / 16);
  });
});

describe("buildUsage", () => {
  it("gives equal-volume players equal expected points, exposing TD luck", () => {
    expect(usage.lucky.xppg).toBe(usage.unlucky.xppg);
    expect(usage.lucky.ppg - usage.lucky.xppg).toBeGreaterThan(2.5);
    expect(usage.unlucky.ppg - usage.unlucky.xppg).toBeLessThan(-2.5);
    expect(usage.lucky.tdPerGame).toBe(1);
  });
  it("tracks snap-share trends and carry share", () => {
    expect(usage.rb.snapPrior).toBeCloseTo(0.4);
    expect(usage.rb.snapRecent).toBeCloseTo(0.8);
    expect(usage.rb.carryShareRecent).toBe(1);
    expect(usage.rb.weeks).toHaveLength(4);
  });
});

describe("defenseFactors", () => {
  it("compares points allowed to the league average", () => {
    const d = defenseFactors([
      stat({ opponent: "SOFT", position: "WR", pprPoints: 30 }),
      stat({ opponent: "HARD", position: "WR", pprPoints: 10 }),
    ]);
    expect(d.SOFT.WR).toBe(1.5);
    expect(d.HARD.WR).toBe(0.5);
  });
});
