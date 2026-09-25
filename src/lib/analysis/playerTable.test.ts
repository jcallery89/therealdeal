import { describe, expect, it } from "vitest";
import { LEAGUES } from "../config";
import { CanonicalPlayer } from "../players/canonical";
import { SleeperRoster } from "../sleeper/types";
import { buildPlayerRows, sortRows } from "./playerTable";

const dynasty = LEAGUES.find((l) => l.isDynasty)!;

function player(id: string, position: string, value: number): CanonicalPlayer {
  return {
    sleeperId: id,
    name: `P-${id}`,
    position,
    team: "KC",
    age: 25,
    yearsExp: 2,
    injuryStatus: null,
    values: { fcDynastySf: { value, overallRank: 1, positionRank: 1, trend30Day: 10 } },
  };
}

const roster: SleeperRoster = {
  roster_id: 7,
  owner_id: "u",
  co_owners: null,
  players: ["rostered"],
  starters: [],
  reserve: [],
  taxi: [],
  settings: { wins: 0, losses: 0, ties: 0, fpts: 0 },
};

const players = {
  rostered: player("rostered", "WR", 5000),
  fa: player("fa", "WR", 3000),
  te: player("te", "TE", 2000),
  nobody: player("nobody", "WR", 0),
  kicker: player("kicker", "K", 0),
};

const rows = buildPlayerRows({
  players,
  rosters: [roster],
  valueOf: (p) => p.values.fcDynastySf?.value ?? 0,
  league: dynasty,
  scoring: { rec: 1, bonus_rec_te: 0.5 },
  seasonStats: {
    rostered: { gp: 4, pts_ppr: 60 },
    te: { gp: 2, pts_ppr: 20, rec: 8 },
    kicker: { gp: 3, pts_ppr: 24 },
  },
  projections: { fa: { pts_ppr: 11.5 } },
});
const byId = Object.fromEntries(rows.map((r) => [r.id, r]));

describe("buildPlayerRows", () => {
  it("keeps relevant players and drops ones with no value, stats, or owner", () => {
    expect(Object.keys(byId).sort()).toEqual(["fa", "kicker", "rostered", "te"]);
  });

  it("marks ownership and free agents", () => {
    expect(byId.rostered.ownerRosterId).toBe(7);
    expect(byId.fa.ownerRosterId).toBeNull();
  });

  it("scores season stats with league scoring (TE premium) and computes PPG", () => {
    expect(byId.rostered.seasonPts).toBe(60);
    expect(byId.rostered.ppg).toBe(15);
    expect(byId.te.seasonPts).toBe(24); // 20 + 8 rec * 0.5 TEP
    expect(byId.te.ppg).toBe(12);
    expect(byId.fa.proj).toBe(11.5);
    expect(byId.fa.seasonPts).toBeNull();
  });

  it("ranks valued players within their position", () => {
    expect(byId.rostered.posRank).toBe(1);
    expect(byId.fa.posRank).toBe(2);
    expect(byId.te.posRank).toBe(1);
    expect(byId.kicker.posRank).toBeNull();
  });
});

describe("sortRows", () => {
  it("sorts by a numeric column with missing values last in both directions", () => {
    expect(sortRows(rows, "ppg", "desc").map((r) => r.id)).toEqual(["rostered", "te", "kicker", "fa"]);
    expect(sortRows(rows, "ppg", "asc").map((r) => r.id)).toEqual(["kicker", "te", "rostered", "fa"]);
  });
});
