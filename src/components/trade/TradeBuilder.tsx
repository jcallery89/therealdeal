"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import DataSourceBanner from "@/components/DataSourceBanner";
import RosterNotice from "@/components/RosterNotice";
import { PositionBadge } from "@/components/players/PlayerRow";
import { starterSlots } from "@/lib/analysis/rosterStrength";
import {
  evaluateTrade,
  FitNote,
  TradeAsset,
} from "@/lib/analysis/trade";
import { LeagueBundle, teamName } from "@/lib/leagueBundle";
import { useMyRoster, useValueOf } from "@/lib/hooks/useMyRoster";
import ValueModePicker from "@/components/ValueModePicker";
import {
  draftPickValue,
  HORIZON_LABELS,
  HORIZON_SOURCES,
  playerValue,
  SOURCE_LABELS,
  sourceAvailable,
  ValueMode,
} from "@/lib/values/engine";
import { pickLabel } from "@/lib/values/picks";
import { InjuryTag } from "@/components/players/PlayerRow";

interface AssetOption extends TradeAsset {
  search: string;
  /** Roster designation shown next to the name (taxi squad / injured reserve). */
  tag?: "TAXI" | "IR";
}

export interface TradePrefill {
  teamA: number | null;
  teamB: number | null;
  sendA: string[];
  sendB: string[];
  /** Value lens to open with (from the Trade Finder). */
  mode?: ValueMode | null;
}

