"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { LEAGUES } from "@/lib/config";
import { useSleeperUser } from "@/lib/hooks/useSleeperUser";
import { SleeperRoster, SleeperUser } from "@/lib/sleeper/types";

export default function SetupPage() {
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { save } = useSleeperUser();
  const router = useRouter();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!username.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const userRes = await fetch(`/api/sleeper/user/${encodeURIComponent(username.trim())}`);
      if (!userRes.ok) {
        throw new Error("Sleeper user not found — check the spelling of your username.");
      }
      const user = (await userRes.json()).data as SleeperUser;

      const rosterIdByLeague: Record<string, number> = {};
      for (const league of LEAGUES) {
        const res = await fetch(`/api/sleeper/league/${league.id}/rosters`);
        if (!res.ok) continue;
        const rosters = (await res.json()).data as SleeperRoster[];
        const mine = rosters.find(
          (r) => r.owner_id === user.user_id || r.co_owners?.includes(user.user_id)
        );
        if (mine) rosterIdByLeague[league.id] = mine.roster_id;
      }

      save({
        userId: user.user_id,
        username: username.trim(),
        displayName: user.display_name,
        rosterIdByLeague,
      });
      router.push("/");
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
      <p className="mt-4 text-xs text-slate-600">
        Stored only in this browser. You can switch users any time from the home page.
      </p>
    </div>
  );
}
