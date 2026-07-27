import { fetchWithFixture, Sourced } from "../datasource";
import { TTL } from "../config";
import {
  ProjectionEntry,
  SleeperDraft,
  SleeperDraftPick,
  SleeperLeague,
  SleeperLeagueUser,
  SleeperMatchup,
  SleeperRoster,
  SleeperState,
  SleeperTradedPick,
  SleeperUser,
  TrendingEntry,
} from "./types";

const BASE = "https://api.sleeper.app/v1";

export function getUser(username: string): Promise<Sourced<SleeperUser>> {
  return fetchWithFixture({
    key: `sleeper:user:${username.toLowerCase()}`,
    url: `${BASE}/user/${encodeURIComponent(username)}`,
    // In fixture mode any username resolves to the demo user, so the
    // first-run setup flow is fully testable offline.
    fixture: "user-therealdeal.json",
    ttlMs: TTL.league,
  });
}

export function getState(fresh = false): Promise<Sourced<SleeperState>> {
  return fetchWithFixture({
    key: "sleeper:state",
    url: `${BASE}/state/nfl`,
    fixture: "state.json",
    ttlMs: TTL.state,
    fresh,
  });
}

export function getLeague(leagueId: string, fresh = false): Promise<Sourced<SleeperLeague>> {
  return fetchWithFixture({
    key: `sleeper:league:${leagueId}`,
    url: `${BASE}/league/${leagueId}`,
    fixture: `leagues/${leagueId}/league.json`,
    ttlMs: TTL.league,
    fresh,
  });
}

export function getRosters(leagueId: string, fresh = false): Promise<Sourced<SleeperRoster[]>> {
  return fetchWithFixture({
    key: `sleeper:rosters:${leagueId}`,
    url: `${BASE}/league/${leagueId}/rosters`,
    fixture: `leagues/${leagueId}/rosters.json`,
    ttlMs: TTL.league,
    fresh,
  });
}

export function getLeagueUsers(leagueId: string, fresh = false): Promise<Sourced<SleeperLeagueUser[]>> {
  return fetchWithFixture({
    key: `sleeper:users:${leagueId}`,
    url: `${BASE}/league/${leagueId}/users`,
    fixture: `leagues/${leagueId}/users.json`,
    ttlMs: TTL.league,
    fresh,
  });
}

export function getTradedPicks(leagueId: string, fresh = false): Promise<Sourced<SleeperTradedPick[]>> {
  return fetchWithFixture({
    key: `sleeper:traded_picks:${leagueId}`,
    url: `${BASE}/league/${leagueId}/traded_picks`,
    fixture: `leagues/${leagueId}/traded_picks.json`,
    ttlMs: TTL.league,
    fresh,
  });
}

export function getMatchups(leagueId: string, week: number, fresh = false): Promise<Sourced<SleeperMatchup[]>> {
  return fetchWithFixture({
    key: `sleeper:matchups:${leagueId}:${week}`,
    url: `${BASE}/league/${leagueId}/matchups/${week}`,
    fixture: `leagues/${leagueId}/matchups-1.json`,
    ttlMs: TTL.trending,
    fresh,
  });
}

export function getTrending(type: "add" | "drop"): Promise<Sourced<TrendingEntry[]>> {
  return fetchWithFixture({
    key: `sleeper:trending:${type}`,
    url: `${BASE}/players/nfl/trending/${type}?lookback_hours=24&limit=25`,
    fixture: `trending-${type}.json`,
    ttlMs: TTL.trending,
  });
}

export function getDrafts(leagueId: string, fresh = false): Promise<Sourced<SleeperDraft[]>> {
  return fetchWithFixture({
    key: `sleeper:drafts:${leagueId}`,
    url: `${BASE}/league/${leagueId}/drafts`,
    fixture: `leagues/${leagueId}/drafts.json`,
    ttlMs: TTL.league,
    fresh,
  });
}

export function getDraftPicks(draftId: string, fresh = false): Promise<Sourced<SleeperDraftPick[]>> {
  return fetchWithFixture({
    key: `sleeper:draftpicks:${draftId}`,
    url: `${BASE}/draft/${draftId}/picks`,
    fixture: `drafts/${draftId}-picks.json`,
    ttlMs: TTL.trending,
    fresh,
  });
}

/**
 * Undocumented endpoint — best-effort only. Callers must tolerate null.
 */
export async function getProjections(
  season: string,
  week: number
): Promise<Sourced<ProjectionEntry[]> | null> {
  try {
    return await fetchWithFixture<ProjectionEntry[]>({
      key: `sleeper:projections:${season}:${week}`,
      url: `https://api.sleeper.app/projections/nfl/${season}/${week}?season_type=regular`,
      fixture: "projections-week.json",
      ttlMs: TTL.projections,
    });
  } catch {
    return null;
  }
}
