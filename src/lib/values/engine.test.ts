import { describe, expect, it } from "vitest";
import { LEAGUES } from "../config";
import { CanonicalPlayer } from "../players/canonical";
import { DraftPick } from "./picks";
import {
  computeValueContext,
  draftPickValue,
  playerValue,
  sourceAvailable,
  ValueContext,
} from "./engine";

const keeper = LEAGUES.find((l) => !l.isDynasty)!;
const dynasty = LEAGUES.find((l) => l.isDynasty)!;

function player(id: string, position: string, values: CanonicalPlayer["values"]): CanonicalPlayer {
  return { sleeperId: id, name: id, position, team: "FA", age: 25, yearsExp: 3, injuryStatus: null, values };
}
const fc = (value: number) => ({ value, overallRank: 1, positionRank: 1, trend30Day: 0 });

// Tops: FC SF 10000, DP SF 8000, DD 9000, DTV SF 9500; FC 1QB 5000, DP 1QB 4000, DTV 1QB 3000; FC redraft 6000.
const star = player("star", "QB", {
  fcDynastySf: fc(10000),
  dp: { sf: 8000, oneQb: 4000 },
  dd: { value: 9000 },
  dtv: { sf: 9500, oneQb: 3000 },
  fcDynasty1qb: fc(5000),
  fcRedraft: fc(6000),
});
const mid = player("mid", "WR", {
  fcDynastySf: fc(5000), // 0.5 of FC top
  dp: { sf: 2000, oneQb: 1000 }, // 0.25 of DP top
  fcRedraft: fc(3000),
});
const te = player("te", "TE", { fcDynastySf: fc(4000) });
const players = { star, mid, te };
const ctx: ValueContext = computeValueContext(players, { mid: 4, star: 8 });

describe("playerValue", () => {
  it("normalizes each source to share of its top player (0-10,000)", () => {
    expect(playerValue(mid, dynasty, { horizon: "dynasty", source: "fc" }, ctx)).toBe(5000);
    expect(playerValue(mid, dynasty, { horizon: "dynasty", source: "dp" }, ctx)).toBe(2500);
  });

  it("consensus averages only sources that list the player", () => {
    // FC 5000 + DP 2500 (DD and DTV don't list him) -> 3750.
    expect(playerValue(mid, dynasty, { horizon: "dynasty", source: "consensus" }, ctx)).toBe(3750);
    // Star is everyone's #1.
    expect(playerValue(star, dynasty, { horizon: "dynasty", source: "consensus" }, ctx)).toBe(10000);
  });

  it("keeps horizons separate in the keeper league", () => {
    // This season: FC redraft 3000/6000 = 5000; projections 4/8 = 5000.
    expect(playerValue(mid, keeper, { horizon: "season", source: "consensus" }, ctx)).toBe(5000);
    expect(playerValue(mid, keeper, { horizon: "season", source: "proj" }, ctx)).toBe(5000);
    // Keeper: DP 1QB 1000/4000 = 2500 (no FC 1QB or DTV entry).
    expect(playerValue(mid, keeper, { horizon: "keeper", source: "consensus" }, ctx)).toBe(2500);
  });

  it("applies the TE premium", () => {
    expect(playerValue(te, dynasty, { horizon: "dynasty", source: "fc" }, ctx)).toBe(4200);
  });
});

describe("injury outlook", () => {
  const hurt = {
    ...mid,
    injuryStatus: "IR",
    outlook: { status: "season" as const, label: "Out for season", reason: null, missShare: 1, longTermFactor: 0.8, fcLongTermFactor: 0.9 },
  };
  it("zeroes this-season value and discounts long-term value per source", () => {
    expect(playerValue(hurt, keeper, { horizon: "season", source: "consensus" }, ctx)).toBe(0);
    expect(playerValue(hurt, dynasty, { horizon: "dynasty", source: "fc" }, ctx)).toBe(4500); // 5000 x 0.9
    expect(playerValue(hurt, dynasty, { horizon: "dynasty", source: "dp" }, ctx)).toBe(2000); // 2500 x 0.8
  });
});

describe("sourceAvailable", () => {
  it("reports which sources have data for a horizon", () => {
    expect(sourceAvailable("dynasty", "dd", ctx)).toBe(true);
    expect(sourceAvailable("keeper", "dtv", ctx)).toBe(true);
    // Dynasty Dealer has no 1QB values, so it sits out the keeper horizon.
    expect(sourceAvailable("keeper", "dd", ctx)).toBe(false);
    expect(sourceAvailable("season", "proj", ctx)).toBe(true);
    const noProj = computeValueContext(players, {});
    expect(sourceAvailable("season", "proj", noProj)).toBe(false);
    expect(sourceAvailable("season", "consensus", noProj)).toBe(true); // FC still there
  });
});

describe("draftPickValue", () => {
  const pick: DraftPick = { season: "2027", round: 1, originalRosterId: 1, ownerRosterId: 1, bucket: "early" };
  const tables = {
    fc: { values: { "2027-1-early": 5000 }, source: "fantasycalc" as const },
    dp: { values: { "2027-1-early": 2000 }, source: "dynastyprocess" as const },
  };

  it("puts picks on the same scale as players and averages providers", () => {
    const m = (source: "fc" | "dp" | "consensus" | "dd") => ({ horizon: "dynasty" as const, source });
    expect(draftPickValue(pick, tables, "2026", dynasty, m("fc"), ctx)).toBe(5000); // 5000/10000
    expect(draftPickValue(pick, tables, "2026", dynasty, m("dp"), ctx)).toBe(2500); // 2000/8000
    expect(draftPickValue(pick, tables, "2026", dynasty, m("consensus"), ctx)).toBe(3750);
    expect(draftPickValue(pick, tables, "2026", dynasty, m("dd"), ctx)).toBe(5000); // FC stands in
    const withDd = { ...tables, dd: { values: { "2027-1-early": 4500 }, source: "dynastydealer" as const } };
    expect(draftPickValue(pick, withDd, "2026", dynasty, m("dd"), ctx)).toBe(5000); // 4500/9000
    expect(draftPickValue(pick, withDd, "2026", dynasty, m("consensus"), ctx)).toBe(4167); // (5000+2500+5000)/3
  });

  it("falls back to the static curve when no provider has picks", () => {
    const none = { fc: { values: {}, source: "static" as const }, dp: { values: {}, source: "static" as const } };
    const v = draftPickValue(pick, none, "2026", dynasty, { horizon: "dynasty", source: "consensus" }, ctx);
    expect(v).toBe(Math.round((6500 * 0.9 / 10500) * 10000)); // early 1st, 1 year out
  });

  it("uses the static curve for the keeper league's full draft", () => {
    const v = draftPickValue(pick, tables, "2026", keeper, { horizon: "season", source: "consensus" }, ctx);
    expect(v).toBe(Math.round((6500 * 0.9 / 10500) * 10000));
  });
});
