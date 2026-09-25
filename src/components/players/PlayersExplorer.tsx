"use client";

import { useMemo, useState } from "react";
import DataSourceBanner from "@/components/DataSourceBanner";
import { PositionBadge } from "@/components/players/PlayerRow";
import RosterNotice from "@/components/RosterNotice";
import { EXPLORER_POSITIONS, PlayerRow, SortKey, sortRows } from "@/lib/analysis/playerTable";
import { useMyRoster } from "@/lib/hooks/useMyRoster";
import { LeagueBundle, teamName } from "@/lib/leagueBundle";

type Availability = "all" | "fa" | "mine" | "rostered";
const PAGE = 150;

const fmt = (n: number | null, digits = 0) =>
  n === null ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });

export default function PlayersExplorer({ bundle, rows }: { bundle: LeagueBundle; rows: PlayerRow[] }) {
  const { leagueConfig, rosters, users, state } = bundle;
  const { user, ready, myRosterId } = useMyRoster(bundle);

  const [pos, setPos] = useState<string>("ALL");
  const [avail, setAvail] = useState<Availability>("all");
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("value");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [limit, setLimit] = useState(PAGE);

  const hasStats = rows.some((r) => r.seasonPts !== null);
  const hasProj = rows.some((r) => r.proj !== null);

  const ownerName = useMemo(
    () => new Map(rosters.map((r) => [r.roster_id, teamName(users, r)])),
    [rosters, users]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = rows.filter(
      (r) =>
        (pos === "ALL" || r.position === pos) &&
        (avail === "all" ||
          (avail === "fa" && r.ownerRosterId === null) ||
          (avail === "rostered" && r.ownerRosterId !== null) ||
          (avail === "mine" && r.ownerRosterId !== null && r.ownerRosterId === myRosterId)) &&
        (!q || r.name.toLowerCase().includes(q))
    );
    return sortRows(filtered, sortKey, sortDir);
  }, [rows, pos, avail, query, sortKey, sortDir, myRosterId]);

  const setSort = (key: SortKey) => {
    if (key === sortKey) setSortDir(sortDir === "desc" ? "asc" : "desc");
    else {
      setSortKey(key);
      // Ranks and names read best ascending; everything else descending.
      setSortDir(key === "posRank" || key === "name" ? "asc" : "desc");
    }
    setLimit(PAGE);
  };

  const Header = ({ k, label, className = "" }: { k: SortKey; label: string; className?: string }) => (
    <th
      className={`px-2 py-2 text-right ${className}`}
      aria-sort={sortKey === k ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        onClick={() => setSort(k)}
        data-testid={`sort-${k}`}
        className={`uppercase tracking-wider hover:text-slate-200 ${sortKey === k ? "text-emerald-300" : ""}`}
      >
        {label}
        {sortKey === k ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
      </button>
    </th>
  );

  const chip = (active: boolean) =>
    `rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
      active ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-800 text-slate-400 hover:text-slate-200"
    }`;

  return (
    <div className="mx-auto max-w-6xl">
      <DataSourceBanner source={bundle.source} valueSources={bundle.valueSources} />
      <RosterNotice ready={ready} user={user} myRosterId={myRosterId} leagueLabel={leagueConfig.label} />

      <h1 className="text-2xl font-bold text-slate-100">Players</h1>
      <p className="mt-1 text-sm text-slate-500">
        {leagueConfig.label} · {state.season} stats and week {state.week} projections scored with your league&apos;s
        settings · click a column to sort
      </p>
      {!hasStats && (
        <p className="mt-2 text-xs text-sky-300">
          Season stats aren&apos;t available from Sleeper right now — value, trend, and projection columns still work.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {["ALL", ...EXPLORER_POSITIONS].map((p) => (
          <button key={p} onClick={() => { setPos(p); setLimit(PAGE); }} className={chip(pos === p)}>
            {p}
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-slate-800" />
        {(
          [
            ["all", "All"],
            ["fa", "Free agents"],
            ["mine", "My team"],
            ["rostered", "Rostered"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => { setAvail(k); setLimit(PAGE); }}
            className={chip(avail === k)}
            data-testid={`filter-${k}`}
            disabled={k === "mine" && myRosterId === null}
          >
            {label}
          </button>
        ))}
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); }}
          placeholder="Search name…"
          aria-label="Search players"
          className="ml-auto w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-200 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none sm:w-56"
        />
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/50">
        <table data-testid="players-table" className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-[11px] text-slate-500">
              <th className="px-2 py-2 text-left">
                <button onClick={() => setSort("name")} className="uppercase tracking-wider hover:text-slate-200">
                  Player{sortKey === "name" ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                </button>
              </th>
              <th className="px-2 py-2 text-left uppercase tracking-wider">Owner</th>
              <Header k="value" label="Value" />
              <Header k="posRank" label="Pos rk" />
              {hasStats && <Header k="ppg" label="PPG" />}
              {hasStats && <Header k="seasonPts" label="Pts" />}
              {hasStats && <Header k="gp" label="GP" className="hidden sm:table-cell" />}
              {hasProj && <Header k="proj" label={`Wk ${state.week}`} />}
              <Header k="trend" label="30d" className="hidden sm:table-cell" />
              <Header k="age" label="Age" className="hidden sm:table-cell" />
              <Header k="adds" label="Adds" className="hidden md:table-cell" />
            </tr>
          </thead>
          <tbody>
            {visible.slice(0, limit).map((r) => {
              const mine = r.ownerRosterId !== null && r.ownerRosterId === myRosterId;
              return (
                <tr key={r.id} className={`border-b border-slate-800/50 last:border-0 ${mine ? "bg-emerald-500/5" : ""}`}>
                  <td className="px-2 py-1.5">
                    <span className="flex items-center gap-2">
                      <PositionBadge position={r.position} />
                      <span className="truncate text-slate-200">{r.name}</span>
                      <span className="shrink-0 text-[11px] text-slate-500">{r.team ?? "FA"}</span>
                      {r.injury && r.injury !== "Healthy" && (
                        <span className="text-[11px] font-semibold text-rose-400">{r.injury}</span>
                      )}
                    </span>
                  </td>
                  <td className="max-w-[9rem] truncate px-2 py-1.5 text-xs">
                    {r.ownerRosterId === null ? (
                      <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-medium text-emerald-300">FA</span>
                    ) : (
                      <span className={mine ? "text-emerald-400" : "text-slate-500"}>
                        {mine ? "me" : ownerName.get(r.ownerRosterId)}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-slate-200">{r.value > 0 ? fmt(r.value) : "—"}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-slate-400">
                    {r.posRank !== null ? `${r.position}${r.posRank}` : "—"}
                  </td>
                  {hasStats && <td className="px-2 py-1.5 text-right font-mono text-slate-200">{fmt(r.ppg, 1)}</td>}
                  {hasStats && <td className="px-2 py-1.5 text-right font-mono text-slate-400">{fmt(r.seasonPts, 1)}</td>}
                  {hasStats && (
                    <td className="hidden px-2 py-1.5 text-right font-mono text-slate-500 sm:table-cell">{fmt(r.gp)}</td>
                  )}
                  {hasProj && <td className="px-2 py-1.5 text-right font-mono text-sky-300">{fmt(r.proj, 1)}</td>}
                  <td
                    className={`hidden px-2 py-1.5 text-right font-mono text-xs sm:table-cell ${
                      r.trend > 0 ? "text-emerald-400" : r.trend < 0 ? "text-rose-400" : "text-slate-600"
                    }`}
                  >
                    {r.trend > 0 ? "+" : ""}
                    {fmt(r.trend)}
                  </td>
                  <td className="hidden px-2 py-1.5 text-right text-slate-500 sm:table-cell">{fmt(r.age)}</td>
                  <td className="hidden px-2 py-1.5 text-right font-mono text-xs text-orange-400 md:table-cell">
                    {r.adds !== null ? fmt(r.adds) : ""}
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={11} className="px-3 py-6 text-center text-sm text-slate-600">
                  No players match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
        <span>
          Showing {Math.min(limit, visible.length).toLocaleString("en-US")} of {visible.length.toLocaleString("en-US")}
        </span>
        {visible.length > limit && (
          <button onClick={() => setLimit(limit + PAGE)} className="rounded-md bg-slate-800 px-3 py-1.5 text-slate-300 hover:bg-slate-700">
            Show more
          </button>
        )}
      </div>
    </div>
  );
}
