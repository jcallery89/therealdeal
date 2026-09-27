import { TTL } from "../config";
import { parseCsv } from "../csv";
import { fetchWithFixture, Sourced } from "../datasource";

/**
 * nflverse open data (github.com/nflverse): play-by-play derived weekly
 * usage, snap counts, official injury reports, and the schedule with betting
 * lines. Free, refreshed nightly in season, hosted on GitHub.
 */
const RELEASES = "https://github.com/nflverse/nflverse-data/releases/download";
const SCHEDULE_URL = "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv";

const SKILL = new Set(["QB", "RB", "WR", "TE"]);

/** nflverse abbreviations that differ from Sleeper's. */
const TEAM_FIX: Record<string, string> = { LA: "LAR", STL: "LAR", SD: "LAC", OAK: "LV" };
export const nflTeam = (abbr: string): string => TEAM_FIX[abbr] ?? abbr;

const num = (s: string | undefined) => {
  const n = Number(s);
  return s === undefined || s === "" || s === "NA" || !Number.isFinite(n) ? 0 : n;
};
const optNum = (s: string | undefined) =>
  s === undefined || s === "" || s === "NA" || !Number.isFinite(Number(s)) ? null : Number(s);

function requireColumns(rows: Record<string, string>[], cols: string[], file: string) {
  if (rows.length === 0 || cols.some((c) => !(c in rows[0]))) {
    throw new SyntaxError(`nflverse ${file} has an unexpected format`);
  }
}

/** One player's box score for one week (standard PPR from nflverse). */
export interface WeeklyStat {
  gsisId: string;
  name: string;
  position: string;
  team: string;
  opponent: string;
  week: number;
  passAtt: number;
  passYds: number;
  passTd: number;
  passInt: number;
  carries: number;
  rushYds: number;
  rushTd: number;
  targets: number;
  receptions: number;
  recYds: number;
  recTd: number;
  airYards: number;
  targetShare: number;
  airYardsShare: number;
  wopr: number;
  pprPoints: number;
}

export function parseWeeklyStats(raw: unknown): WeeklyStat[] {
  const rows = parseCsv(String(raw));
  requireColumns(rows, ["player_id", "week", "targets", "fantasy_points_ppr"], "weekly stats");
  return rows
    .filter((r) => SKILL.has(r.position) && (r.season_type ?? "REG") === "REG")
    .map((r) => ({
      gsisId: r.player_id,
      name: r.player_display_name || r.player_name,
      position: r.position,
      team: nflTeam(r.team ?? r.recent_team ?? ""),
      opponent: nflTeam(r.opponent_team ?? ""),
      week: num(r.week),
      passAtt: num(r.attempts),
      passYds: num(r.passing_yards),
      passTd: num(r.passing_tds),
      passInt: num(r.passing_interceptions ?? r.interceptions),
      carries: num(r.carries),
      rushYds: num(r.rushing_yards),
      rushTd: num(r.rushing_tds),
      targets: num(r.targets),
      receptions: num(r.receptions),
      recYds: num(r.receiving_yards),
      recTd: num(r.receiving_tds),
      airYards: num(r.receiving_air_yards),
      targetShare: num(r.target_share),
      airYardsShare: num(r.air_yards_share),
      wopr: num(r.wopr),
      pprPoints: num(r.fantasy_points_ppr),
    }));
}

export interface SnapCount {
  pfrId: string;
  name: string;
  position: string;
  team: string;
  week: number;
  /** Share of the team's offensive snaps, 0-1. */
  offensePct: number;
}

export function parseSnapCounts(raw: unknown): SnapCount[] {
  const rows = parseCsv(String(raw));
  requireColumns(rows, ["pfr_player_id", "week", "offense_pct"], "snap counts");
  return rows
    .filter((r) => SKILL.has(r.position) && (r.game_type ?? "REG") === "REG")
    .map((r) => ({
      pfrId: r.pfr_player_id,
      name: r.player,
      position: r.position,
      team: nflTeam(r.team),
      week: num(r.week),
      offensePct: num(r.offense_pct),
    }));
}

export interface InjuryReport {
  gsisId: string;
  name: string;
  team: string;
  week: number;
  /** Game status: Out / Doubtful / Questionable, or null if none given. */
  status: string | null;
  injury: string | null;
  /** Last practice listing, e.g. "Did Not Participate In Practice". */
  practice: string | null;
}

export function parseInjuryReports(raw: unknown): InjuryReport[] {
  const rows = parseCsv(String(raw));
  requireColumns(rows, ["gsis_id", "week", "report_status"], "injury reports");
  const text = (s: string | undefined) => (s && s !== "NA" ? s : null);
  return rows
    .filter((r) => SKILL.has(r.position))
    .map((r) => ({
      gsisId: r.gsis_id,
      name: r.full_name,
      team: nflTeam(r.team),
      week: num(r.week),
      status: text(r.report_status),
      injury: text(r.report_primary_injury) ?? text(r.practice_primary_injury),
      practice: text(r.practice_status),
    }));
}

export interface ScheduledGame {
  gameId: string;
  week: number;
  /** Kickoff, ISO-8601 in US Eastern time as published (e.g. 2026-10-04T13:00). */
  kickoff: string;
  away: string;
  home: string;
  awayScore: number | null;
  homeScore: number | null;
  /** Points the home team is favored by (negative = home underdog). */
  spread: number | null;
  total: number | null;
}

export function parseSchedule(raw: unknown, season: string): ScheduledGame[] {
  const rows = parseCsv(String(raw));
  requireColumns(rows, ["game_id", "season", "week", "home_team", "spread_line", "total_line"], "schedule");
  return rows
    .filter((r) => r.season === season && r.game_type === "REG")
    .map((r) => ({
      gameId: r.game_id,
      week: num(r.week),
      kickoff: `${r.gameday}T${r.gametime || "13:00"}`,
      away: nflTeam(r.away_team),
      home: nflTeam(r.home_team),
      awayScore: optNum(r.away_score),
      homeScore: optNum(r.home_score),
      spread: optNum(r.spread_line),
      total: optNum(r.total_line),
    }));
}

export function getWeeklyStats(season: string): Promise<Sourced<WeeklyStat[]>> {
  return fetchWithFixture({
    key: `nflverse:weekly:${season}`,
    url: `${RELEASES}/stats_player/stats_player_week_${season}.csv`,
    fixture: "nflverse-weekly.json",
    ttlMs: TTL.nflverse,
    asText: true,
    parse: parseWeeklyStats,
  });
}

export function getSnapCounts(season: string): Promise<Sourced<SnapCount[]>> {
  return fetchWithFixture({
    key: `nflverse:snaps:${season}`,
    url: `${RELEASES}/snap_counts/snap_counts_${season}.csv`,
    fixture: "nflverse-snaps.json",
    ttlMs: TTL.nflverse,
    asText: true,
    parse: parseSnapCounts,
  });
}

export function getInjuryReports(season: string): Promise<Sourced<InjuryReport[]>> {
  return fetchWithFixture({
    key: `nflverse:injuries:${season}`,
    url: `${RELEASES}/injuries/injuries_${season}.csv`,
    fixture: "nflverse-injuries.json",
    ttlMs: TTL.nflverse,
    asText: true,
    parse: parseInjuryReports,
  });
}

export function getSchedule(season: string): Promise<Sourced<ScheduledGame[]>> {
  return fetchWithFixture({
    key: `nfldata:schedule:${season}`,
    url: SCHEDULE_URL,
    fixture: "schedule.json",
    ttlMs: TTL.nflverse,
    asText: true,
    parse: (raw) => parseSchedule(raw, season),
  });
}
