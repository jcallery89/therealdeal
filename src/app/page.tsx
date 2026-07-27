"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import DataSourceBanner from "@/components/DataSourceBanner";
import { LEAGUES } from "@/lib/config";
import { useApi } from "@/lib/hooks/useApi";
import { useSleeperUser } from "@/lib/hooks/useSleeperUser";
import { SleeperLeagueUser, SleeperRoster } from "@/lib/sleeper/types";

function LeagueCard({ leagueId }: { leagueId: string }) {
  const config = LEAGUES.find((l) => l.id === leagueId)!;
  const { user } = useSleeperUser();
  const rosters = useApi<SleeperRoster[]>(`/api/sleeper/league/${leagueId}/rosters`);
  const users = useApi<SleeperLeagueUser[]>(`/api/sleeper/league/${leagueId}/users`);

  const myRosterId = user?.rosterIdByLeague?.[leagueId];
  const mine =
    rosters.data?.find((r) => r.roster_id === myRosterId) ??
    rosters.data?.find((r) => r.owner_id === user?.userId);
  const teamUser = users.data?.find((u) => u.user_id === mine?.owner_id);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">{config.label}</h2>
          <p className="mt-0.5 text-xs text-slate-500">{config.description}</p>
        </div>
        {mine && (
          <div className="text-right">
            <div className="text-xl font-bold text-emerald-300">
              {mine.settings.wins}-{mine.settings.losses}
              {mine.settings.ties ? `-${mine.settings.ties}` : ""}
            </div>
            <div className="text-[11px] text-slate-500">
              {teamUser?.metadata?.team_name ?? "my team"}
            </div>
          </div>
        )}
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        <Link className="rounded-md bg-slate-800 px-3 py-1.5 text-slate-200 hover:bg-slate-700" href={`/league/${leagueId}`}>
          Roster
        </Link>
        <Link className="rounded-md bg-slate-800 px-3 py-1.5 text-slate-200 hover:bg-slate-700" href={`/league/${leagueId}/trade`}>
          Trade Analyzer
        </Link>
        <Link className="rounded-md bg-slate-800 px-3 py-1.5 text-slate-200 hover:bg-slate-700" href={`/league/${leagueId}/strategy`}>
          Strategy
        </Link>
      </div>
      {rosters.source === "fixture" && (
        <div className="mt-3">
          <DataSourceBanner source="fixture" />
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const { user, ready } = useSleeperUser();
  const router = useRouter();

  useEffect(() => {
    if (ready && !user) router.replace("/setup");
  }, [ready, user, router]);

  if (!ready || !user) {
    return <div className="py-20 text-center text-sm text-slate-500">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">
            Welcome back, {user.displayName || user.username}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Rosters sync from Sleeper; values from FantasyCalc and KeepTradeCut.
          </p>
        </div>
        <Link href="/setup" className="text-xs text-slate-500 underline hover:text-slate-300">
          switch user
        </Link>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        {LEAGUES.map((l) => (
          <LeagueCard key={l.id} leagueId={l.id} />
        ))}
      </div>
    </div>
  );
}
