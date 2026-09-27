import { describe, expect, it } from "vitest";
import { parseDdValues } from "./client";

// Trimmed from a real /api/player-values response.
const RAW = {
  source: "tidb",
  players: [
    { sleeper_id: "9221", name: "Jahmyr Gibbs", position: "RB", team: "DET", base_value: 9954, current_value: 9860, votes: 8 },
    { sleeper_id: "4984", name: "Josh Allen", position: "QB", team: "BUF", base_value: 10000, current_value: 9821, votes: 7 },
    { sleeper_id: "pick_2027_1_early", name: "2027 Round 1 Early", position: "PICK", team: "NFL", base_value: 7648, current_value: 7648 },
    { sleeper_id: "pick_2028_2_late", name: "2028 Round 2 Late", position: "PICK", team: "NFL", base_value: 2100, current_value: 2100 },
    { sleeper_id: null, name: "No Id", position: "WR", current_value: 10 },
  ],
  total: 5,
  scoringSettings: { isSuperflex: false, isTePremium: false },
};

describe("parseDdValues", () => {
  it("keeps players by Sleeper id using the vote-adjusted value", () => {
    const dd = parseDdValues(RAW);
    expect(dd.players).toEqual([
      { sleeperId: "9221", name: "Jahmyr Gibbs", position: "RB", team: "DET", value: 9860 },
      { sleeperId: "4984", name: "Josh Allen", position: "QB", team: "BUF", value: 9821 },
    ]);
  });
  it("turns pick rows into names the pick parser understands", () => {
    expect(parseDdValues(RAW).picks).toEqual([
      { name: "2027 Early 1st", value: 7648 },
      { name: "2028 Late 2nd", value: 2100 },
    ]);
  });
  it("rejects an unexpected payload", () => {
    expect(() => parseDdValues({ nope: [] })).toThrow();
  });
});
