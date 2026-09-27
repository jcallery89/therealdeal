import { describe, expect, it } from "vitest";
import type { ScheduledGame } from "../nflverse/client";
import { kickoffLabel, kickoffTime, teamGame, teamsPlaying } from "./schedule";

const game = (week: number, away: string, home: string, spread: number | null, total: number | null): ScheduledGame => ({
  gameId: `${week}-${away}-${home}`,
  week,
  kickoff: "2026-10-04T13:00",
  away,
  home,
  awayScore: null,
  homeScore: null,
  spread,
  total,
});

describe("kickoffTime", () => {
  it("reads Eastern time with daylight saving", () => {
    expect(new Date(kickoffTime("2026-10-04T13:00")).toISOString()).toBe("2026-10-04T17:00:00.000Z");
    // DST ends Nov 1 2026.
    expect(new Date(kickoffTime("2026-11-08T13:00")).toISOString()).toBe("2026-11-08T18:00:00.000Z");
  });
  it("labels kickoffs", () => {
    expect(kickoffLabel("2026-10-01T20:15")).toBe("Thu 8:15 PM ET");
  });
});

describe("teamGame", () => {
  const schedule = [game(4, "TEN", "BAL", 10.5, 44.5), game(4, "KC", "LV", null, null)];
  it("derives implied team totals from spread and total", () => {
    expect(teamGame(schedule, 4, "BAL")).toMatchObject({ opponent: "TEN", home: true, implied: 27.5 });
    expect(teamGame(schedule, 4, "TEN")).toMatchObject({ opponent: "BAL", home: false, implied: 17 });
  });
  it("handles missing lines and byes", () => {
    expect(teamGame(schedule, 4, "KC")?.implied).toBeNull();
    expect(teamGame(schedule, 4, "DAL")).toBeNull();
    expect(teamsPlaying(schedule, 4).has("DAL")).toBe(false);
  });
});
