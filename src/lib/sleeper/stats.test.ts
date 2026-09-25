import { describe, expect, it } from "vitest";
import { normalizeStatLines } from "./stats";

describe("normalizeStatLines", () => {
  it("accepts an array of {player_id, stats} rows", () => {
    const out = normalizeStatLines([
      { player_id: "4046", stats: { pts_ppr: 21.4, rec: 0 } },
      { player_id: 17, stats: { pts_ppr: 9 } },
    ]);
    expect(out).toEqual({ "4046": { pts_ppr: 21.4, rec: 0 }, "17": { pts_ppr: 9 } });
  });

  it("accepts an object map keyed by player id", () => {
    expect(normalizeStatLines({ "4046": { pts_ppr: 21.4, gp: 3 } })).toEqual({
      "4046": { pts_ppr: 21.4, gp: 3 },
    });
  });

  it("drops non-numeric fields and malformed rows", () => {
    const out = normalizeStatLines([
      { player_id: "1", stats: { pts_ppr: 5, team: "KC", bad: NaN } },
      { stats: { pts_ppr: 1 } },
      null,
      "junk",
    ]);
    expect(out).toEqual({ "1": { pts_ppr: 5 } });
  });

  it("returns an empty map for junk input", () => {
    expect(normalizeStatLines(null)).toEqual({});
    expect(normalizeStatLines("oops")).toEqual({});
    expect(normalizeStatLines(42)).toEqual({});
  });
});
