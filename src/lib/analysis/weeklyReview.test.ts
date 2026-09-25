import { describe, expect, it } from "vitest";
import { CanonicalPlayer } from "../players/canonical";
import { SleeperLeagueUser, SleeperMatchup, SleeperRoster } from "../sleeper/types";
import { buildImagePrompt, buildTextRecap, summarizeWeek } from "./weeklyReview";

function player(id: string, position: string, value = 1000): CanonicalPlayer {
  return {
    sleeperId: id,
    name: `Player ${id}`,
    position,
    team: "KC",
    age: 25,
    yearsExp: 3,
    injuryStatus: null,
    values: { fcDynastySf: { value, overallRank: 1, positionRank: 1, trend30Day: 0 } },
  };
}

const players: Record<string, CanonicalPlayer> = {
  a1: player("a1", "RB"),
  a2: player("a2", "RB"),
  b1: player("b1", "RB", 9000), // star who flops -> dud
  b2: player("b2", "RB"),
  c1: player("c1", "RB"),
  c2: player("c2", "RB"),
  d1: player("d1", "RB"),
  d2: player("d2", "RB"),
};

const roster = (id: number, ids: string[], wins: number): SleeperRoster => ({
  roster_id: id,
  owner_id: `u${id}`,
  co_owners: null,
  players: ids,
  starters: [ids[0]],
  reserve: [],
  taxi: [],
  settings: { wins, losses: 3 - wins, ties: 0, fpts: 0 },
});

const rosters = [
  roster(1, ["a1", "a2"], 3),
  roster(2, ["b1", "b2"], 0),
  roster(3, ["c1", "c2"], 2),
  roster(4, ["d1", "d2"], 1),
];
const users: SleeperLeagueUser[] = [
  { user_id: "u1", display_name: "one", avatar: null, metadata: { team_name: "Zebras" } },
  { user_id: "u2", display_name: "two", avatar: null, metadata: { team_name: "Aardvarks" } },
  { user_id: "u3", display_name: "three", avatar: null, metadata: { team_name: "Moose" } },
  { user_id: "u4", display_name: "four", avatar: null, metadata: { team_name: "Hawks" } },
];

const matchup = (
  rosterId: number,
  matchupId: number | null,
  starter: string,
  bench: string,
  starterPts: number,
  benchPts: number
): SleeperMatchup => ({
  roster_id: rosterId,
  matchup_id: matchupId,
  points: starterPts,
  starters: [starter],
  players: [starter, bench],
  players_points: { [starter]: starterPts, [bench]: benchPts },
  starters_points: [starterPts],
});

const matchups = [
  // Blowout: Zebras 60 vs Aardvarks 2 (Aardvarks' star b1 duds).
  matchup(1, 1, "a1", "a2", 60, 5),
  matchup(2, 1, "b1", "b2", 2, 10),
  // Close + malpractice: Moose 20.5 beats Hawks 20, but Hawks benched 25.
  matchup(3, 2, "c1", "c2", 20.5, 1),
  matchup(4, 2, "d1", "d2", 20, 25),
  // Unpaired (bye) rows are ignored.
  matchup(5, null, "x", "y", 0, 0),
];

const summary = summarizeWeek({
  leagueName: "The Real Deal",
  week: 3,
  matchups,
  rosters,
  users,
  players,
  rosterPositions: ["RB", "BN"],
  valueOf: (p) => p.values.fcDynastySf?.value ?? 0,
  includeRecords: true,
});

describe("summarizeWeek", () => {
  it("pairs matchups and orders winner/loser", () => {
    expect(summary.matchups).toHaveLength(2);
    expect(summary.matchups[0].winner.teamName).toBe("Zebras");
    expect(summary.matchups[0].margin).toBe(58);
  });

  it("finds the blowout and the nail-biter", () => {
    expect(summary.blowout?.loser.teamName).toBe("Aardvarks");
    expect(summary.nailBiter?.margin).toBe(0.5);
  });

  it("computes bench points from actual player points and flags malpractice", () => {
    const hawks = summary.matchups[1].loser;
    expect(hawks.teamName).toBe("Hawks");
    expect(hawks.optimalPoints).toBe(25);
    expect(hawks.benchLeft).toBe(5);
    expect(summary.matchups[1].malpractice).toBe(true);
    expect(summary.matchups[0].malpractice).toBe(false);
    // Aardvarks left 8 (10 - 2), the week's biggest blunder.
    expect(summary.benchBlunder?.teamName).toBe("Aardvarks");
  });

  it("names top dog, basement, MVP, and dud", () => {
    expect(summary.topDog?.teamName).toBe("Zebras");
    expect(summary.basement?.teamName).toBe("Aardvarks");
    expect(summary.mvp?.playerId).toBe("a1");
    expect(summary.dud?.playerId).toBe("b1");
  });

  it("lists mascots alphabetically for the attach order", () => {
    expect(summary.attachOrder).toEqual(["Aardvarks", "Hawks", "Moose", "Zebras"]);
  });

  it("returns an empty week when nothing has been scored", () => {
    const empty = summarizeWeek({
      leagueName: "L",
      week: 9,
      matchups: matchups.map((m) => ({ ...m, points: 0 })),
      rosters,
      users,
      players,
      rosterPositions: ["RB", "BN"],
      valueOf: () => 0,
      includeRecords: false,
    });
    expect(empty.matchups).toEqual([]);
    expect(empty.topDog).toBeNull();
  });
});

