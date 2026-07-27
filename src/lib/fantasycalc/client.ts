import { fetchWithFixture, Sourced } from "../datasource";
import { TTL } from "../config";
import { FcEntry, FcFormat } from "./types";

/**
 * FantasyCalc's free values API. Market values derived from real league
 * trades; entries carry sleeperId for a direct join, and include draft picks
 * as player-shaped entries (sleeperId null).
 */
export function getFcValues(format: FcFormat): Promise<Sourced<FcEntry[]>> {
  const params =
    format === "dynasty_sf"
      ? "isDynasty=true&numQbs=2&numTeams=10&ppr=1&includeAdp=false"
      : "isDynasty=false&numQbs=1&numTeams=10&ppr=1&includeAdp=false";
  return fetchWithFixture({
    key: `fantasycalc:${format}`,
    url: `https://api.fantasycalc.com/values/current?${params}`,
    fixture:
      format === "dynasty_sf"
        ? "fantasycalc-dynasty-sf.json"
        : "fantasycalc-redraft.json",
    ttlMs: TTL.fantasycalc,
  });
}
