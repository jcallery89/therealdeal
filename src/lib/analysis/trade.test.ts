import { describe, expect, it } from "vitest";
import { consolidatedTotal, evaluateTrade, TradeSide } from "./trade";

const side = (rosterId: number, values: number[]): TradeSide => ({
  rosterId,
  assets: values.map((value, i) => ({
    kind: "player" as const,
    id: `p${rosterId}-${i}`,
    label: `P${i}`,
    value,
  })),
});

describe("consolidatedTotal", () => {
  it("weights descending so 2-for-1s favor the star side", () => {
    // 6000 straight up vs 3200+3000: raw favors the package (6200),
    // adjusted narrows it (3200 + 3000*0.95 = 6050).
    expect(consolidatedTotal([6000])).toBe(6000);
    expect(consolidatedTotal([3200, 3000])).toBeCloseTo(6050);
  });

  it("floors the discount at 0.7", () => {
    const many = consolidatedTotal(Array(10).fill(100));
    // weights: 1,.95,.9,.85,.8,.75,.7,.7,.7,.7 = 8.05
    expect(many).toBeCloseTo(805);
  });
});

describe("evaluateTrade", () => {
  it("calls a near-even swap fair", () => {
    const result = evaluateTrade(side(1, [5000]), side(2, [4950]), { a: "A", b: "B" });
    expect(result.verdict).toBe("Fair trade");
    expect(result.favors).toBeNull();
  });

  it("flags a lopsided trade toward the receiving side", () => {
    // A sends 3000, B sends 6000 => A receives more => favors A.
    const result = evaluateTrade(side(1, [3000]), side(2, [6000]), { a: "Team A", b: "Team B" });
    expect(result.favors).toBe("A");
    expect(result.verdict).toContain("Team A");
    expect(result.deltaPct).toBeGreaterThan(15);
  });

  it("grades mid-size gaps as slight", () => {
    const result = evaluateTrade(side(1, [5000]), side(2, [5500]), { a: "A", b: "B" });
    expect(result.verdict).toContain("Slightly favors");
    expect(result.favors).toBe("A");
  });
});
