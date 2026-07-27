"use client";

import { useMemo } from "react";
import DataSourceBanner from "@/components/DataSourceBanner";
import { PlayerCell, ValueChip } from "@/components/players/PlayerRow";
import { TeamAnalytics } from "@/lib/analysis/contender";
import { LeagueBundle, teamName } from "@/lib/leagueBundle";
import { PICK_SEASONS_AHEAD, ROOKIE_DRAFT_ROUNDS } from "@/lib/config";
import { useSleeperUser } from "@/lib/hooks/useSleeperUser";
import { playerValue } from "@/lib/values/engine";
import { pickLabel } from "@/lib/values/picks";

const BUCKET_STYLES: Record<TeamAnalytics["bucket"], string> = {
  Contend: "bg-emerald-500/15 text-emerald-300",
  Push: "bg-sky-500/15 text-sky-300",
  Retool: "bg-amber-500/15 text-amber-300",
  Rebuild: "bg-rose-500/15 text-rose-300",
};

export default function StrategyView({ bundle }: { bundle: LeagueBundle }) {
  const { user } = useSleeperUser();
  const { leagueConfig, rosters, users, players, valueContext, picks, teamAnalytics, state } = bundle;

  const myRosterId =
    user?.rosterIdByLeague?.[leagueConfig.id] ??
    rosters.find((r) => r.owner_id === user?.userId)?.roster_id;

  const nameById = useMemo(
    () => new Map(rosters.map((r) => [r.roster_id, teamName(users, r)])),
    [rosters, users]
  );

  const ranked = useMemo(
    () => [...teamAnalytics].sort((a, b) => b.totalValue - a.totalValue),
    [teamAnalytics]
  );

  const rosteredIds = useMemo(
    () => new Set(rosters.flatMap((r) => r.players ?? [])),
    [rosters]
  );

  const rookies = useMemo(
    () =>
      Object.values(players)
        .filter((p) => p.yearsExp === 0)
        .map((p) => ({
          player: p,
          value: playerValue(p, leagueConfig, bundle.defaultSource, valueContext),
          rosteredBy: rosters.find((r) => r.players?.includes(p.sleeperId))?.roster_id ?? null,
        }))
        .filter((r) => r.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, 25),
    [players, leagueConfig, bundle.defaultSource, valueContext, rosters]
  );

  const seasons = Array.from({ length: PICK_SEASONS_AHEAD }, (_, i) =>
    String(parseInt(state.season, 10) + 1 + i)
  );

  // Scatter scales: min-max with padding so tightly grouped leagues still spread.
  const winNowVals = teamAnalytics.map((t) => t.winNowValue);
  const futureVals = teamAnalytics.map((t) => t.futureValue);
  const scale = (v: number, vals: number[]) => {
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    return max > min ? (v - min) / (max - min) : 0.5;
  };

  return (
    <div className="mx-auto max-w-5xl">
      <DataSourceBanner source={bundle.source} />
      <h1 className="text-2xl font-bold text-slate-100">
        {leagueConfig.isDynasty ? "Dynasty Strategy" : "League Strategy"}
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        {leagueConfig.label} · team values, posture, pick capital, and rookie targets
      </p>

      {/* Team value table */}
      <div className="mt-6 overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/50">
        <table data-testid="team-value-table" className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-left text-[11px] uppercase tracking-wider text-slate-500">
              <th className="px-4 py-2.5">#</th>
              <th className="px-4 py-2.5">Team</th>
              <th className="px-4 py-2.5 text-right">Record</th>
              <th className="px-4 py-2.5 text-right">Player value</th>
              {leagueConfig.isDynasty && <th className="px-4 py-2.5 text-right">Pick value</th>}
              <th className="px-4 py-2.5 text-right">Total</th>
              <th className="px-4 py-2.5 text-right">Age</th>
              <th className="px-4 py-2.5 text-right">30d trend</th>
              <th className="px-4 py-2.5 text-right">Posture</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((t, i) => {
              const isMe = t.rosterId === myRosterId;
              return (
                <tr
                  key={t.rosterId}
                  className={`border-b border-slate-800/50 last:border-0 ${isMe ? "bg-emerald-500/5" : ""}`}
                >
                  <td className="px-4 py-2 text-slate-500">{i + 1}</td>
                  <td className={`px-4 py-2 ${isMe ? "font-semibold text-emerald-300" : "text-slate-200"}`}>
                    {nameById.get(t.rosterId)}
                    {isMe ? " ★" : ""}
                  </td>
                  <td className="px-4 py-2 text-right text-slate-400">
                    {t.wins}-{t.losses}
                    {t.ties ? `-${t.ties}` : ""}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-slate-300">
                    {t.playerValue.toLocaleString()}
                  </td>
                  {leagueConfig.isDynasty && (
                    <td className="px-4 py-2 text-right font-mono text-slate-400">
                      {t.pickValue.toLocaleString()}
                    </td>
                  )}
                  <td className="px-4 py-2 text-right font-mono font-semibold text-slate-200">
                    {t.totalValue.toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-right text-slate-400">
                    {t.weightedAge !== null ? t.weightedAge.toFixed(1) : "—"}
                  </td>
                  <td
                    className={`px-4 py-2 text-right font-mono ${
                      t.trend30 > 0 ? "text-emerald-400" : t.trend30 < 0 ? "text-rose-400" : "text-slate-500"
                    }`}
                  >
                    {t.trend30 > 0 ? "▲" : t.trend30 < 0 ? "▼" : ""}
                    {Math.abs(t.trend30).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${BUCKET_STYLES[t.bucket]}`}>
                      {t.bucket}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {/* Contender matrix */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Win-now vs future value
          </h3>
          <svg viewBox="0 0 400 300" className="mt-2 w-full" data-testid="contender-matrix">
            <line x1="40" y1="260" x2="390" y2="260" stroke="#334155" strokeWidth="1" />
            <line x1="40" y1="10" x2="40" y2="260" stroke="#334155" strokeWidth="1" />
            <text x="215" y="292" textAnchor="middle" fill="#64748b" fontSize="11">
              win-now value →
            </text>
            <text x="14" y="135" textAnchor="middle" fill="#64748b" fontSize="11" transform="rotate(-90 14 135)">
              future value →
            </text>
            {teamAnalytics.map((t) => {
              const x = 60 + scale(t.winNowValue, winNowVals) * 300;
              const y = 245 - scale(t.futureValue, futureVals) * 210;
              const isMe = t.rosterId === myRosterId;
              return (
                <g key={t.rosterId}>
                  <circle
                    cx={x}
                    cy={y}
                    r={isMe ? 7 : 5}
                    fill={isMe ? "#34d399" : "#38bdf8"}
                    fillOpacity={isMe ? 0.95 : 0.6}
                  />
                  <text x={x} y={y - 10} textAnchor="middle" fill={isMe ? "#6ee7b7" : "#94a3b8"} fontSize="10">
                    {(nameById.get(t.rosterId) ?? "").slice(0, 14)}
                  </text>
                </g>
              );
            })}
          </svg>
          <p className="mt-1 text-[11px] text-slate-600">
            Top-right teams are loaded now and later; bottom-right are all-in contenders; top-left are rebuilding.
          </p>
        </div>

        {/* Pick inventory */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Draft pick inventory
          </h3>
          <div className="mt-2 overflow-x-auto">
            <table data-testid="pick-grid" className="w-full min-w-[420px] text-xs">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-slate-600">
                  <th className="py-1.5 pr-2">Team</th>
                  {seasons.map((s) => (
                    <th key={s} className="px-2 py-1.5">
                      {s}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rosters.map((r) => {
                  const isMe = r.roster_id === myRosterId;
                  return (
                    <tr key={r.roster_id} className={`border-t border-slate-800/50 ${isMe ? "bg-emerald-500/5" : ""}`}>
                      <td className={`py-1.5 pr-2 ${isMe ? "font-semibold text-emerald-300" : "text-slate-300"}`}>
                        {(nameById.get(r.roster_id) ?? "").slice(0, 16)}
                      </td>
                      {seasons.map((season) => {
                        const owned = picks
                          .filter((p) => p.ownerRosterId === r.roster_id && p.season === season)
                          .sort((a, b) => a.round - b.round);
                        return (
                          <td key={season} className="px-2 py-1.5">
                            <div className="flex flex-wrap gap-1">
                              {owned.map((p) => (
                                <span
                                  key={`${p.round}-${p.originalRosterId}`}
                                  title={pickLabel(p, nameById)}
                                  className={`rounded px-1 py-0.5 font-mono text-[10px] ${
                                    p.round === 1
                                      ? "bg-emerald-500/20 text-emerald-300"
                                      : p.round === 2
                                        ? "bg-sky-500/15 text-sky-300"
                                        : "bg-slate-800 text-slate-400"
                                  } ${p.originalRosterId !== p.ownerRosterId ? "ring-1 ring-indigo-400/40" : ""}`}
                                >
                                  {p.round}
                                </span>
                              ))}
                              {owned.length === 0 && <span className="text-slate-700">—</span>}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-slate-600">
            Numbers are rounds ({ROOKIE_DRAFT_ROUNDS} rounds tracked). Outlined chips were acquired via trade.
          </p>
        </div>
      </div>

      {/* Rookie watchlist */}
      <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Rookie watchlist
        </h3>
        <div data-testid="rookie-watchlist" className="mt-2 divide-y divide-slate-800/60">
          {rookies.map(({ player, value, rosteredBy }) => (
            <div key={player.sleeperId} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <PlayerCell player={player} playerId={player.sleeperId} currentWeek={state.week} />
              </div>
              <span className="shrink-0 text-xs">
                {rosteredBy === null ? (
                  <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-medium text-emerald-300">
                    Free agent
                  </span>
                ) : rosteredBy === myRosterId ? (
                  <span className="text-emerald-400">my roster</span>
                ) : (
                  <span className="text-slate-500">{nameById.get(rosteredBy)}</span>
                )}
              </span>
              <ValueChip value={value} max={rookies[0]?.value ?? 1} />
            </div>
          ))}
          {rookies.length === 0 && (
            <p className="py-3 text-sm text-slate-600">No valued rookies found.</p>
          )}
        </div>
        {!rosteredIds.size && null}
      </div>
    </div>
  );
}
