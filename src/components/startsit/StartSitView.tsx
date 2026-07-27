"use client";

import { useMemo, useState } from "react";
import DataSourceBanner from "@/components/DataSourceBanner";
import { PlayerCell, ValueChip } from "@/components/players/PlayerRow";
import { buildProjectionMap, lineupAdvice } from "@/lib/analysis/lineup";
import { LeagueBundle, teamName } from "@/lib/leagueBundle";
import { useSleeperUser } from "@/lib/hooks/useSleeperUser";
import { ProjectionEntry, SleeperMatchup } from "@/lib/sleeper/types";

export default function StartSitView({
  bundle,
  projections,
  matchups,
}: {
  bundle: LeagueBundle;
  projections: ProjectionEntry[] | null;
  matchups: SleeperMatchup[];
}) {
  const { user } = useSleeperUser();
  const { leagueConfig, league, rosters, users, players, state } = bundle;

  const myRosterId =
    user?.rosterIdByLeague?.[leagueConfig.id] ??
    rosters.find((r) => r.owner_id === user?.userId)?.roster_id ??
    rosters[0]?.roster_id;
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const rosterId = selectedId ?? myRosterId;
  const roster = rosters.find((r) => r.roster_id === rosterId) ?? rosters[0];

  const projMap = useMemo(
    () => buildProjectionMap(projections, players, league.scoring_settings),
    [projections, players, league.scoring_settings]
  );
  const hasProjections = Object.keys(projMap).length > 0;

  const advice = useMemo(() => {
    if (!roster) return null;
    const taxiSet = new Set(roster.taxi ?? []);
    const irSet = new Set(roster.reserve ?? []);
    const active = (roster.players ?? []).filter((id) => !taxiSet.has(id) && !irSet.has(id));
    return lineupAdvice(
      roster.starters ?? [],
      active,
      league.roster_positions,
      players,
      projMap
    );
  }, [roster, league.roster_positions, players, projMap]);

  if (!roster || !advice) return <p className="text-slate-400">No rosters found.</p>;

  const myMatchup = matchups.find((m) => m.roster_id === roster.roster_id);
  const opponentMatchup = matchups.find(
    (m) =>
      m.matchup_id !== null &&
      m.matchup_id === myMatchup?.matchup_id &&
      m.roster_id !== roster.roster_id
  );
  const opponentRoster = rosters.find((r) => r.roster_id === opponentMatchup?.roster_id);
  const opponentAdvice = opponentRoster
    ? lineupAdvice(
        opponentRoster.starters ?? [],
        (opponentRoster.players ?? []).filter(
          (id) => !(opponentRoster.taxi ?? []).includes(id) && !(opponentRoster.reserve ?? []).includes(id)
        ),
        league.roster_positions,
        players,
        projMap
      )
    : null;

  const proj = (id: string) => projMap[id] ?? 0;
  const gain = Math.round((advice.optimalTotal - advice.currentTotal) * 10) / 10;

  const starterSet = new Set((roster.starters ?? []).filter((id) => id !== "0"));
  const taxiSet = new Set(roster.taxi ?? []);
  const irSet = new Set(roster.reserve ?? []);
  const bench = (roster.players ?? [])
    .filter((id) => !starterSet.has(id) && !taxiSet.has(id) && !irSet.has(id))
    .sort((a, b) => proj(b) - proj(a));

  // Waiver watch: trending adds not rostered in this league.
  const rostered = new Set(rosters.flatMap((r) => r.players ?? []));
  const waivers = Object.values(players)
    .filter((p) => p.trending?.add !== undefined && !rostered.has(p.sleeperId))
    .sort((a, b) => (b.trending?.add ?? 0) - (a.trending?.add ?? 0))
    .slice(0, 10);

  const maxVal = Math.max(
    ...Object.values(players).map((p) => p.values.fcRedraft?.value ?? 0),
    1
  );

  return (
    <div className="mx-auto max-w-5xl">
      <DataSourceBanner source={bundle.source} valuesDegraded={bundle.valuesDegraded} />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Start/Sit — Week {state.week}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {leagueConfig.label} · projections scored with your league&apos;s settings
            {league.scoring_settings.bonus_rec_te ? " (TEP included)" : ""}
          </p>
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

      {!hasProjections && (
        <div className="mt-4 rounded-md border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-xs text-sky-300">
          Weekly projections aren&apos;t available right now (Sleeper&apos;s projections feed is
          best-effort). Lineup advice will appear when they load; waiver trends below still work.
        </div>
      )}

      {/* Matchup preview */}
      {opponentRoster && opponentAdvice && (
        <div data-testid="matchup-preview" className="mt-5 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            This week&apos;s matchup
          </h3>
          <div className="mt-2 flex items-center gap-4">
            {[
              { name: teamName(users, roster), total: advice.currentTotal, me: true },
              { name: teamName(users, opponentRoster), total: opponentAdvice.currentTotal, me: false },
            ].map((side, i) => (
              <div key={i} className={`flex-1 ${i === 1 ? "text-right" : ""}`}>
                <div className={`text-sm font-medium ${side.me ? "text-emerald-300" : "text-slate-200"}`}>
                  {side.name}
                </div>
                <div className="font-mono text-2xl font-bold text-slate-100">
                  {hasProjections ? side.total.toFixed(1) : "—"}
                </div>
                <div className="text-[10px] text-slate-500">projected (current lineup)</div>
              </div>
            ))}
          </div>
          {hasProjections && (
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full bg-emerald-500"
                style={{
                  width: `${
                    (advice.currentTotal /
                      Math.max(advice.currentTotal + opponentAdvice.currentTotal, 1)) * 100
                  }%`,
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* Recommendations */}
      {hasProjections && (advice.promote.length > 0 || advice.sit.length > 0) && (
        <div data-testid="lineup-advice" className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex items-baseline justify-between">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-amber-300">
              Lineup changes recommended
            </h3>
            <span className="text-xs text-amber-300">+{gain.toFixed(1)} projected pts</span>
          </div>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-wide text-emerald-400">Start</div>
              {advice.promote.map((id) => (
                <div key={id} className="flex items-center justify-between py-1">
                  <PlayerCell player={players[id]} playerId={id} currentWeek={state.week} />
                  <span className="font-mono text-sm text-emerald-300">{proj(id).toFixed(1)}</span>
                </div>
              ))}
            </div>
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-wide text-rose-400">Sit</div>
              {advice.sit.map((id) => (
                <div key={id} className="flex items-center justify-between py-1">
                  <PlayerCell player={players[id]} playerId={id} currentWeek={state.week} />
                  <span className="font-mono text-sm text-rose-300">{proj(id).toFixed(1)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {hasProjections && advice.promote.length === 0 && advice.sit.length === 0 && (
        <div data-testid="lineup-advice" className="mt-4 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-300">
          Your current lineup is already optimal for week {state.week}. Projected:{" "}
          {advice.currentTotal.toFixed(1)} pts.
        </div>
      )}

      {/* Optimal lineup */}
      <div data-testid="optimal-lineup">
        <h3 className="mb-1.5 mt-6 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Optimal lineup{hasProjections ? ` · ${advice.optimalTotal.toFixed(1)} projected pts` : ""}
        </h3>
        <div className="divide-y divide-slate-800/60 rounded-lg border border-slate-800 bg-slate-900/50">
          {advice.optimal.map((slot, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-2">
              <span className="w-14 shrink-0 text-[11px] font-medium text-slate-600">
                {slot.slot.replace("SUPER_FLEX", "SFLX").replace("_", " ")}
              </span>
              <div className="min-w-0 flex-1">
                {slot.playerId ? (
                  <PlayerCell
                    player={players[slot.playerId]}
                    playerId={slot.playerId}
                    currentWeek={state.week}
                  />
                ) : (
                  <span className="text-sm text-slate-600">— no eligible player</span>
                )}
              </div>
              <span className="flex shrink-0 items-center gap-2">
                {slot.playerId && !starterSet.has(slot.playerId) && (
                  <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
                    promote
                  </span>
                )}
                <span className="font-mono text-sm text-slate-300">
                  {hasProjections && slot.playerId ? slot.projected.toFixed(1) : "—"}
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Bench */}
      {bench.length > 0 && (
        <div>
          <h3 className="mb-1.5 mt-5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Bench
          </h3>
          <div className="divide-y divide-slate-800/60 rounded-lg border border-slate-800 bg-slate-900/50">
            {bench.map((id) => (
              <div key={id} className="flex items-center gap-2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <PlayerCell player={players[id]} playerId={id} currentWeek={state.week} />
                </div>
                <span className="font-mono text-sm text-slate-500">
                  {hasProjections ? proj(id).toFixed(1) : "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Waiver watch */}
      <div data-testid="waiver-watch">
        <h3 className="mb-1.5 mt-6 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Waiver watch — trending &amp; unrostered here
        </h3>
        <div className="divide-y divide-slate-800/60 rounded-lg border border-slate-800 bg-slate-900/50">
          {waivers.map((p) => (
            <div key={p.sleeperId} className="flex items-center gap-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <PlayerCell player={p} playerId={p.sleeperId} currentWeek={state.week} />
              </div>
              <span className="flex shrink-0 items-center gap-3">
                {hasProjections && (
                  <span className="font-mono text-xs text-slate-500">
                    {proj(p.sleeperId).toFixed(1)} proj
                  </span>
                )}
                <ValueChip value={p.values.fcRedraft?.value ?? 0} max={maxVal} />
              </span>
            </div>
          ))}
          {waivers.length === 0 && (
            <p className="px-3 py-2.5 text-xs text-slate-600">
              No trending free agents in this league right now.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
