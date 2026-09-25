"use client";

import { useMemo, useState } from "react";
import { LeagueBundle, resolveMyRosterId } from "../leagueBundle";
import { CanonicalPlayer } from "../players/canonical";
import { playerValue, ValueSource } from "../values/engine";
import { useSleeperUser } from "./useSleeperUser";

/**
 * The user's roster in this league plus the roster currently being viewed
 * (defaults to theirs; falls back to the first roster only for display).
 */
export function useMyRoster(bundle: LeagueBundle) {
  const { user, ready } = useSleeperUser();
  const myRosterId = useMemo(
    () => resolveMyRosterId(user, bundle.rosters, bundle.leagueConfig.id),
    [user, bundle.rosters, bundle.leagueConfig.id]
  );
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const viewRosterId = selectedId ?? myRosterId ?? bundle.rosters[0]?.roster_id ?? null;
  return { user, ready, myRosterId, viewRosterId, setViewRosterId: setSelectedId };
}

/** Format-aware value function for this league and value source. */
export function useValueOf(bundle: LeagueBundle, source: ValueSource = bundle.defaultSource) {
  const { leagueConfig, valueContext } = bundle;
  return useMemo(
    () => (p: CanonicalPlayer) => playerValue(p, leagueConfig, source, valueContext),
    [leagueConfig, source, valueContext]
  );
}
