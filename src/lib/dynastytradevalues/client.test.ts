import { describe, expect, it } from "vitest";
import { parseDtvPicks, parseDtvValues } from "./client";

// Trimmed from real /wp-json/dtc/v1/public responses.
const PLAYERS = {
  generated_at: "2026-09-23 14:22:27",
  count: 4,
  players: [
    { rank: 1, name: "Josh Allen", slug: "josh-allen", team: "BUF", position: "QB", value: 10000 },
    { rank: 2, name: "Bijan Robinson", slug: "bijan-robinson", team: "ATL", position: "RB", value: 9890 },
    { rank: 150, name: "LA Rams Defense", slug: "la-rams-defense", team: "LAR", position: "DEF", value: 1990 },
    { rank: 157, name: "Ka'imi Fairbairn", slug: "kaimi-fairbairn", team: "HOU", position: "PK", value: 1807 },
  ],
  format: "sf",
};

describe("parseDtvValues", () => {
  it("keeps skill players and the reported format", () => {
    const dtv = parseDtvValues(PLAYERS);
    expect(dtv.format).toBe("sf");
    expect(dtv.generatedAt).toBe("2026-09-23 14:22:27");
    expect(dtv.players).toEqual([
      { name: "Josh Allen", position: "QB", team: "BUF", value: 10000 },
      { name: "Bijan Robinson", position: "RB", team: "ATL", value: 9890 },
    ]);
  });
  it("rejects an unexpected payload", () => {
    expect(() => parseDtvValues("<html>")).toThrow();
  });
});

describe("parseDtvPicks", () => {
  it("reads slot-named picks", () => {
    expect(
      parseDtvPicks({ count: 1, picks: [{ rank: 1, name: "2027 Pick 1.01", slug: "x", value: 7500 }] })
    ).toEqual([{ name: "2027 Pick 1.01", value: 7500 }]);
  });
});
