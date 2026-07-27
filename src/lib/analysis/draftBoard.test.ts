import { describe, expect, it } from "vitest";
import { SleeperRoster } from "../sleeper/types";
import { draftSlots, formatPick } from "./draftBoard";

const roster = (id: number, wins: number, fpts = 1000): SleeperRoster => ({
  roster_id: id,
  owner_id: `u${id}`,
  co_owners: null,
  players: [],
  starters: [],
  reserve: [],
  taxi: [],
  settings: { wins, losses: 9 - wins, ties: 0, fpts },
});

describe("draftSlots", () => {
  it("uses Sleeper's draft_order when complete", () => {
    const rosters = [roster(1, 8), roster(2, 1)];
    const slots = draftSlots(rosters, { u1: 2, u2: 1 });
    expect(slots.get(1)).toBe(2);
    expect(slots.get(2)).toBe(1);
  });

  it("falls back to inverse standings when order is missing", () => {
    const rosters = [roster(1, 8), roster(2, 1), roster(3, 4)];
    const slots = draftSlots(rosters, null);
    expect(slots.get(2)).toBe(1); // worst record picks first
    expect(slots.get(3)).toBe(2);
    expect(slots.get(1)).toBe(3);
  });

  it("falls back when draft_order only covers some teams", () => {
    const rosters = [roster(1, 8), roster(2, 1)];
    const slots = draftSlots(rosters, { u1: 1 });
    expect(slots.get(2)).toBe(1);
    expect(slots.get(1)).toBe(2);
  });
});

describe("formatPick", () => {
  it("formats round.slot with zero padding", () => {
    expect(formatPick(1, 3)).toBe("1.03");
    expect(formatPick(2, 10)).toBe("2.10");
  });
});