export default function TradeBuilder({
  bundle,
  prefill = null,
}: {
  bundle: LeagueBundle;
  prefill?: TradePrefill | null;
}) {
  const { leagueConfig, league, rosters, users, players, valueContext, picks, pickValues, teamAnalytics } = bundle;
  const { user, ready, myRosterId } = useMyRoster(bundle);
  /** Side A defaults to the user's team, or the first roster if unknown. */
  const homeRosterId = myRosterId ?? rosters[0]?.roster_id;
  const firstOther = (id: number) => rosters.find((r) => r.roster_id !== id)?.roster_id ?? id;

  const [teamA, setTeamA] = useState<number>(prefill?.teamA ?? homeRosterId);
  const [teamB, setTeamB] = useState<number>(prefill?.teamB ?? firstOther(prefill?.teamA ?? homeRosterId));
  const [mode, setMode] = useState<ValueMode>(prefill?.mode ?? bundle.defaultMode);
  const [sendA, setSendA] = useState<TradeAsset[]>([]);
  const [sendB, setSendB] = useState<TradeAsset[]>([]);

  // The stored user resolves after mount; without a prefill or manual edits,
  // snap side A to the user's own team once identity is known.
  const defaultApplied = useRef(false);
  useEffect(() => {
    if (defaultApplied.current || prefill || !ready) return;
    defaultApplied.current = true;
    if (sendA.length === 0 && sendB.length === 0 && teamA !== homeRosterId) {
      setTeamA(homeRosterId);
      setTeamB(firstOther(homeRosterId));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, prefill, homeRosterId, teamA, sendA.length, sendB.length]);

  const teamNameById = useMemo(
    () => new Map(rosters.map((r) => [r.roster_id, teamName(users, r)])),
    [rosters, users]
  );

  const valueOf = useValueOf(bundle, mode);

  /** An asset's value under any lens (used for live values and the breakdown). */
  const assetValue = (asset: TradeAsset, m: ValueMode): number => {
    if (asset.kind === "player") {
      const p = players[asset.id];
      return p ? playerValue(p, leagueConfig, m, valueContext) : 0;
    }
    const pick = picks.find((x) => `${x.season}-${x.round}-${x.originalRosterId}` === asset.id);
    return pick ? draftPickValue(pick, pickValues, league.season, leagueConfig, m, valueContext) : 0;
  };
  // Sent assets are re-valued under the current lens (switching sources used
  // to leave them at the value they had when added).
  const liveA = sendA.map((a) => ({ ...a, value: assetValue(a, mode) }));
  const liveB = sendB.map((a) => ({ ...a, value: assetValue(a, mode) }));

  const optionsFor = (rosterId: number): AssetOption[] => {
    const roster = rosters.find((r) => r.roster_id === rosterId);
    const taxiSet = new Set(roster?.taxi ?? []);
    const irSet = new Set(roster?.reserve ?? []);
    // roster.players is the complete list (starters, bench, taxi, and IR).
    const playerOptions: AssetOption[] = (roster?.players ?? [])
      .map((id) => players[id])
      .filter((p) => p !== undefined)
      .map((p) => ({
        kind: "player" as const,
        id: p.sleeperId,
        label: p.name,
        value: valueOf(p),
        position: p.position,
        age: p.age,
        injury: p.outlook?.label,
        lostSeason: p.outlook?.status === "season",
        search: p.name.toLowerCase(),
        tag: taxiSet.has(p.sleeperId)
          ? ("TAXI" as const)
          : irSet.has(p.sleeperId)
            ? ("IR" as const)
            : undefined,
      }))
      .sort((a, b) => b.value - a.value);
    const pickOptions: AssetOption[] = picks
      .filter((p) => p.ownerRosterId === rosterId)
      .map((p) => {
        const label = pickLabel(p, teamNameById);
        return {
          kind: "pick" as const,
          id: `${p.season}-${p.round}-${p.originalRosterId}`,
          label,
          value: draftPickValue(p, pickValues, league.season, leagueConfig, mode, valueContext),
          search: label.toLowerCase(),
        };
      })
      .sort((a, b) => b.value - a.value);
    return [...playerOptions, ...pickOptions];
  };

  // Resolve prefilled asset ids into full assets once (values via optionsFor).
  const prefillApplied = useRef(false);
  useEffect(() => {
    if (prefillApplied.current || !prefill) return;
    prefillApplied.current = true;
    if (prefill.sendA.length > 0) {
      const opts = optionsFor(prefill.teamA ?? teamA);
      setSendA(opts.filter((o) => prefill.sendA.includes(o.id)));
    }
    if (prefill.sendB.length > 0) {
      const opts = optionsFor(prefill.teamB ?? teamB);
      setSendB(opts.filter((o) => prefill.sendB.includes(o.id)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const evaluation = useMemo(() => {
    if (sendA.length === 0 && sendB.length === 0) return null;
    const slots = starterSlots(bundle.league.roster_positions);
    const fitFor = (rosterId: number, incoming: TradeAsset[], outgoing: TradeAsset[]) => {
      const roster = rosters.find((r) => r.roster_id === rosterId);
      if (!roster) return null;
      return {
        league: leagueConfig,
        slots,
        players,
        valueOf,
        roster: {
          rosterId,
          teamName: teamNameById.get(rosterId) ?? `Team ${rosterId}`,
          playerIds: roster.players ?? [],
          contenderScore: teamAnalytics.find((t) => t.rosterId === rosterId)?.contenderScore,
        },
        incoming,
        outgoing,
      };
    };
    return evaluateTrade(
      { rosterId: teamA, assets: liveA },
      { rosterId: teamB, assets: liveB },
      { a: teamNameById.get(teamA) ?? "Team A", b: teamNameById.get(teamB) ?? "Team B" },
      { a: fitFor(teamA, liveB, liveA), b: fitFor(teamB, liveA, liveB) }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendA, sendB, teamA, teamB, mode, bundle.league.roster_positions, leagueConfig, players, valueOf, rosters, teamAnalytics, teamNameById]);

  // What each individual source thinks of the same trade.
  const breakdown = useMemo(() => {
    if (sendA.length === 0 && sendB.length === 0) return [];
    const names = { a: teamNameById.get(teamA) ?? "Team A", b: teamNameById.get(teamB) ?? "Team B" };
    return HORIZON_SOURCES[mode.horizon]
      .filter((s) => sourceAvailable(mode.horizon, s, valueContext))
      .map((s) => {
        const m: ValueMode = { horizon: mode.horizon, source: s };
        const revalue = (list: TradeAsset[]) => list.map((a) => ({ ...a, value: assetValue(a, m) }));
        const e = evaluateTrade(
          { rosterId: teamA, assets: revalue(sendA) },
          { rosterId: teamB, assets: revalue(sendB) },
          names
        );
        return { source: s, verdict: e.verdict, favors: e.favors, deltaPct: e.deltaPct };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendA, sendB, teamA, teamB, mode.horizon, valueContext, teamNameById]);
  const agreement = (() => {
    if (breakdown.length < 2) return null;
    const calls = new Set(breakdown.map((b) => b.favors ?? "fair"));
    return calls.size === 1
      ? `All ${breakdown.length} sources agree`
      : "Sources disagree — treat this one as a judgment call";
  })();

  const sideColumn = (
    label: "A" | "B",
    rosterId: number,
    otherRosterId: number,
    setRoster: (id: number) => void,
    sent: TradeAsset[],
    setSent: (a: TradeAsset[]) => void
  ) => (
    <SideColumn
      key={label}
      side={label}
      rosterId={rosterId}
      excludeRosterId={otherRosterId}
      myRosterId={myRosterId}
      rosters={rosters.map((r) => ({ id: r.roster_id, name: teamNameById.get(r.roster_id)! }))}
      onRosterChange={(id) => {
        setRoster(id);
        setSent([]);
      }}
      options={optionsFor(rosterId)}
      sent={sent.map((a) => ({ ...a, value: assetValue(a, mode) }))}
      setSent={(next) => setSent(next)}
    />
  );

  return (
    <div className="mx-auto max-w-5xl">
      <DataSourceBanner source={bundle.source} valuesUnavailable={bundle.valuesUnavailable} issues={bundle.sourceIssues} />
      <RosterNotice ready={ready} user={user} myRosterId={myRosterId} leagueLabel={leagueConfig.label} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Trade Analyzer</h1>
          <p className="mt-1 text-sm text-slate-500">
            {leagueConfig.label} · {HORIZON_LABELS[mode.horizon].toLowerCase()}{" "}
            {mode.horizon === "dynasty" ? "superflex" : mode.horizon === "keeper" ? "1QB" : ""} values ·{" "}
            {SOURCE_LABELS[mode.source]} · TEs get a TEP adjustment
          </p>
        </div>
        <ValueModePicker league={leagueConfig} ctx={valueContext} mode={mode} onChange={setMode} />
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {sideColumn("A", teamA, teamB, setTeamA, sendA, setSendA)}
        {sideColumn("B", teamB, teamA, setTeamB, sendB, setSendB)}
      </div>

      {evaluation && (
        <div data-testid="verdict-panel" className="mt-6 rounded-xl border border-slate-700 bg-slate-900/70 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-100">{evaluation.verdict}</h2>
            <span className="text-xs text-slate-500">
              adjusted gap {Math.round(evaluation.deltaPct)}% · consolidation-weighted
            </span>
          </div>

          {breakdown.length > 1 && (
            <div data-testid="source-breakdown" className="mt-3 rounded-lg bg-slate-800/40 px-3 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                By source · {agreement}
              </div>
              <ul className="mt-1 grid gap-x-4 gap-y-0.5 text-xs sm:grid-cols-2">
                {breakdown.map((b) => (
                  <li key={b.source} className="flex justify-between gap-2">
                    <span className="text-slate-400">{SOURCE_LABELS[b.source]}</span>
                    <span className={b.favors ? "text-slate-200" : "text-emerald-300"}>
                      {b.verdict}
                      {b.favors ? ` (${Math.round(b.deltaPct)}%)` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {([
              ["A", teamA, evaluation.a, liveB, evaluation.b],
              ["B", teamB, evaluation.b, liveA, evaluation.a],
            ] as const).map(([side, rosterId, sideEval, receives, otherEval]) => {
              const receivesTotal = otherEval.adjTotal;
              const max = Math.max(evaluation.a.adjTotal, evaluation.b.adjTotal, 1);
              return (
                <div key={side} className="rounded-lg bg-slate-800/50 p-4">
                  <div className="flex items-baseline justify-between">
                    <span className="font-medium text-slate-200">{teamNameById.get(rosterId)}</span>
                    <span className="font-mono text-sm text-slate-300">
                      receives {Math.round(receivesTotal).toLocaleString("en-US")}
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-700">
                    <div
                      className={`h-full ${evaluation.favors === side ? "bg-emerald-500" : "bg-sky-600"}`}
                      style={{ width: `${(receivesTotal / max) * 100}%` }}
                    />
                  </div>
                  <ul className="mt-3 flex flex-col gap-1">
                    {receives.map((a) => (
                      <li key={a.id} className="flex justify-between text-xs text-slate-400">
                        <span>+ {a.label}</span>
                        <span className="font-mono">{a.value.toLocaleString("en-US")}</span>
                      </li>
                    ))}
                    {receives.length === 0 && <li className="text-xs text-slate-600">receives nothing</li>}
                  </ul>
                  <FitNotes notes={sideEval.fit} />
                </div>
              );
            })}
          </div>
        </div>
      )}
      {!evaluation && (
        <p className="mt-8 text-center text-sm text-slate-600">
          Add players or picks to each side to evaluate a trade.
        </p>
      )}
    </div>
  );
}

function FitNotes({ notes }: { notes: FitNote[] }) {
  if (notes.length === 0) return null;
  return (
    <ul className="mt-3 flex flex-col gap-1 border-t border-slate-700/60 pt-2">
      {notes.map((n, i) => (
        <li
          key={i}
          className={`text-xs ${
            n.tone === "good" ? "text-emerald-400" : n.tone === "bad" ? "text-rose-400" : "text-slate-400"
          }`}
        >
          {n.tone === "good" ? "▲" : n.tone === "bad" ? "▼" : "•"} {n.text}
        </li>
      ))}
    </ul>
  );
}

function SideColumn({
  side,
  rosterId,
  excludeRosterId,
  myRosterId,
  rosters,
  onRosterChange,
  options,
  sent,
  setSent,
}: {
  side: "A" | "B";
  rosterId: number;
  /** The other side's team — a team can't trade with itself. */
  excludeRosterId: number;
  myRosterId: number | null;
  rosters: { id: number; name: string }[];
  onRosterChange: (id: number) => void;
  options: AssetOption[];
  sent: TradeAsset[];
  setSent: (a: TradeAsset[]) => void;
}) {
  const [query, setQuery] = useState("");
  const sentIds = new Set(sent.map((a) => a.id));
  const filtered = options
    .filter((o) => !sentIds.has(o.id))
    .filter((o) => o.search.includes(query.toLowerCase()));

  // Full asset browser: every rostered player grouped by position (taxi/IR
  // tagged inline), then the complete pick inventory.
  const POSITION_ORDER = ["QB", "RB", "WR", "TE", "K", "DEF"];
  const groups: { title: string; items: AssetOption[] }[] = [
    ...POSITION_ORDER.map((pos) => ({
      title: pos,
      items: filtered.filter((o) => o.kind === "player" && o.position === pos),
    })),
    {
      title: "Other",
      items: filtered.filter(
        (o) => o.kind === "player" && !POSITION_ORDER.includes(o.position ?? "")
      ),
    },
    { title: "Draft picks", items: filtered.filter((o) => o.kind === "pick") },
  ].filter((g) => g.items.length > 0);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4" data-testid={`trade-side-${side}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Side {side} sends
        </span>
        <select
          aria-label={`Side ${side} team`}
          value={rosterId}
          onChange={(e) => onRosterChange(parseInt(e.target.value, 10))}
          className="max-w-[60%] rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200"
        >
          {rosters.filter((r) => r.id !== excludeRosterId).map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
              {r.id === myRosterId ? " (me)" : ""}
            </option>
          ))}
        </select>
      </div>

      <ul className="mt-3 flex min-h-10 flex-col gap-1.5">
        {sent.map((a) => (
          <li key={a.id} className="flex items-center justify-between rounded-md bg-slate-800/70 px-2.5 py-1.5">
            <span className="flex items-center gap-2 text-sm text-slate-200">
              {a.kind === "player" && a.position ? (
                <PositionBadge position={a.position} />
              ) : (
                <span className="inline-flex w-9 justify-center rounded bg-indigo-500/15 px-1 py-0.5 text-[11px] font-semibold text-indigo-300">
                  PICK
                </span>
              )}
              {a.label}
              {a.injury && <InjuryTag label={a.injury} />}
            </span>
            <span className="flex items-center gap-2">
              <span className="font-mono text-xs text-slate-400">{a.value.toLocaleString("en-US")}</span>
              <button
                aria-label={`Remove ${a.label}`}
                onClick={() => setSent(sent.filter((x) => x.id !== a.id))}
                className="text-slate-500 hover:text-rose-400"
              >
                ✕
              </button>
            </span>
          </li>
        ))}
      </ul>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Filter players & picks…"
        className="mt-2 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-200 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
      />
      <div
        className="mt-1.5 max-h-80 overflow-y-auto rounded-md border border-slate-800/70"
        data-testid={`asset-list-${side}`}
      >
        {groups.map((group) => (
          <div key={group.title}>
            <div className="sticky top-0 bg-slate-900 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              {group.title}
            </div>
            <ul className="flex flex-col">
              {group.items.map((o) => (
                <li key={o.id}>
                  <button
                    onClick={() => {
                      setSent([...sent, o]);
                      setQuery("");
                    }}
                    className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-sm text-slate-300 hover:bg-slate-800"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      {o.kind === "player" && o.position ? (
                        <PositionBadge position={o.position} />
                      ) : (
                        <span className="inline-flex w-9 shrink-0 justify-center rounded bg-indigo-500/15 px-1 py-0.5 text-[11px] font-semibold text-indigo-300">
                          PICK
                        </span>
                      )}
                      <span className="truncate">{o.label}</span>
                      {o.injury && o.injury !== o.tag && <InjuryTag label={o.injury} />}
                      {o.tag && (
                        <span
                          className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold ${
                            o.tag === "TAXI"
                              ? "bg-violet-500/15 text-violet-300"
                              : "bg-rose-500/15 text-rose-300"
                          }`}
                        >
                          {o.tag}
                        </span>
                      )}
                    </span>
                    <span className="font-mono text-xs text-slate-500">{o.value.toLocaleString("en-US")}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="px-2 py-3 text-xs text-slate-600">No assets match that filter.</p>
        )}
      </div>
    </div>
  );
}
