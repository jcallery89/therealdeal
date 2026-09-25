import { describe, expect, it } from "vitest";
import { LEAGUES } from "../config";
import { CanonicalPlayer } from "../players/canonical";
import { playerValue, scaledPickValue, ValueContext } from "./engine";

const keeper = LEAGUES.find((l) => !l.isDynasty)!;
const dynasty = LEAGUES.find((l) => l.isDynasty)!;
const ctx: ValueContext = { fcDynMax: 10000, fcRedMax: 9000, ktcSfMax: 9000, ktcOneQbMax: 8000 };

function player(position: string, fc: number, ktc: number, redraft = 0): CanonicalPlayer {
  return {
    sleeperId: "1",
    name: "P",
    position,
    team: "FA",
    age: 25,
    yearsExp: 3,
    injuryStatus: null,
    values: {
      fcDynastySf: { value: fc, overallRank: 1, positionRank: 1, trend30Day: 0 },
      fcRedraft: { value: redraft, overallRank: 1, positionRank: 1, trend30Day: 0 },
      ktc: { sf: ktc, oneQb: 0 },
    },
  };
}

describe("playerValue", () => {
  it("blends FC and KTC after normalizing to share-of-top", () => {
    // FC 5000/10000 = 0.5, KTC 4500/9000 = 0.5 -> 5000 on the 10k scale.
    expect(playerValue(player("WR", 5000, 4500), dynasty, "blend", ctx)).toBe(5000);
  });

  it("falls back to the available source when one is missing", () => {
    expect(playerValue(player("WR", 5000, 0), dynasty, "blend", ctx)).toBe(5000);
  });

  it("applies the TE premium", () => {
    expect(playerValue(player("TE", 4000, 0), dynasty, "fc", ctx)).toBe(4200);
  });

  it("uses redraft values in the keeper league", () => {
    expect(playerValue(player("RB", 9000, 9000, 3000), keeper, "blend", ctx)).toBe(3000);
  });
});

describe("scaledPickValue", () => {
  it("keeps raw FC values in FC mode and in the keeper league", () => {
    expect(scaledPickValue(5000, dynasty, "fc", ctx)).toBe(5000);
    expect(scaledPickValue(5000, keeper, "blend", ctx)).toBe(5000);
  });

  it("maps picks onto the blend and KTC scales", () => {
    const wide = { ...ctx, fcDynMax: 12500 };
    expect(scaledPickValue(5000, dynasty, "blend", wide)).toBe(4000); // 5000 * 10000/12500
    expect(scaledPickValue(5000, dynasty, "ktc", ctx)).toBe(4500); // 5000 * 9000/10000
  });

  it("uses the reference scale when FantasyCalc is unavailable", () => {
    const noFc = { ...ctx, fcDynMax: 1 };
    expect(scaledPickValue(5250, dynasty, "blend", noFc)).toBe(5000); // 5250 * 10000/10500
  });
});
