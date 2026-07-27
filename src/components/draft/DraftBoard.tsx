"use client";

import { useMemo } from "react";
import DataSourceBanner from "@/components/DataSourceBanner";
import { PlayerCell, ValueChip } from "@/components/players/PlayerRow";
import { draftSlots, formatPick } from "@/lib/analysis/draftBoard";
import {
  CORE_POSITIONS,
  positionalStrength,
  starterSlots,
} from "@/lib/analysis/rosterStrength";
import { LeagueBundle, teamName } from "@/lib/leagueBundle";
import { useSleeperUser } from "@/lib/hooks/useSleeperUser";
import { CanonicalPlayer } from "@/lib/players/canonical";
import { SleeperDraft, SleeperDraftPick } from "@/lib/sleeper/types";
import { playerValue, trend30 } from "@/lib/values/engine";

export default function DraftBoard({
  bundle,
  draft,
  draftPicks,
}: {
  bundle: LeagueBundle;
  draft: SleeperDraft | null;
  draftPicks: SleeperDraftPick[];
}) {
  const { user } = useSleeperUser();
  const { leagueConfig, league, rosters, users, players, valueContext, picks, state } = bundle;

  const myRosterId =
    user?.rosterIdByLeague?.[leagueConfig.id] ??
    rosters.find((r) => r.owner_id === user?.userId)?.roster_id ??
    rosters[0]?.roster_id;

  const valueOf = useMemo(
    () => (p: CanonicalPlayer) => playerValue(p, leagueConfig, bundle.defaultSource, valueContext),
    [leagueConfig, bundle.defaultSource, valueContext]
  );

  const slots = useMemo(
    () => draftSlots(rosters, draft?.draft_order ?? null),
    [rosters, draft]
  );
  const draftSeason = draft?.season ?? String(parseInt(state.season, 10) + 1);

  const myPicks = useMemo(
    () =>
      picks
        .filter((p) => p.ownerRosterId === myRosterId && p.season === draftSeason)
        .map((p) => ({
          pick: p,
          label: formatPick(p.round, slots.get(p.originalRosterId) ?? 0),
          via:
            p.originalRosterId !== p.ownerRosterId
              ? teamName(users, rosters.find((r) => r.roster_id === p.originalRosterId)!)
              : null,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [picks, myRosterId, draftSeason, slots, users, rosters]
  );

  const draftedBy = useMemo(() => {
    const map = new Map<string, { pickNo: number; rosterId: number | null }>();
    for (const p of draftPicks) map.set(p.player_id, { pickNo: p.pick_no, rosterId: p.roster_id });
    return map;
  }, [draftPicks]);

  const rookies = useMemo(() => {
    const posCounts: Record<string, number> = {};
    return Object.values(players)
      .filter((p) => p.yearsExp === 0)
      .map((p) => ({
        player: p,
        value: valueOf(p),
        trend: trend30(p, leagueConfig),
        rosteredBy: rosters.find((r) => r.players?.includes(p.sleeperId))?.roster_id ?? null,
        drafted: draftedBy.get(p.sleeperId) ?? null,
      }))
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value)
      .map((r) => {
        posCounts[r.player.position] = (posCounts[r.player.position] ?? 0) + 1;
        return { ...r, posRank: posCounts[r.player.position] };
      });
  }, [players, valueOf, leagueConfig, rosters, draftedBy]);

  // My weak positions for BPA-vs-need context.
  const needs = useMemo(() => {
    const slotCfg = starterSlots(league.roster_positions);
    const mine = rosters.find((r) => r.roster_id === myRosterId);
    if (!mine) return [];
    const byRoster = rosters.map((r) => positionalStrength(r.players ?? [], players, valueOf, slotCfg));
    const mineStrength = positionalStrength(mine.players ?? [], players, valueOf, slotCfg);
    return CORE_POSITIONS.filter((pos) => {
      const max = Math.max(...byRoster.map((s) => s[pos]), 1);
      return mineStrength[pos] / max < 0.45;
    });
  }, [league.roster_positions, rosters, myRosterId, players, valueOf]);

  const nameById = useMemo(
    () => new Map(rosters.map((r) => [r.roster_id, teamName(users, r)])),
    [rosters, users]
  );

  return (
    <div className="mx-auto max-w-5xl">
      <DataSourceBanner source={bundle.source} valuesDegraded={bundle.valuesDegraded} />

      <h1 className="text-2xl font-bold text-slate-100">Rookie Draft Board</h1>
      <p className="mt-1 text-sm text-slate-500">
        {leagueConfig.label} · {draftSeason} class ranked by{" "}
        {leagueConfig.isDynasty ? "dynasty SF" : "redraft"} market value
        {draft?.status === "pre_draft" && " · draft not started"}
        {draft?.status === "complete" && " · draft complete"}
      </p>

      <div data-testid="my-picks" className="mt-4 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          My {draftSeason} picks{" "}
          {draft?.draft_order ? "(official draft order)" : "(order estimated from standings)"}
        </h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {myPicks.map(({ pick, label, via }) => (
            <span
              key={`${pick.round}-${pick.originalRosterId}`}
              className={`rounded-md px-2.5 py-1 font-mono text-sm ${
                pick.round === 1
                  ? "bg-emerald-500/20 text-emerald-300"
                  : "bg-slate-800 text-slate-300"
              }`}
              title={via ? `via ${via}` : "native pick"}
            >
              {label}
              {via && <span className="ml-1 text-[10px] text-slate-500">via {via.slice(0, 10)}</span>}
            </span>
          ))}
          {myPicks.length === 0 && (
            <span className="text-sm text-slate-600">
              No {draftSeason} picks — check the Strategy page pick grid.
            </span>
          )}
        </div>
        {needs.length > 0 && (
          <p className="mt-2 text-xs text-amber-300">
            Your thinnest positions: {needs.join(", ")} — weigh them against best-player-available.
          </p>
        )}
      </div>

      <div data-testid="rookie-board" className="mt-5 divide-y divide-slate-800/60 rounded-xl border border-slate-800 bg-slate-900/50">
        {rookies.map(({ player, value, trend, rosteredBy, drafted, posRank }, i) => (
          <div
            key={player.sleeperId}
            className={`flex items-center gap-3 px-3 py-2 ${drafted ? "opacity-40" : ""}`}
          >
            <span className="w-6 shrink-0 text-right font-mono text-xs text-slate-500">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <PlayerCell player={player} playerId={player.sleeperId} currentWeek={state.week} />
            </div>
            <span className="shrink-0 rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
              {player.position}
              {posRank}
            </span>
            <span
              className={`w-14 shrink-0 text-right font-mono text-xs ${
                trend > 0 ? "text-emerald-400" : trend < 0 ? "text-rose-400" : "text-slate-600"
              }`}
            >
              {trend > 0 ? "▲" : trend < 0 ? "▼" : ""}
              {Math.abs(trend).toLocaleString()}
            </span>
            <span className="w-32 shrink-0 text-right text-xs">
              {drafted ? (
                <span className="text-slate-500">
                  #{drafted.pickNo} {drafted.rosterId !== null ? nameById.get(drafted.rosterId) : ""}
                </span>
              ) : rosteredBy === null ? (
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
          <p className="px-3 py-3 text-sm text-slate-600">No valued rookies in the player pool.</p>
        )}
      </div>
    </div>
  );
}