describe("buildImagePrompt", () => {
  const prompt = buildImagePrompt(summary);

  it("lists every mascot in attach order", () => {
    expect(prompt).toContain("1. Aardvarks\n2. Hawks\n3. Moose\n4. Zebras");
  });

  it("includes exact scores and records", () => {
    expect(prompt).toContain("Zebras 60.00 def. Aardvarks 2.00 (now 3-0 vs 0-3)");
    expect(prompt).toContain("Moose 20.50 def. Hawks 20.00");
  });

  it("includes the award badges", () => {
    expect(prompt).toContain("BLOWOUT OF THE WEEK: Zebras over Aardvarks by 58.00");
    expect(prompt).toContain("COACHING MALPRACTICE: Hawks' best lineup (25.00)");
    expect(prompt).toContain("MVP: Player a1");
    expect(prompt).toContain("DUD: Player b1");
  });

  it("uses possessive mascot phrasing without doubled articles", () => {
    expect(prompt).toMatch(/Zebras' mascot/);
    expect(prompt).not.toMatch(/\bthe The\b/);
  });

  it("keeps real players out of the artwork", () => {
    expect(prompt).toContain("do not draw real people");
  });

  it("is deterministic for the same week", () => {
    expect(buildImagePrompt(summary)).toEqual(prompt);
  });
});

describe("team top scorers", () => {
  it("records each team's best starter", () => {
    expect(summary.matchups[0].winner.topScorer).toEqual({ name: "Player a1", points: 60 });
    expect(summary.matchups[1].loser.topScorer).toEqual({ name: "Player d1", points: 20 });
  });
});

describe("buildTextRecap", () => {
  const chat = buildTextRecap(summary, "chat");
  const newsletter = buildTextRecap(summary, "newsletter");

  it("chat: one line per matchup plus awards, short enough for league chat", () => {
    expect(chat.split("\n")[0]).toBe("🏈 THE REAL DEAL — WEEK 3 RECAP");
    expect(chat).toContain("💥 Zebras 60.00 def. Aardvarks 2.00 — ");
    expect(chat).toContain("🤡 Moose 20.50 def. Hawks 20.00 — ");
    expect(chat).toContain("👑 Top dog: Zebras (60.00)");
    expect(chat).toContain("🧊 Dud: Player b1");
    expect(chat.split("\n").length).toBeLessThanOrEqual(15);
  });

  it("chat reuses the image prompt's caption for each matchup", () => {
    const caption = chat.split("\n")[1].split(" — ")[1];
    expect(buildImagePrompt(summary)).toContain(`Caption: "${caption}"`);
  });

  it("newsletter: sections, every team, top scorers, and the malpractice callout", () => {
    for (const h of ["THE REAL DEAL — WEEK 3 REVIEW", "THE GAMES", "THE SCOREBOARD", "AWARDS"]) {
      expect(newsletter).toContain(h);
    }
    for (const t of ["Zebras", "Aardvarks", "Moose", "Hawks"]) expect(newsletter).toContain(t);
    expect(newsletter).toContain("Player a1 led Zebras with 60.00");
    expect(newsletter).toContain("Hawks left 5.00 points on the bench — enough to win.");
    expect(newsletter).toContain("Coaching malpractice: Hawks' best lineup (25.00) beats Moose");
    expect(newsletter).toContain("1. Zebras — 60.00 (3-0)");
  });

  it("calls out a losing team's star who outscored the winner's best", () => {
    const flipped = {
      ...summary,
      matchups: [
        {
          ...summary.matchups[1],
          winner: { ...summary.matchups[1].winner, topScorer: { name: "Winner Guy", points: 12 } },
          loser: { ...summary.matchups[1].loser, topScorer: { name: "Loser Star", points: 19 } },
        },
      ],
    };
    expect(buildTextRecap(flipped, "newsletter")).toContain(
      "Loser Star dropped 19.00 for Hawks, more than anyone on Moose, and it still wasn't enough."
    );
  });

  it("is deterministic and empty for unplayed weeks", () => {
    expect(buildTextRecap(summary, "chat")).toEqual(chat);
    expect(buildTextRecap(summary, "newsletter")).toEqual(newsletter);
    expect(buildTextRecap({ ...summary, matchups: [] }, "chat")).toBe("");
  });
});
