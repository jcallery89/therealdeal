import type { CanonicalPlayer } from "../players/canonical";
import type { NewsItem } from "../espn/news";
import type { ScheduledGame } from "../nflverse/client";
import type { DataSourceKind } from "../datasource";
import type { StartConsensus } from "./consensus";

/** Where a piece of evidence came from — shown as a chip on each insight. */
export type SignalSource =
  | "Usage"
  | "Snaps"
  | "Depth chart"
  | "Injury report"
  | "Trending"
  | "Ownership"
  | "Projections"
  | "Market"
  | "Vegas"
  | "Schedule"
  | "News"
  | "Roster fit";

export interface Signal {
  source: SignalSource;
  text: string;
}

export type InsightKind = "waiver" | "buy" | "sell" | "lineup" | "injury" | "rival" | "stash";

export interface Insight {
  /** Stable key for de-duplicating alerts across runs. */
  id: string;
  kind: InsightKind;
  /** 0-100 priority. */
  score: number;
  title: string;
  detail: string;
  signals: Signal[];
  playerIds: string[];
  /** In-app follow-up, e.g. the trade analyzer pre-filled. */
  href?: string;
  /** Needs action before the next kickoff. */
  urgent?: boolean;
}

export interface WeekUsage {
  week: number;
  snapPct: number | null;
  targets: number;
  carries: number;
  points: number;
}

/** A player's season usage from nflverse (standard PPR points). */
export interface UsageSummary {
  games: number;
  /** Offensive snap share, 0-1: season, last 2 games, and the games before. */
  snapPct: number | null;
  snapRecent: number | null;
  snapPrior: number | null;
  targetShare: number;
  targetShareRecent: number;
  /** Share of the team's carries. */
  carryShare: number;
  carryShareRecent: number;
  woprRecent: number;
  /** Actual and expected (opportunity-based) PPR points per game. */
  ppg: number;
  xppg: number;
  xppgRecent: number;
  tdPerGame: number;
  weeks: WeekUsage[];
}

/** Fantasy points allowed per game by each defense, relative to league average (1 = average). */
export type DefenseFactors = Record<string, Partial<Record<string, number>>>;

/** Everything beyond the league bundle that the edge engine blends. */
export interface EdgeInputs {
  /** Bundle players plus free-agent candidates and depth-chart teammates. */
  players: Record<string, CanonicalPlayer>;
  usage: Record<string, UsageSummary>;
  defense: DefenseFactors;
  /** Remaining regular-season games (this week onward). */
  schedule: ScheduledGame[];
  /** Latest official injury report entry per player. */
  injuryReports: Record<string, { status: string | null; injury: string | null; practice: string | null; week: number }>;
  /** This week's projections scored with the league's settings. */
  weekProjections: Record<string, number>;
  /** Experts + projections + crowd blended start/sit, this week. */
  consensus: Record<string, StartConsensus>;
  /** Extra this-season production values for players outside the bundle. */
  production: Record<string, number>;
  /** % of Sleeper leagues rostering the player. */
  ownership: Record<string, number>;
  news: Record<string, Pick<NewsItem, "headline" | "published" | "url">[]>;
  /** This week's matchups: roster_id -> opponent roster_id. */
  opponents: Record<number, number>;
  health: Record<
    "usage" | "snaps" | "injuries" | "schedule" | "news" | "ownership" | "projections" | "experts",
    DataSourceKind
  >;
  /** The clock insights are computed against (fixtures pin it to their week). */
  asOf: number;
}
