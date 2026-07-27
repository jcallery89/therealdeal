import { describe, expect, it } from "vitest";
import { CanonicalPlayer } from "../players/canonical";
import { lineupAdvice, optimalLineup, scoreProjection } from "./lineup";

function makePlayer(id: string, position: string): CanonicalPlayer {
  return {
    sleeperId: id,
    name: `Player ${id}`,
    position,
    team: "FA",
    age: 25,
    yearsExp: 3,
    injuryStatus: null,
    values: {},
  };
}

function pool(specs: [string, string][]): Record<string, CanonicalPlayer> {
  const out: Record<string, CanonicalPlayer> = {};
  for (const [id, pos] of specs) out[id] = makePlayer(id, pos);
  return out;
}

describe("scoreProjection", () => {
  it("scores granular stat lines with league settings", () => {
    const pts = scoreProjection(
      { pass_yd: 250, pass_td: 2, rec: 0 },
      { pass_yd: 0.04, pass_td: 6, rec: 1, bonus_rec_te: 0.5 },
      "QB"
    );
    expect(pts).toBeCloseTo(250 * 0.04 + 2 * 6);
  });

  it("falls back to pts_ppr and still applies TE premium", () => {
    const te = scoreProjection({ pts_ppr: 10, rec: 4 }, { rec: 1, bonus_rec_te: 0.5 }, "TE");
    expect(te).toBeCloseTo(12);
    const wr = scoreProjection({ pts_ppr: 10, rec: 4 }, { rec: 1, bonus_rec_te: 0.5 }, "WR");
    expect(wr).toBeCloseTo(10);
  });
});

describe("optimalLineup", () => {
  it("fills fixed slots then flexes with the best remaining players", () => {
    const players = pool([
      ["qb1", "QB"],
      ["qb2", "QB"],
      ["rb1", "RB"],
      ["rb2", "RB"],
      ["wr1", "WR"],
      ["te1", "TE"],
    ]);
    const proj = { qb1: 22, qb2: 18, rb1: 15, rb2: 9, wr1: 14, te1: 11 };
    const lineup = optimalLineup(
      Object.keys(players),
      ["QB", "RB", "WR", "FLEX", "SUPER_FLEX"],
      players,
      proj
    );
    const byexpect = Object.fromEntries(lineup.map((s, i) => [`${s.slot}${i}`, s.playerId]));
    expect(byexpect["QB0"]).toBe("qb1");
    expect(byexpect["RB1"]).toBe("rb1");
    expect(byexpect["WR2"]).toBe("wr1");
    // FLEX takes best remaining skill player (te1 11 > rb2 9);
    // SUPER_FLEX takes the second QB (18) rather than rb2 (9).
    expect(byexpect["FLEX3"]).toBe("te1");
    expect(byexpect["SUPER_FLEX4"]).toBe("qb2");
  });

  it("leaves unfillable slots empty", () => {
    const players = pool([["wr1", "WR"]]);
    const lineup = optimalLineup(["wr1"], ["QB", "WR"], players, { wr1: 10 });
    expect(lineup[0].playerId).toBeNull();
    expect(lineup[1].playerId).toBe("wr1");
  });
});

describe("lineupAdvice", () => {
  it("recommends promoting a higher-projected bench player", () => {
    const players = pool([
      ["rb1", "RB"],
      ["rb2", "RB"],
      ["rbBench", "RB"],
    ]);
    const proj = { rb1: 15, rb2: 5, rbBench: 12 };
    const advice = lineupAdvice(
      ["rb1", "rb2"],
      ["rb1", "rb2", "rbBench"],
      ["RB", "RB"],
      players,
      proj
    );
    expect(advice.promote).toEqual(["rbBench"]);
    expect(advice.sit).toEqual(["rb2"]);
    expect(advice.optimalTotal).toBeCloseTo(27);
    expect(advice.currentTotal).toBeCloseTo(20);
  });
});
