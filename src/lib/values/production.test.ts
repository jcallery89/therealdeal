import { describe, expect, it } from "vitest";
import { CanonicalPlayer } from "../players/canonical";
import { computeProductionValues } from "./production";

function player(id: string, position: string): CanonicalPlayer {
  return { sleeperId: id, name: id, position, team: "KC", age: 25, yearsExp: 3, injuryStatus: null, values: {} };
}

const players = {
  rb1: player("rb1", "RB"),
  rb2: player("rb2", "RB"),
  rb3: player("rb3", "RB"),
  te1: player("te1", "TE"),
  te2: player("te2", "TE"),
  k1: player("k1", "K"),
};

// 1 team, lineup RB + TE: replacement = 2nd-best RB / 2nd-best TE.
const base = {
  players,
  teams: 1,
  rosterPositions: ["RB", "TE"],
  scoring: { rec: 1, bonus_rec_te: 0.5 },
};

describe("computeProductionValues", () => {
  it("values actual PPG above the first non-starter at each position", () => {
    const out = computeProductionValues({
      ...base,
      seasonStats: {
        rb1: { gp: 4, pts_ppr: 80 }, // 20 ppg
        rb2: { gp: 4, pts_ppr: 48 }, // 12 ppg -> replacement
        rb3: { gp: 4, pts_ppr: 20 },
        te1: { gp: 4, pts_ppr: 40, rec: 20 }, // 10 + 2.5 TEP = 12.5 ppg
        te2: { gp: 4, pts_ppr: 20, rec: 8 }, // 5 + 1 = 6 ppg
        k1: { gp: 4, pts_ppr: 40 },
      },
      seasonProjections: {},
    });
    expect(out).toEqual({ rb1: 8, te1: 6.5 });
  });

  it("leans on projections early and on actual results later", () => {
    const early = computeProductionValues({
      ...base,
      seasonStats: { rb1: { gp: 1, pts_ppr: 30 }, rb2: { gp: 1, pts_ppr: 10 } },
      seasonProjections: { rb1: { gp: 17, pts_ppr: 170 }, rb2: { gp: 17, pts_ppr: 170 } },
    });
    // rb1 blend = 0.2*30 + 0.8*10 = 14; rb2 = 0.2*10 + 0.8*10 = 10.
    expect(early.rb1).toBe(4);

    const later = computeProductionValues({
      ...base,
      seasonStats: { rb1: { gp: 12, pts_ppr: 360 }, rb2: { gp: 12, pts_ppr: 120 } },
      seasonProjections: { rb1: { gp: 17, pts_ppr: 170 }, rb2: { gp: 17, pts_ppr: 170 } },
    });
    // w = 0.75: rb1 = 0.75*30 + 0.25*10 = 25; rb2 = 10.
    expect(later.rb1).toBe(15);
  });

  it("returns nothing without stats or projections", () => {
    expect(computeProductionValues({ ...base, seasonStats: {}, seasonProjections: {} })).toEqual({});
  });
});
