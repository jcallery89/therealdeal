export interface SleeperUser {
  user_id: string;
  username?: string;
  display_name: string;
  avatar: string | null;
}

export interface SleeperState {
  week: number;
  season: string;
  season_type: string;
  league_season: string;
}

export interface SleeperLeague {
  league_id: string;
  name: string;
  season: string;
  status: string;
  total_rosters: number;
  roster_positions: string[];
  scoring_settings: Record<string, number>;
  settings: {
    type?: number; // 0 redraft, 1 keeper, 2 dynasty
    taxi_slots?: number;
    max_keepers?: number;
    reserve_slots?: number;
    leg?: number; // current week
    [key: string]: number | undefined;
  };
  previous_league_id: string | null;
  avatar: string | null;
}

export interface SleeperRoster {
  roster_id: number;
  owner_id: string | null;
  co_owners: string[] | null;
  players: string[] | null;
  starters: string[] | null;
  reserve: string[] | null; // IR
  taxi: string[] | null;
  settings: {
    wins: number;
    losses: number;
    ties: number;
    fpts: number;
    fpts_decimal?: number;
    fpts_against?: number;
    fpts_against_decimal?: number;
    [key: string]: number | undefined;
  };
}

export interface SleeperLeagueUser {
  user_id: string;
  display_name: string;
  avatar: string | null;
  metadata?: { team_name?: string; [key: string]: string | undefined };
  is_owner?: boolean;
}

export interface SleeperMatchup {
  roster_id: number;
  matchup_id: number | null;
  points: number;
  starters: string[] | null;
  players: string[] | null;
}

export interface SleeperTradedPick {
  season: string;
  round: number;
  /** Original owner (whose draft slot this is). */
  roster_id: number;
  /** Current owner. */
  owner_id: number;
  previous_owner_id: number;
}

export interface TrendingEntry {
  player_id: string;
  count: number;
}

/**
 * Slimmed player record — the raw /players/nfl blob is ~5MB; we keep only
 * fantasy-relevant fields and positions (QB/RB/WR/TE/K/DEF).
 */
export interface SlimPlayer {
  player_id: string;
  full_name: string;
  position: string;
  team: string | null;
  age: number | null;
  years_exp: number | null;
  injury_status: string | null;
  status: string | null;
}

export type PlayersMap = Record<string, SlimPlayer>;

export interface ProjectionEntry {
  player_id: string;
  stats: Record<string, number>;
}

export interface SleeperDraft {
  draft_id: string;
  season: string;
  status: string; // pre_draft | drafting | paused | complete
  type?: string;
  /** user_id -> draft slot (1-based). Null until the order is set. */
  draft_order: Record<string, number> | null;
  settings: { rounds?: number; teams?: number; [key: string]: number | undefined };
  start_time?: number | null;
}

export interface SleeperDraftPick {
  draft_id: string;
  round: number;
  pick_no: number;
  player_id: string;
  roster_id: number | null;
  picked_by: string;
}
