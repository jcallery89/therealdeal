import { describe, expect, it } from "vitest";
import { SleeperRoster } from "./sleeper/types";
import { resolveMyRosterId } from "./leagueBundle";

const roster = (id: number, owner: string | null, coOwners: string[] | null = null): SleeperRoster => ({
  roster_id: id,
  owner_id: owner,
  co_owners: coOwners,
  players: [],
  starters: [],
  reserve: [],
  taxi: [],
  settings: { wins: 0, losses: 0, ties: 0, fpts: 0 },
});

const rosters = [roster(1, "a"), roster(2, "b", ["me"]), roster(3, "c")];

describe("resolveMyRosterId", () => {
  it("finds the roster the user owns", () => {
    expect(resolveMyRosterId({ userId: "c" }, rosters, "L")).toBe(3);
  });

  it("finds a co-owned roster", () => {
    expect(resolveMyRosterId({ userId: "me" }, rosters, "L")).toBe(2);
  });

  it("falls back to the mapping saved at setup", () => {
    expect(resolveMyRosterId({ userId: "zzz", rosterIdByLeague: { L: 1 } }, rosters, "L")).toBe(1);
  });

  it("returns null instead of guessing someone else's team", () => {
    expect(resolveMyRosterId({ userId: "zzz" }, rosters, "L")).toBeNull();
    expect(resolveMyRosterId({ userId: "zzz", rosterIdByLeague: { L: 99 } }, rosters, "L")).toBeNull();
    expect(resolveMyRosterId(null, rosters, "L")).toBeNull();
  });
});
