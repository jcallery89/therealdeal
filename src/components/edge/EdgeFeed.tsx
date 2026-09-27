"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import DataSourceBanner from "@/components/DataSourceBanner";
import RosterNotice from "@/components/RosterNotice";
import TeamPicker from "@/components/TeamPicker";
import { PositionBadge } from "@/components/players/PlayerRow";
import { KIND_LABELS } from "@/lib/edge/insights";
import type { EdgeInputs, Insight, InsightKind } from "@/lib/edge/types";
import { useMyRoster } from "@/lib/hooks/useMyRoster";
import { LeagueBundle } from "@/lib/leagueBundle";
import type { CanonicalPlayer } from "@/lib/players/canonical";

const KIND_STYLES: Record<InsightKind, string> = {
  injury: "bg-rose-500/15 text-rose-300",
  lineup: "bg-amber-500/15 text-amber-300",
  waiver: "bg-emerald-500/15 text-emerald-300",
  buy: "bg-sky-500/15 text-sky-300",
  sell: "bg-violet-500/15 text-violet-300",
  rival: "bg-orange-500/15 text-orange-300",
  stash: "bg-teal-500/15 text-teal-300",
};

const FILTERS: { key: string; label: string; kinds: InsightKind[] }[] = [
  { key: "all", label: "All", kinds: ["injury", "lineup", "waiver", "buy", "sell", "rival", "stash"] },
  { key: "lineup", label: "Lineup & injuries", kinds: ["injury", "lineup"] },
  { key: "waiver", label: "Waivers & stashes", kinds: ["waiver", "stash"] },
  { key: "trade", label: "Buy low / sell high", kinds: ["buy", "sell"] },
  { key: "rival", label: "Rival intel", kinds: ["rival"] },
];

const SOURCE_NAMES: Record<keyof EdgeInputs["health"], string> = {
  usage: "nflverse usage",
  snaps: "nflverse snaps",
  injuries: "Injury reports",
  schedule: "Schedule & Vegas lines",
  experts: "FantasyPros experts",
  projections: "Sleeper projections",
  ownership: "Sleeper ownership",
  news: "ESPN news",
};

export default function EdgeFeed({
  bundle,
  insightsByRoster,
  players,
  health,
}: {
  bundle: LeagueBundle;
  insightsByRoster: Record<number, Insight[]>;
  players: Record<string, CanonicalPlayer>;
  health: EdgeInputs["health"];
}) {
  const { leagueConfig, rosters, users, state } = bundle;
  const { user, ready, myRosterId, viewRosterId, setViewRosterId } = useMyRoster(bundle);
  const rosterId = viewRosterId ?? rosters[0]?.roster_id;
  const [filter, setFilter] = useState("all");

  const insights = useMemo(() => insightsByRoster[rosterId] ?? [], [insightsByRoster, rosterId]);
  const active = FILTERS.find((f) => f.key === filter) ?? FILTERS[0];
  const shown = insights.filter((i) => active.kinds.includes(i.kind));
  const up = Object.entries(health).filter(([, s]) => s !== "unavailable" && s !== "stale");

  return (
    <div className="mx-auto max-w-5xl">
      <DataSourceBanner source={bundle.source} valuesUnavailable={bundle.valuesUnavailable} issues={bundle.sourceIssues} />
      <RosterNotice ready={ready} user={user} myRosterId={myRosterId} leagueLabel={leagueConfig.label} />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Edge — Week {state.week}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {leagueConfig.label} · waiver gems, buy-lows, lineup alerts and rival intel, each backed by
            multiple independent data sources
          </p>
        </div>
        <TeamPicker
          rosters={rosters}
          users={users}
          value={rosterId}
          onChange={setViewRosterId}
          myRosterId={myRosterId}
          label="Edges for"
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5" data-testid="edge-sources">
        {(Object.keys(SOURCE_NAMES) as (keyof EdgeInputs["health"])[]).map((k) => {
          const ok = health[k] !== "unavailable" && health[k] !== "stale";
          return (
            <span
              key={k}
              title={ok ? `${SOURCE_NAMES[k]}: ${health[k]}` : `${SOURCE_NAMES[k]} didn't respond — edges use the other sources`}
              className={`rounded-full px-2 py-0.5 text-[10px] ${
                ok ? "bg-emerald-500/10 text-emerald-300" : "bg-slate-800 text-slate-500 line-through"
              }`}
            >
              {SOURCE_NAMES[k]}
            </span>
          );
        })}
        <span className="px-1 text-[10px] text-slate-600">
          + FantasyCalc / DynastyProcess / KTC values · {up.length}/{Object.keys(health).length} live feeds
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => {
          const count = insights.filter((i) => f.kinds.includes(i.kind)).length;
          return (
            <button
              key={f.key}
              data-testid={`edge-filter-${f.key}`}
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                filter === f.key
                  ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300"
                  : "border-slate-700 bg-slate-900 text-slate-400 hover:text-slate-200"
              }`}
            >
              {f.label} <span className="text-slate-500">{count}</span>
            </button>
          );
        })}
      </div>

      <div data-testid="edge-feed" className="mt-4 flex flex-col gap-3">
        {shown.map((i) => (
          <div
            key={i.id}
            className={`rounded-xl border bg-slate-900/50 p-4 ${i.urgent ? "border-rose-500/40" : "border-slate-800"}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${KIND_STYLES[i.kind]}`}>
                    {KIND_LABELS[i.kind]}
                  </span>
                  {i.urgent && <span className="text-[10px] font-bold uppercase text-rose-400">Act now</span>}
                </div>
                <h3 className="mt-1.5 font-medium text-slate-100">{i.title}</h3>
                <p className="mt-0.5 text-sm text-slate-400">{i.detail}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <span className="font-mono text-xs text-slate-500" title="Priority score (0-100)">
                  {i.score}
                </span>
                {i.href && (
                  <Link
                    href={i.href}
                    className="rounded-md bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-300 hover:bg-emerald-500/25"
                  >
                    {i.href.includes("/trade?") ? "Open in analyzer →" : "Open →"}
                  </Link>
                )}
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {i.playerIds.map((id) =>
                players[id] ? (
                  <span key={id} className="inline-flex items-center gap-1 text-xs text-slate-300">
                    <PositionBadge position={players[id].position} />
                    {players[id].name}
                  </span>
                ) : null
              )}
            </div>
            <ul className="mt-2 flex flex-col gap-1 border-t border-slate-800/60 pt-2">
              {i.signals.map((s, j) => (
                <li key={j} className="flex gap-2 text-xs">
                  <span className="w-24 shrink-0 text-slate-500">{s.source}</span>
                  <span className="text-slate-300">{s.text}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {shown.length === 0 && (
          <p className="rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-6 text-center text-sm text-slate-500">
            Nothing here right now. Edges refresh as usage, injury reports, projections and markets move.
          </p>
        )}
      </div>

      <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/30 p-4 text-xs text-slate-500">
        <span className="font-medium text-slate-300">Phone alerts:</span> these same edges are pushed
        to the ntfy app on a schedule — Tuesday-night waiver rundown, Thursday/Sunday pre-kickoff
        lineup checks, and a daily sweep. Each alert is sent once. Setup is in the README.
      </div>
    </div>
  );
}
