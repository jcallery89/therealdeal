import { describe, expect, it } from "vitest";
import { FcEntry } from "../fantasycalc/types";
import {
  bucketForSlot,
  computePickInventory,
  isPickName,
  parseFcPicks,
  pickRounds,
  pickSeasons,
  pickValue,
} from "./picks";
import { SleeperDraft, SleeperRoster, SleeperTradedPick } from "../sleeper/types";

const fcPick = (name: string, value: number): FcEntry => ({
  player: { id: 1, name, position: "PICK", sleeperId: null, maybeAge: null, maybeTeam: null },
  value,
  overallRank: 0,
  positionRank: null,
  trend30Day: 0,
  redraftValue: null,
});

describe("pick parsing", () => {
  it("recognizes pick-shaped names", () => {
    expect(isPickName("2026 Early 1st")).toBe(true);
    expect(isPickName("2027 2nd")).toBe(true);
    expect(isPickName("2027 Round 3")).toBe(true);
    expect(isPickName("Ja'Marr Chase")).toBe(false);
    expect(isPickName("2026 Team Slot")).toBe(false);
  });

  it("parses FantasyCalc pick entries with and without buckets", () => {
    const table = parseFcPicks([fcPick("2026 Early 1st", 6500), fcPick("2027 1st", 4500)]);
    expect(table.source).toBe("fantasycalc");
    expect(pickValue(table, "2026", 1, "early", "2025")).toBe(6500);
    expect(pickValue(table, "2027", 1, null, "2025")).toBe(4500);
  });

  it("falls back to the static curve when FC gives nothing", () => {
    const table = parseFcPicks([]);
    expect(table.source).toBe("static");
    const now = pickValue(table, "2026", 1, "mid", "2025");
    const later = pickValue(table, "2028", 1, "mid", "2025");
    expect(now).toBeGreaterThan(later); // future discount applies
  });
});

const draft = (season: string, status: string, rounds = 4): SleeperDraft => ({
  draft_id: "d1",
  season,
  status,
  draft_order: null,
  settings: { rounds },
});

describe("pickSeasons", () => {
  it("includes the league season while its draft is pending", () => {
    expect(pickSeasons("2026", draft("2026", "pre_draft"))).toEqual(["2026", "2027", "2028", "2029"]);
  });

  it("starts next season once the draft is complete or missing", () => {
    expect(pickSeasons("2026", draft("2026", "complete"))).toEqual(["2027", "2028", "2029"]);
    expect(pickSeasons("2026", null)).toEqual(["2027", "2028", "2029"]);
  });
});

describe("pickRounds", () => {
  it("uses the draft's configured rounds (e.g. a full keeper-league draft)", () => {
    expect(pickRounds(draft("2026", "pre_draft", 16), [])).toBe(16);
  });

  it("never drops a traded pick from a later round", () => {
    const traded: SleeperTradedPick[] = [
      { season: "2027", round: 9, roster_id: 1, owner_id: 2, previous_owner_id: 1 },
    ];
    expect(pickRounds(null, traded)).toBe(9);
  });
});

describe("bucketForSlot", () => {
  it("splits a 10-team draft into terciles", () => {
    expect(bucketForSlot(1, 10)).toBe("early");
    expect(bucketForSlot(4, 10)).toBe("early");
    expect(bucketForSlot(5, 10)).toBe("mid");
    expect(bucketForSlot(10, 10)).toBe("late");
  });
});

describe("computePickInventory", () => {
  const roster = (id: number): SleeperRoster => ({
    roster_id: id,
    owner_id: String(id),
    co_owners: null,
    players: [],
    starters: [],
    reserve: [],
    taxi: [],
    settings: { wins: id, losses: 9 - id, ties: 0, fpts: 1000 },
  });

  it("assigns native picks then applies trades", () => {
    const rosters = [roster(1), roster(2)];
    const traded: SleeperTradedPick[] = [
      { season: "2026", round: 1, roster_id: 2, owner_id: 1, previous_owner_id: 2 },
    ];
    const picks = computePickInventory(rosters, traded, ["2026", "2027", "2028"], 4);
    const mine = picks.filter((p) => p.ownerRosterId === 1);
    // 3 seasons x 4 rounds native + team 2's 2026 1st.
    expect(mine.length).toBe(13);
    const acquired = mine.find((p) => p.originalRosterId === 2);
    expect(acquired).toMatchObject({ season: "2026", round: 1 });
  });

  it("buckets only the next draft's picks from the slot map", () => {
    const rosters = [roster(1), roster(2), roster(3)];
    const slots = new Map([[1, 1], [2, 2], [3, 3]]);
    const picks = computePickInventory(rosters, [], ["2026", "2027"], 1, slots);
    expect(picks.find((p) => p.season === "2026" && p.originalRosterId === 1)?.bucket).toBe("early");
    expect(picks.find((p) => p.season === "2026" && p.originalRosterId === 3)?.bucket).toBe("late");
    expect(picks.find((p) => p.season === "2027" && p.originalRosterId === 1)?.bucket).toBeNull();
  });
});
