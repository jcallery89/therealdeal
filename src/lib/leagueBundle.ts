import type { TeamAnalytics } from "./analysis/contender";
import type { LeagueConfig } from "./config";
import type { DataSourceKind } from "./datasource";
import type { CanonicalPlayer } from "./players/canonical";
import type {
  SleeperLeague,
  SleeperLeagueUser,
  SleeperRoster,
  SleeperState,
} from "./sleeper/types";
import type { ValueContext, ValueSource } from "./values/engine";
import type { DraftPick, PickValueTable } from "./values/picks";

/**
 * Everything a league page needs, assembled server-side (see bundle.ts) and
 * passed to client components as plain serializable props. This module is
 * intentionally free of server-only imports so client components can use the
 * type and helpers.
 */
export interface LeagueBundle {
  leagueConfig: LeagueConfig;
  league: SleeperLeague;
  rosters: SleeperRoster[];
  users: SleeperLeagueUser[];
  state: SleeperState;
  players: Record<string, CanonicalPlayer>;
  /** Computed over the FULL table so blend normalization stays correct. */
  valueContext: ValueContext;
  pickValues: PickValueTable;
  picks: DraftPick[];
  teamAnalytics: TeamAnalytics[];
  defaultSource: ValueSource;
  source: DataSourceKind;
}

export function teamName(users: SleeperLeagueUser[], roster: SleeperRoster): string {
  const user = users.find((u) => u.user_id === roster.owner_id);
  return user?.metadata?.team_name || user?.display_name || `Team ${roster.roster_id}`;
}
