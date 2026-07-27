"use client";

import { useMemo, useState } from "react";
import DataSourceBanner from "@/components/DataSourceBanner";
import { PositionBadge } from "@/components/players/PlayerRow";
import { starterSlots } from "@/lib/analysis/rosterStrength";
import {
  evaluateTrade,
  FitNote,
  TradeAsset,
} from "@/lib/analysis/trade";
import { LeagueBundle, teamName } from "@/lib/leagueBundle";
import { useSleeperUser } from "@/lib/hooks/useSleeperUser";
import { playerValue, ValueSource } from "@/lib/values/engine";
import { pickBucket, pickLabel, pickValue } from "@/lib/values/picks";

interface AssetOption extends TradeAsset {
  search: string;
}

export default function TradeBuilder({ bundle }: { bundle: LeagueBundle }) {
  const { user } = useSleeperUser();
  const { leagueConfig, rosters, users, players, valueContext, picks, pickValues, state, teamAnalytics } = bundle;

  const myRosterId =
    user?.rosterIdByLeague?.[leagueConfig.id] ??
    rosters.find((r) => r.owner_id === user?.userId)?.roster_id ??
    rosters[0]?.roster_id;

  const [teamA, setTeamA] = useState<number>(myRosterId);
  const [teamB, setTeamB] = useState<number>(
    rosters.find((r) => r.roster_id !== myRosterId)?.roster_id ?? myRosterId
  );
  const [source, setSource] = useState<ValueSource>(bundle.defaultSource);
  const [sendA, setSendA] = useState<TradeAsset[]>([]);
  const [sendB, setSendB] = useState<TradeAsset[]>([]);

  const teamNameById = useMemo(
    () => new Map(rosters.map((r) => [r.roster_id, teamName(users, r)])),
    [rosters, users]
  );

  const valueOf = useMemo(
    () => (p: (typeof players)[string]) => playerValue(p, leagueConfig, source, valueContext),
    [leagueConfig, source, valueContext]
  );

  const optionsFor = (rosterId: number): AssetOption[] => {
    const roster = rosters.find((r) => r.roster_id === rosterId);
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
        search: p.name.toLowerCase(),
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
          value: pickValue(
            pickValues,
            p.season,
            p.round,
            pickBucket(p, rosters, state.season),
            state.season
          ),
          search: label.toLowerCase(),
        };
      })
      .sort((a, b) => b.value - a.value);
    return [...playerOptions, ...pickOptions];
  };

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
      { rosterId: teamA, assets: sendA },
      { rosterId: teamB, assets: sendB },
      { a: teamNameById.get(teamA) ?? "Team A", b: teamNameById.get(teamB) ?? "Team B" },
      { a: fitFor(teamA, sendB, sendA), b: fitFor(teamB, sendA, sendB) }
    );
  }, [sendA, sendB, teamA, teamB, bundle.league.roster_positions, leagueConfig, players, valueOf, rosters, teamAnalytics, teamNameById]);

  const sideColumn = (
    label: "A" | "B",
    rosterId: number,
    setRoster: (id: number) => void,
    sent: TradeAsset[],
    setSent: (a: TradeAsset[]) => void
  ) => (
    <SideColumn
      key={label}
      side={label}
      rosterId={rosterId}
      myRosterId={myRosterId}
      rosters={rosters.map((r) => ({ id: r.roster_id, name: teamNameById.get(r.roster_id)! }))}
      onRosterChange={(id) => {
        setRoster(id);
        setSent([]);
      }}
      options={optionsFor(rosterId)}
      sent={sent}
      setSent={setSent}
    />
  );

  return (
    <div className="mx-auto max-w-5xl">
      <DataSourceBanner source={bundle.source} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Trade Analyzer</h1>
          <p className="mt-1 text-sm text-slate-500">
            {leagueConfig.label} · values reflect {leagueConfig.isDynasty ? "dynasty superflex" : "redraft (win-now)"} market
            {" · "}TEs get a TEP adjustment
          </p>
        </div>
        {leagueConfig.isDynasty ? (
          <div className="flex overflow-hidden rounded-lg border border-slate-700 text-xs">
            {(["fc", "ktc", "blend"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSource(s)}
                className={`px-3 py-1.5 font-medium ${
                  source === s ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-900 text-slate-400 hover:text-slate-200"
                }`}
              >
                {s === "fc" ? "FantasyCalc" : s === "ktc" ? "KeepTradeCut" : "Blend"}
              </button>
            ))}
          </div>
        ) : (
          <span className="text-[11px] text-slate-600">FantasyCalc redraft values (KTC has no redraft market)</span>
        )}
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {sideColumn("A", teamA, setTeamA, sendA, setSendA)}
        {sideColumn("B", teamB, setTeamB, sendB, setSendB)}
      </div>

      {evaluation && (
        <div data-testid="verdict-panel" className="mt-6 rounded-xl border border-slate-700 bg-slate-900/70 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-100">{evaluation.verdict}</h2>
            <span className="text-xs text-slate-500">
              adjusted gap {Math.round(evaluation.deltaPct)}% · consolidation-weighted
            </span>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {([
              ["A", teamA, evaluation.a, sendB, evaluation.b],
              ["B", teamB, evaluation.b, sendA, evaluation.a],
            ] as const).map(([side, rosterId, sideEval, receives, otherEval]) => {
              const receivesTotal = otherEval.adjTotal;
              const max = Math.max(evaluation.a.adjTotal, evaluation.b.adjTotal, 1);
              return (
                <div key={side} className="rounded-lg bg-slate-800/50 p-4">
                  <div className="flex items-baseline justify-between">
                    <span className="font-medium text-slate-200">{teamNameById.get(rosterId)}</span>
                    <span className="font-mono text-sm text-slate-300">
                      receives {Math.round(receivesTotal).toLocaleString()}
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
                        <span className="font-mono">{a.value.toLocaleString()}</span>
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
  myRosterId,
  rosters,
  onRosterChange,
  options,
  sent,
  setSent,
}: {
  side: "A" | "B";
  rosterId: number;
  myRosterId: number;
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
    .filter((o) => o.search.includes(query.toLowerCase()))
    .slice(0, 8);

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
          {rosters.map((r) => (
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
            </span>
            <span className="flex items-center gap-2">
              <span className="font-mono text-xs text-slate-400">{a.value.toLocaleString()}</span>
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
        placeholder="Search players & picks…"
        className="mt-2 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-200 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
      />
      <ul className="mt-1.5 flex flex-col">
        {filtered.map((o) => (
          <li key={o.id}>
            <button
              onClick={() => {
                setSent([...sent, o]);
                setQuery("");
              }}
              className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-sm text-slate-300 hover:bg-slate-800"
            >
              <span className="flex items-center gap-2">
                {o.kind === "player" && o.position ? (
                  <PositionBadge position={o.position} />
                ) : (
                  <span className="inline-flex w-9 justify-center rounded bg-indigo-500/15 px-1 py-0.5 text-[11px] font-semibold text-indigo-300">
                    PICK
                  </span>
                )}
                {o.label}
              </span>
              <span className="font-mono text-xs text-slate-500">{o.value.toLocaleString()}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
