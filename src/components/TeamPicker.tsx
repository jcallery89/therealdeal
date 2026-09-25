"use client";

import { teamName } from "@/lib/leagueBundle";
import { SleeperLeagueUser, SleeperRoster } from "@/lib/sleeper/types";

export default function TeamPicker({
  rosters,
  users,
  value,
  onChange,
  myRosterId,
  exclude,
  label = "View team",
  compact = false,
}: {
  rosters: SleeperRoster[];
  users: SleeperLeagueUser[];
  value: number;
  onChange: (rosterId: number) => void;
  myRosterId: number | null;
  /** Roster to leave out (e.g. the other side of a trade). */
  exclude?: number;
  label?: string;
  compact?: boolean;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(parseInt(e.target.value, 10))}
      className={
        compact
          ? "max-w-[60%] rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200"
          : "rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200"
      }
    >
      {rosters
        .filter((r) => r.roster_id !== exclude)
        .map((r) => (
          <option key={r.roster_id} value={r.roster_id}>
            {teamName(users, r)}
            {r.roster_id === myRosterId ? " (me)" : ""}
          </option>
        ))}
    </select>
  );
}
