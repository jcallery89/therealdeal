"use client";

import { useCallback, useEffect, useState } from "react";

export interface StoredUser {
  userId: string;
  username: string;
  displayName: string;
  /** leagueId -> roster_id for leagues where this user owns a team. */
  rosterIdByLeague: Record<string, number>;
}

const KEY = "therealdeal:user";

export function loadStoredUser(): StoredUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as StoredUser) : null;
  } catch {
    return null;
  }
}

export function useSleeperUser() {
  const [user, setUser] = useState<StoredUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setUser(loadStoredUser());
    setReady(true);
  }, []);

  const save = useCallback((u: StoredUser) => {
    window.localStorage.setItem(KEY, JSON.stringify(u));
    setUser(u);
  }, []);

  const clear = useCallback(() => {
    window.localStorage.removeItem(KEY);
    setUser(null);
  }, []);

  return { user, ready, save, clear };
}
