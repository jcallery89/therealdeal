import type { TeamAnalytics } from "./analysis/contender";
import type { LeagueConfig } from "./config";
import type { DataSourceKind } from "./datasource";
import type { CanonicalPlayer } from "./players/canonical";
import type {
  SleeperDraft,
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
  /** Seasons tracked in `picks`, next draft first. */
  pickSeasons: string[];
  /** The league's most recent Sleeper draft, if any. */
  draft: SleeperDraft | null;
  teamAnalytics: TeamAnalytics[];
  defaultSource: ValueSource;
  /**
   * Health of the PRIMARY data (Sleeper rosters/league). Value sources are
   * tracked separately in valueSources so a blocked scraper doesn't flag
   * genuinely live rosters as demo data.
   */
  source: DataSourceKind;
  /** Health of each market-value source (live / cache / fixture / unavailable). */
  valueSources: { fc: DataSourceKind; ktc: DataSourceKind };
}

export function teamName(users: SleeperLeagueUser[], roster: SleeperRoster): string {
  const user = users.find((u) => u.user_id === roster.owner_id);
  return user?.metadata?.team_name || user?.display_name || `Team ${roster.roster_id}`;
}

export interface RosterIdentity {
  userId: string;
  rosterIdByLeague?: Record<string, number>;
}

/**
 * The signed-in user's roster in this league: owner first, then co-owner,
 * then the mapping saved at setup. Returns null — never someone else's
 * team — when the user isn't on any roster.
 */
export function resolveMyRosterId(
  user: RosterIdentity | null,
  rosters: SleeperRoster[],
  leagueId: string
): number | null {
  if (!user) return null;
  const owned =
    rosters.find((r) => r.owner_id === user.userId) ??
    rosters.find((r) => r.co_owners?.includes(user.userId));
  if (owned) return owned.roster_id;
  const stored = user.rosterIdByLeague?.[leagueId];
  return stored !== undefined && rosters.some((r) => r.roster_id === stored) ? stored : null;
}
