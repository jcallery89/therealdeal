"use client";

import { useMemo, useState } from "react";
import DataSourceBanner from "@/components/DataSourceBanner";
import { PlayerCell, ValueChip } from "@/components/players/PlayerRow";
import {
  CORE_POSITIONS,
  CorePosition,
  positionalStrength,
  starterSlots,
  valueWeightedAge,
} from "@/lib/analysis/rosterStrength";
import { LeagueBundle, teamName } from "@/lib/leagueBundle";
import { BYE_WEEKS } from "@/lib/config";
import { useSleeperUser } from "@/lib/hooks/useSleeperUser";
import { CanonicalPlayer } from "@/lib/players/canonical";
import { keeperContextValue, playerValue } from "@/lib/values/engine";

export default function RosterDashboard({ bundle }: { bundle: LeagueBundle }) {
  const { user } = useSleeperUser();
  const {
    leagueConfig,
    league,
    rosters,
    users,
    players,
    valueContext,
    state,
    teamAnalytics,
  } = bundle;

  const myRosterId =
    user?.rosterIdByLeague?.[leagueConfig.id] ??
    rosters.find((r) => r.owner_id === user?.userId)?.roster_id ??
    rosters[0]?.roster_id;
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const rosterId = selectedId ?? myRosterId;
  const roster = rosters.find((r) => r.roster_id === rosterId) ?? rosters[0];

  const valueOf = useMemo(
    () => (p: CanonicalPlayer) =>
      playerValue(p, leagueConfig, bundle.defaultSource, valueContext),
    [leagueConfig, bundle.defaultSource, valueContext]
  );

  const slots = useMemo(() => starterSlots(league.roster_positions), [league.roster_positions]);

  const strengthByRoster = useMemo(
    () =>
      new Map(
        rosters.map((r) => [
          r.roster_id,
          positionalStrength(r.players ?? [], players, valueOf, slots),
        ])
      ),
    [rosters, players, valueOf, slots]
  );

  const maxByPosition = useMemo(() => {
    const max: Record<CorePosition, number> = { QB: 1, RB: 1, WR: 1, TE: 1 };
    for (const strength of strengthByRoster.values()) {
      for (const pos of CORE_POSITIONS) {
        max[pos] = Math.max(max[pos], strength[pos]);
      }
    }
    return max;
  }, [strengthByRoster]);

  if (!roster) return <p className="text-slate-400">No rosters found.</p>;

  const starterIds = (roster.starters ?? []).filter((id) => id !== "0");
  const starterSet = new Set(starterIds);
  const taxiSet = new Set(roster.taxi ?? []);
  const reserveSet = new Set(roster.reserve ?? []);
  const bench = (roster.players ?? []).filter(
    (id) => !starterSet.has(id) && !taxiSet.has(id) && !reserveSet.has(id)
  );

  const slotLabels = league.roster_positions.filter(
    (p) => p !== "BN" && p !== "IR" && p !== "TAXI"
  );

  const analytics = teamAnalytics.find((t) => t.rosterId === roster.roster_id);
  const strength = strengthByRoster.get(roster.roster_id)!;
  const teamAge = valueWeightedAge(roster.players ?? [], players, valueOf);
  const leagueAvgAge = (() => {
    const ages = rosters
      .map((r) => valueWeightedAge(r.players ?? [], players, valueOf))
      .filter((a): a is number => a !== null);
    return ages.length ? ages.reduce((a, b) => a + b, 0) / ages.length : null;
  })();

  const byeCounts = new Map<number, number>();
  for (const id of starterIds) {
    const team = players[id]?.team;
    const bye = team ? BYE_WEEKS[team] : undefined;
    if (bye !== undefined && bye >= state.week) {
      byeCounts.set(bye, (byeCounts.get(bye) ?? 0) + 1);
    }
  }
  const byeCluster = [...byeCounts.entries()].find(([, count]) => count >= 3);

  const sortByValue = (ids: string[]) =>
    [...ids].sort((a, b) => (players[b] ? valueOf(players[b]) : 0) - (players[a] ? valueOf(players[a]) : 0));

  const section = (title: string, ids: string[], labels?: string[]) =>
    ids.length > 0 && (
      <div key={title}>
        <h3 className="mb-1.5 mt-5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          {title}
        </h3>
        <div className="divide-y divide-slate-800/60 rounded-lg border border-slate-800 bg-slate-900/50">
          {ids.map((id, i) => {
            const p = players[id];
            return (
              <div key={`${id}-${i}`} className="flex items-center gap-2 px-3 py-2">
                {labels && (
                  <span className="w-14 shrink-0 text-[11px] font-medium text-slate-600">
                    {labels[i]?.replace("SUPER_FLEX", "SFLX").replace("_", " ") ?? ""}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <PlayerCell player={p} playerId={id} currentWeek={state.week} />
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {!leagueConfig.isDynasty && p && keeperContextValue(p) !== null && (
                    <span
                      className="font-mono text-[11px] text-slate-600"
                      title="KeepTradeCut dynasty 1QB value (keeper context)"
                    >
                      ktc {keeperContextValue(p)!.toLocaleString()}
                    </span>
                  )}
                  {p && (
                    <ValueChip
                      value={valueOf(p)}
                      max={leagueConfig.isDynasty ? 10500 : valueContext.fcRedMax}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );

  return (
    <div className="mx-auto max-w-5xl">
      <DataSourceBanner source={bundle.source} valuesDegraded={bundle.valuesDegraded} />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">{teamName(users, roster)}</h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-slate-400">
            <span>
              {roster.settings.wins}-{roster.settings.losses}
              {roster.settings.ties ? `-${roster.settings.ties}` : ""}
            </span>
            <span className="text-slate-600">·</span>
            <span>{Math.round(roster.settings.fpts ?? 0).toLocaleString()} pts</span>
            <span className="text-slate-600">·</span>
            <span>Week {state.week}</span>
            {analytics && (
              <>
                <span className="text-slate-600">·</span>
                <span className="text-slate-300">{analytics.bucket}</span>
              </>
            )}
          </div>
          <div className="mt-2 flex gap-1.5">
            {leagueConfig.description.split(" · ").slice(1).map((chip) => (
              <span key={chip} className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
                {chip}
              </span>
            ))}
          </div>
        </div>
        <select
          aria-label="View team"
          value={roster.roster_id}
          onChange={(e) => setSelectedId(parseInt(e.target.value, 10))}
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200"
        >
          {rosters.map((r) => (
            <option key={r.roster_id} value={r.roster_id}>
              {teamName(users, r)}
              {r.roster_id === myRosterId ? " (me)" : ""}
            </option>
          ))}
        </select>
      </div>

      {byeCluster && (
        <div className="mt-4 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          Bye-week cluster: {byeCluster[1]} projected starters share the week {byeCluster[0]} bye.
        </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div data-testid="strength-bars" className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Positional strength (vs league best)
          </h3>
          <div className="flex flex-col gap-2.5">
            {CORE_POSITIONS.map((pos) => {
              const share = strength[pos] / maxByPosition[pos];
              const tier = share >= 0.85 ? "Elite" : share >= 0.6 ? "Strong" : share >= 0.4 ? "Average" : "Weak";
              return (
                <div key={pos} className="flex items-center gap-3">
                  <span className="w-8 text-xs font-semibold text-slate-400">{pos}</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className={`h-full rounded-full ${share >= 0.6 ? "bg-emerald-500" : share >= 0.4 ? "bg-sky-500" : "bg-rose-500"}`}
                      style={{ width: `${Math.max(3, share * 100)}%` }}
                    />
                  </div>
                  <span className="w-14 text-right text-[11px] text-slate-500">{tier}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Age profile (value-weighted)
          </h3>
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-bold text-slate-100">
              {teamAge !== null ? teamAge.toFixed(1) : "—"}
            </span>
            <span className="text-sm text-slate-500">
              league avg {leagueAvgAge !== null ? leagueAvgAge.toFixed(1) : "—"}
            </span>
            {teamAge !== null && leagueAvgAge !== null && (
              <span
                className={`text-sm font-medium ${teamAge <= leagueAvgAge ? "text-emerald-400" : "text-amber-400"}`}
              >
                {teamAge <= leagueAvgAge ? "younger than average" : "older than average"}
              </span>
            )}
          </div>
          {analytics && (
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg bg-slate-800/60 p-2.5">
                <div className="text-[10px] uppercase tracking-wide text-slate-500">Roster value</div>
                <div className="font-mono text-slate-200">{analytics.playerValue.toLocaleString()}</div>
              </div>
              <div className="rounded-lg bg-slate-800/60 p-2.5">
                <div className="text-[10px] uppercase tracking-wide text-slate-500">
                  {leagueConfig.isDynasty ? "Pick capital" : "30-day trend"}
                </div>
                <div className="font-mono text-slate-200">
                  {leagueConfig.isDynasty
                    ? analytics.pickValue.toLocaleString()
                    : `${analytics.trend30 >= 0 ? "+" : ""}${analytics.trend30.toLocaleString()}`}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {section("Starters", starterIds, slotLabels)}
      {section("Bench", sortByValue(bench))}
      {section("Taxi squad", sortByValue(roster.taxi ?? []))}
      {section("IR", roster.reserve ?? [])}
    </div>
  );
}
