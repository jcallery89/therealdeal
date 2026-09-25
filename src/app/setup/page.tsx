"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { LEAGUES } from "@/lib/config";
import { StoredUser, useSleeperUser } from "@/lib/hooks/useSleeperUser";
import { SleeperRoster, SleeperUser } from "@/lib/sleeper/types";

interface LeagueMatch {
  leagueId: string;
  label: string;
  /** roster_id when found, null when not on a roster, undefined when the lookup failed. */
  rosterId: number | null | undefined;
}

export default function SetupPage() {
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ user: StoredUser; matches: LeagueMatch[] } | null>(null);
  const { save } = useSleeperUser();
  const router = useRouter();

  function finish(user: StoredUser) {
    save(user);
    router.push("/");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!username.trim() || busy) return;
    setBusy(true);
    setError(null);
    setPending(null);
    try {
      const userRes = await fetch(`/api/sleeper/user/${encodeURIComponent(username.trim())}`);
      if (userRes.status === 404) {
        throw new Error("No Sleeper user with that username — check the spelling.");
      }
      if (!userRes.ok) {
        throw new Error("Couldn't reach Sleeper right now. Try again in a minute.");
      }
      const user = (await userRes.json()).data as SleeperUser;

      const matches: LeagueMatch[] = await Promise.all(
        LEAGUES.map(async (league) => {
          try {
            const res = await fetch(`/api/sleeper/league/${league.id}/rosters`);
            if (!res.ok) return { leagueId: league.id, label: league.label, rosterId: undefined };
            const rosters = (await res.json()).data as SleeperRoster[];
            const mine = rosters.find(
              (r) => r.owner_id === user.user_id || r.co_owners?.includes(user.user_id)
            );
            return { leagueId: league.id, label: league.label, rosterId: mine?.roster_id ?? null };
          } catch {
            return { leagueId: league.id, label: league.label, rosterId: undefined };
          }
        })
      );

      const rosterIdByLeague: Record<string, number> = {};
      for (const m of matches) if (typeof m.rosterId === "number") rosterIdByLeague[m.leagueId] = m.rosterId;
      const stored: StoredUser = {
        userId: user.user_id,
        username: username.trim(),
        displayName: user.display_name,
        rosterIdByLeague,
      };

      if (matches.every((m) => typeof m.rosterId === "number")) {
        finish(stored);
      } else {
        // Don't silently continue: show which leagues didn't match.
        setPending({ user: stored, matches });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col items-stretch pt-20">
      <h1 className="text-2xl font-bold text-slate-100">Link your Sleeper account</h1>
      <p className="mt-2 text-sm text-slate-400">
        Enter your Sleeper username and we&apos;ll find your teams in The Real Deal and the
        Dynasty league. Nothing to authorize — the Sleeper API is read-only.
      </p>
      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-3">
        <input
          autoFocus
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Sleeper username"
          aria-label="Sleeper username"
          className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2.5 text-slate-100 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || !username.trim()}
          className="rounded-lg bg-emerald-500 px-4 py-2.5 font-medium text-slate-950 transition-colors hover:bg-emerald-400 disabled:opacity-50"
        >
          {busy ? "Finding your teams…" : "Continue"}
        </button>
        {error && <p className="text-sm text-rose-400">{error}</p>}
      </form>

      {pending && (
        <div data-testid="setup-results" className="mt-6 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
          <p className="text-sm font-medium text-amber-300">
            Found {pending.user.displayName}, but not on every league:
          </p>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {pending.matches.map((m) => (
              <li key={m.leagueId} className="flex items-center gap-2">
                {typeof m.rosterId === "number" ? (
                  <span className="text-emerald-400">✓</span>
                ) : (
                  <span className="text-rose-400">✗</span>
                )}
                <span className="text-slate-200">{m.label}</span>
                <span className="text-xs text-slate-500">
                  {typeof m.rosterId === "number"
                    ? "team found"
                    : m.rosterId === null
                      ? "not on a roster in this league"
                      : "couldn't check (Sleeper didn't respond)"}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-slate-400">
            Leagues without a match won&apos;t mark any team as yours — you can still browse them.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => finish(pending.user)}
              className="rounded-md bg-amber-500/20 px-3 py-1.5 text-sm font-medium text-amber-200 hover:bg-amber-500/30"
            >
              Continue anyway
            </button>
            <button
              onClick={() => setPending(null)}
              className="rounded-md px-3 py-1.5 text-sm text-slate-400 hover:text-slate-200"
            >
              Try another username
            </button>
          </div>
        </div>
      )}

      <p className="mt-4 text-xs text-slate-600">
        Stored only in this browser. You can switch users any time from the home page.
      </p>
    </div>
  );
}
