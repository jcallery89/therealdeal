import { fetchWithFixture, Sourced } from "../datasource";
import { TTL } from "../config";
import { FcEntry, FcFormat } from "./types";

const FORMATS: Record<FcFormat, { params: string; fixture: string }> = {
  dynasty_sf: {
    params: "isDynasty=true&numQbs=2&numTeams=10&ppr=1&includeAdp=false",
    fixture: "fantasycalc-dynasty-sf.json",
  },
  /** Long-term 1QB values — keeper horizon for The Real Deal. */
  dynasty_1qb: {
    params: "isDynasty=true&numQbs=1&numTeams=10&ppr=1&includeAdp=false",
    fixture: "fantasycalc-dynasty-1qb.json",
  },
  redraft_1qb: {
    params: "isDynasty=false&numQbs=1&numTeams=10&ppr=1&includeAdp=false",
    fixture: "fantasycalc-redraft.json",
  },
};

/**
 * FantasyCalc's free values API. Market values derived from real league
 * trades; entries carry sleeperId for a direct join, and include draft picks
 * as player-shaped entries (sleeperId null).
 */
export function getFcValues(format: FcFormat): Promise<Sourced<FcEntry[]>> {
  const { params, fixture } = FORMATS[format];
  return fetchWithFixture({
    key: `fantasycalc:${format}`,
    url: `https://api.fantasycalc.com/values/current?${params}`,
    fixture,
    ttlMs: TTL.fantasycalc,
  });
}
