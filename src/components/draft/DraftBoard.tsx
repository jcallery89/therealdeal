"use client";

import { useMemo } from "react";
import DataSourceBanner from "@/components/DataSourceBanner";
import { PlayerCell, ValueChip } from "@/components/players/PlayerRow";
import RosterNotice from "@/components/RosterNotice";
import TeamPicker from "@/components/TeamPicker";
import { draftSlots, formatPick } from "@/lib/analysis/draftBoard";
import {
  CORE_POSITIONS,
  positionalStrength,
  starterSlots,
} from "@/lib/analysis/rosterStrength";
import { useMyRoster, useValueOf } from "@/lib/hooks/useMyRoster";
import { LeagueBundle, teamName } from "@/lib/leagueBundle";
import { SleeperDraftPick } from "@/lib/sleeper/types";
import { trend30 } from "@/lib/values/engine";

type DraftPhase = "upcoming" | "live" | "complete" | "none";

export default function DraftBoard({
  bundle,
  draftPicks,
}: {
  bundle: LeagueBundle;
  draftPicks: SleeperDraftPick[];
}) {
  const { leagueConfig, league, rosters, users, players, picks, pickSeasons, draft, state } = bundle;
  const { user, ready, myRosterId, viewRosterId, setViewRosterId } = useMyRoster(bundle);
  const valueOf = useValueOf(bundle);

  const phase: DraftPhase = !draft
    ? "none"
    : draft.status === "complete"
      ? "complete"
      : draft.status === "drafting" || draft.status === "paused"
        ? "live"
        : "upcoming";

  // The draft whose picks we show: the pending one, or next year's once done.
  const nextSeason = pickSeasons[0];
  const officialOrder =
    draft !== null && draft.season === nextSeason ? draft.draft_order : null;
  const slots = useMemo(() => draftSlots(rosters, officialOrder), [rosters, officialOrder]);

  const nameById = useMemo(
    () => new Map(rosters.map((r) => [r.roster_id, teamName(users, r)])),
    [rosters, users]
  );

  const viewedPicks = useMemo(
    () =>
      picks
        .filter((p) => p.ownerRosterId === viewRosterId && p.season === nextSeason)
        .sort(
          (a, b) =>
            a.round - b.round ||
            (slots.get(a.originalRosterId) ?? 0) - (slots.get(b.originalRosterId) ?? 0)
        )
        .map((p) => ({
          pick: p,
          label: formatPick(p.round, slots.get(p.originalRosterId) ?? 0),
          via: p.originalRosterId !== p.ownerRosterId ? nameById.get(p.originalRosterId) ?? null : null,
        })),
    [picks, viewRosterId, nextSeason, slots, nameById]
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

  const freeAgentRookies = rookies.filter((r) => r.rosteredBy === null).length;

  // The viewed team's weak positions, for BPA-vs-need context.
  const needs = useMemo(() => {
    const slotCfg = starterSlots(league.roster_positions);
    const viewed = rosters.find((r) => r.roster_id === viewRosterId);
    if (!viewed) return [];
    const byRoster = rosters.map((r) => positionalStrength(r.players ?? [], players, valueOf, slotCfg));
    const strength = positionalStrength(viewed.players ?? [], players, valueOf, slotCfg);
    return CORE_POSITIONS.filter((pos) => {
      const max = Math.max(...byRoster.map((s) => s[pos]), 1);
      return strength[pos] / max < 0.45;
    });
  }, [league.roster_positions, rosters, viewRosterId, players, valueOf]);

  const status =
    phase === "complete"
      ? `${draft!.season} draft complete — free-agent rookies are stash candidates`
      : phase === "live"
        ? `${draft!.season} draft in progress — drafted players are grayed out`
        : phase === "upcoming"
          ? `${draft!.season} draft not started`
          : "no Sleeper draft found for this league yet";

  const viewedIsMine = viewRosterId !== null && viewRosterId === myRosterId;

  return (
    <div className="mx-auto max-w-5xl">
      <DataSourceBanner source={bundle.source} valueSources={bundle.valueSources} />
      <RosterNotice ready={ready} user={user} myRosterId={myRosterId} leagueLabel={leagueConfig.label} />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Rookie Draft Board</h1>
          <p className="mt-1 text-sm text-slate-500" data-testid="draft-status">
            {leagueConfig.label} · ranked by {leagueConfig.isDynasty ? "dynasty SF" : "redraft"} market value
            · {status}
          </p>
        </div>
        {viewRosterId !== null && (
          <TeamPicker
            rosters={rosters}
            users={users}
            value={viewRosterId}
            onChange={setViewRosterId}
            myRosterId={myRosterId}
          />
        )}
      </div>

      <div data-testid="my-picks" className="mt-4 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          {viewedIsMine ? "My" : `${nameById.get(viewRosterId ?? -1) ?? "Team"}:`} {nextSeason} picks{" "}
          {officialOrder ? "(official draft order)" : "(order estimated from current standings)"}
        </h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {viewedPicks.map(({ pick, label, via }) => (
            <span
              key={`${pick.round}-${pick.originalRosterId}`}
              className={`rounded-md px-2.5 py-1 font-mono text-sm ${
                pick.round === 1 ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-800 text-slate-300"
              }`}
              title={via ? `via ${via}` : "native pick"}
            >
              {label}
              {via && <span className="ml-1 text-[10px] text-slate-500">via {via.slice(0, 10)}</span>}
            </span>
          ))}
          {viewedPicks.length === 0 && (
            <span className="text-sm text-slate-600">No {nextSeason} picks — see the Strategy pick grid.</span>
          )}
        </div>
        {needs.length > 0 && (
          <p className="mt-2 text-xs text-amber-300">
            Thinnest positions: {needs.join(", ")} — weigh them against best-player-available.
          </p>
        )}
        {phase === "complete" && freeAgentRookies > 0 && (
          <p className="mt-1 text-xs text-emerald-300">
            {freeAgentRookies} valued rookie{freeAgentRookies === 1 ? " is" : "s are"} still a free agent in this
            league.
          </p>
        )}
      </div>

      <div
        data-testid="rookie-board"
        className="mt-5 divide-y divide-slate-800/60 rounded-xl border border-slate-800 bg-slate-900/50"
      >
        {rookies.map(({ player, value, trend, rosteredBy, drafted, posRank }, i) => (
          <div
            key={player.sleeperId}
            className={`flex items-center gap-3 px-3 py-2 ${phase === "live" && drafted ? "opacity-40" : ""}`}
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
              className={`hidden w-14 shrink-0 text-right font-mono text-xs sm:inline ${
                trend > 0 ? "text-emerald-400" : trend < 0 ? "text-rose-400" : "text-slate-600"
              }`}
            >
              {trend > 0 ? "▲" : trend < 0 ? "▼" : ""}
              {Math.abs(trend).toLocaleString("en-US")}
            </span>
            <span className="w-32 shrink-0 text-right text-xs">
              {rosteredBy === null ? (
                <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-medium text-emerald-300">
                  Free agent
                </span>
              ) : (
                <span className={rosteredBy === myRosterId ? "text-emerald-400" : "text-slate-500"}>
                  {drafted ? `#${drafted.pickNo} · ` : ""}
                  {rosteredBy === myRosterId ? "my roster" : nameById.get(rosteredBy)}
                </span>
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
