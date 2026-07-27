"use client";

import { useEffect, useMemo, useState } from "react";
import DataSourceBanner from "@/components/DataSourceBanner";
import { PlayerCell, ValueChip } from "@/components/players/PlayerRow";
import {
  defaultRules,
  KeeperAssignment,
  KeeperPins,
  KeeperRules,
  optimizeKeepers,
  taxiEligible,
} from "@/lib/analysis/keepers";
import { starterSlots } from "@/lib/analysis/rosterStrength";
import { positionBalance } from "@/lib/analysis/tradeFinder";
import { LeagueBundle, teamName } from "@/lib/leagueBundle";
import { useSleeperUser } from "@/lib/hooks/useSleeperUser";
import { CanonicalPlayer } from "@/lib/players/canonical";
import { playerValue } from "@/lib/values/engine";

interface StoredPlan {
  rules: KeeperRules;
  deadline: string;
}

function rulesKey(leagueId: string) {
  return `therealdeal:keeperRules:${leagueId}`;
}
function pinsKey(leagueId: string, rosterId: number) {
  return `therealdeal:keeperPins:${leagueId}:${rosterId}`;
}

function loadJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export default function KeeperPlanner({ bundle }: { bundle: LeagueBundle }) {
  const { user } = useSleeperUser();
  const { leagueConfig, league, rosters, users, players, valueContext, state } = bundle;

  const myRosterId =
    user?.rosterIdByLeague?.[leagueConfig.id] ??
    rosters.find((r) => r.owner_id === user?.userId)?.roster_id ??
    rosters[0]?.roster_id;
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const rosterId = selectedId ?? myRosterId;
  const roster = rosters.find((r) => r.roster_id === rosterId) ?? rosters[0];

  const leagueDefaults = useMemo(() => defaultRules(league, leagueConfig), [league, leagueConfig]);
  const defaultDeadline = `${league.season}-08-01`;

  const [rules, setRules] = useState<KeeperRules>(leagueDefaults);
  const [deadline, setDeadline] = useState<string>(defaultDeadline);
  const [pins, setPins] = useState<KeeperPins>({});
  const [hydrated, setHydrated] = useState(false);
  const [daysLeft, setDaysLeft] = useState<number | null>(null);

  useEffect(() => {
    const stored = loadJson<StoredPlan>(rulesKey(leagueConfig.id));
    if (stored) {
      setRules(stored.rules);
      setDeadline(stored.deadline);
    }
    setHydrated(true);
  }, [leagueConfig.id]);

  useEffect(() => {
    if (!roster) return;
    setPins(loadJson<KeeperPins>(pinsKey(leagueConfig.id, roster.roster_id)) ?? {});
  }, [leagueConfig.id, roster?.roster_id, roster]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(
      rulesKey(leagueConfig.id),
      JSON.stringify({ rules, deadline } satisfies StoredPlan)
    );
  }, [rules, deadline, hydrated, leagueConfig.id]);

  useEffect(() => {
    setDaysLeft(Math.ceil((new Date(deadline).getTime() - Date.now()) / 86_400_000));
  }, [deadline]);

  const valueOf = useMemo(
    () => (p: CanonicalPlayer) => playerValue(p, leagueConfig, bundle.defaultSource, valueContext),
    [leagueConfig, bundle.defaultSource, valueContext]
  );

  const plan = useMemo(
    () => optimizeKeepers(roster?.players ?? [], players, valueOf, rules, pins),
    [roster, players, valueOf, rules, pins]
  );

  // League cut watch: run the same optimizer for every rival roster (no pins)
  // to project who hits waivers at the deadline.
  const cutWatch = useMemo(() => {
    const mine = rosters.find((r) => r.roster_id === myRosterId);
    const myBalance = positionBalance(
      mine?.players ?? [],
      players,
      starterSlots(league.roster_positions)
    );
    return rosters
      .filter((r) => r.roster_id !== myRosterId)
      .flatMap((r) =>
        optimizeKeepers(r.players ?? [], players, valueOf, rules, {}).cut.map((id) => ({
          id,
          ownerRosterId: r.roster_id,
        }))
      )
      .filter((row) => players[row.id] !== undefined)
      .map((row) => {
        const pos = players[row.id]!.position;
        return {
          ...row,
          fillsNeed:
            (pos === "QB" || pos === "RB" || pos === "WR" || pos === "TE") && myBalance[pos] > 0
              ? pos
              : null,
        };
      })
      .sort((a, b) => (players[b.id] ? valueOf(players[b.id]!) : 0) - (players[a.id] ? valueOf(players[a.id]!) : 0))
      .slice(0, 20);
  }, [rosters, myRosterId, players, valueOf, rules, league.roster_positions]);

  if (!roster) return <p className="text-slate-400">No rosters found.</p>;

  const irSet = new Set(roster.reserve ?? []);
  const setPin = (id: string, assignment: KeeperAssignment | null) => {
    const next = { ...pins };
    if (assignment === null) delete next[id];
    else next[id] = assignment;
    setPins(next);
    window.localStorage.setItem(pinsKey(leagueConfig.id, roster.roster_id), JSON.stringify(next));
  };

  const val = (id: string) => (players[id] ? valueOf(players[id]) : 0);
  const maxVal = Math.max(...(roster.players ?? []).map(val), 1);
  const cutValue = plan.cut.reduce((s, id) => s + val(id), 0);
  const irKeepers = plan.keep.filter((id) => irSet.has(id));
  const bubbleKeep = plan.keep[plan.keep.length - 1];
  const bubbleCut = plan.cut[0];
  const bubbleMargin =
    bubbleKeep !== undefined && bubbleCut !== undefined ? val(bubbleKeep) - val(bubbleCut) : null;

  const numberInput = (
    label: string,
    value: number,
    onChange: (n: number) => void,
    testid: string
  ) => (
    <label className="flex items-center gap-1.5 text-xs text-slate-400">
      {label}
      <input
        type="number"
        min={0}
        max={40}
        value={value}
        data-testid={testid}
        onChange={(e) => onChange(Math.max(0, parseInt(e.target.value || "0", 10)))}
        className="w-14 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-center text-sm text-slate-200"
      />
    </label>
  );

  const pinButton = (id: string, target: KeeperAssignment, current: KeeperAssignment) => {
    const pinned = pins[id] === target;
    const active = current === target;
    const label = target === "keep" ? "K" : target === "taxi" ? "T" : "C";
    const disabled = target === "taxi" && !taxiEligible(players[id], rules);
    return (
      <button
        key={target}
        disabled={disabled}
        title={
          disabled
            ? `Not taxi-eligible (over ${rules.taxiMaxYearsExp} yrs experience)`
            : pinned
              ? `Unpin from ${target}`
              : `Pin to ${target}`
        }
        onClick={() => setPin(id, pinned ? null : target)}
        className={`rounded px-1.5 py-0.5 text-[10px] font-bold transition-colors ${
          pinned
            ? "bg-emerald-500 text-slate-950"
            : active
              ? "bg-slate-700 text-slate-200"
              : "bg-slate-800/60 text-slate-500 hover:text-slate-200"
        } ${disabled ? "cursor-not-allowed opacity-30" : ""}`}
      >
        {label}
      </button>
    );
  };

  const section = (
    title: string,
    ids: string[],
    assignment: KeeperAssignment,
    capacity: number | null,
    tone: string
  ) => (
    <div data-testid={`keeper-${assignment}`}>
      <h3 className="mb-1.5 mt-5 flex items-baseline gap-2 text-[11px] font-semibold uppercase tracking-wider">
        <span className={tone}>{title}</span>
        <span className="text-slate-600">
          {ids.length}
          {capacity !== null ? `/${capacity}` : ""}
        </span>
      </h3>
      <div className="divide-y divide-slate-800/60 rounded-lg border border-slate-800 bg-slate-900/50">
        {ids.map((id) => {
          const p = players[id];
          return (
            <div key={id} className="flex items-center gap-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <PlayerCell player={p} playerId={id} currentWeek={state.week} />
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {irSet.has(id) && assignment === "keep" && (
                  <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-medium text-rose-300">
                    IR — uses keeper slot
                  </span>
                )}
                {assignment === "taxi" && p?.yearsExp !== null && p !== undefined && (
                  <span className="text-[10px] text-slate-500">{p.yearsExp} yrs exp</span>
                )}
                {(id === bubbleKeep || id === bubbleCut) && bubbleMargin !== null && (
                  <span
                    className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-300"
                    title={`Margin between last keeper and best cut: ${bubbleMargin.toLocaleString()}`}
                  >
                    bubble
                  </span>
                )}
                <ValueChip value={val(id)} max={maxVal} />
                <div className="flex gap-1">
                  {pinButton(id, "keep", assignment)}
                  {rules.taxiSlots > 0 && pinButton(id, "taxi", assignment)}
                  {pinButton(id, "cut", assignment)}
                </div>
              </div>
            </div>
          );
        })}
        {ids.length === 0 && (
          <p className="px-3 py-2.5 text-xs text-slate-600">Nobody — adjust rules or pins.</p>
        )}
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-5xl">
      <DataSourceBanner source={bundle.source} valuesDegraded={bundle.valuesDegraded} />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Cutdown Planner</h1>
          <p className="mt-1 text-sm text-slate-500">
            {leagueConfig.label} · {teamName(users, roster)} · optimizer suggests keeps, you pin
            overrides
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

      <div className="mt-4 flex flex-wrap items-center gap-4 rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3">
        {numberInput("Keepers", rules.maxKeepers, (n) => setRules({ ...rules, maxKeepers: n }), "rule-keepers")}
        {numberInput("Taxi slots", rules.taxiSlots, (n) => setRules({ ...rules, taxiSlots: n }), "rule-taxi")}
        {numberInput(
          "Taxi max yrs exp",
          rules.taxiMaxYearsExp,
          (n) => setRules({ ...rules, taxiMaxYearsExp: n }),
          "rule-taxi-exp"
        )}
        <label className="flex items-center gap-1.5 text-xs text-slate-400">
          Deadline
          <input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-200"
          />
        </label>
        {daysLeft !== null && (
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium ${
              daysLeft < 0
                ? "bg-slate-800 text-slate-500"
                : daysLeft <= 7
                  ? "bg-rose-500/15 text-rose-300"
                  : "bg-slate-800 text-slate-300"
            }`}
          >
            {daysLeft < 0 ? "deadline passed" : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`}
          </span>
        )}
        <button
          onClick={() => {
            setRules(leagueDefaults);
            setDeadline(defaultDeadline);
          }}
          className="text-xs text-slate-500 underline hover:text-slate-300"
        >
          reset to league defaults
        </button>
      </div>

      {(plan.warnings.length > 0 || irKeepers.length > 0) && (
        <div className="mt-3 flex flex-col gap-1">
          {plan.warnings.map((w, i) => (
            <p key={i} className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-300">
              {w}
            </p>
          ))}
          {irKeepers.length > 0 && (
            <p className="rounded-md border border-slate-700 bg-slate-800/40 px-3 py-1.5 text-xs text-slate-400">
              {irKeepers.length} IR player{irKeepers.length > 1 ? "s" : ""} counting against your{" "}
              {rules.maxKeepers} keeper slots.
            </p>
          )}
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-lg bg-slate-800/60 p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Keeping</div>
          <div className="font-mono text-lg text-slate-200">
            {plan.keep.length}/{rules.maxKeepers}
          </div>
        </div>
        <div className="rounded-lg bg-slate-800/60 p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Taxi</div>
          <div className="font-mono text-lg text-slate-200">
            {plan.taxi.length}/{rules.taxiSlots}
          </div>
        </div>
        <div className="rounded-lg bg-slate-800/60 p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Kept value</div>
          <div className="font-mono text-lg text-emerald-300">
            {plan.totalKeptValue.toLocaleString()}
          </div>
        </div>
        <div className="rounded-lg bg-slate-800/60 p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Value being cut</div>
          <div className={`font-mono text-lg ${cutValue > 0 ? "text-amber-300" : "text-slate-400"}`}>
            {cutValue.toLocaleString()}
          </div>
        </div>
      </div>

      {cutValue > 500 && (
        <p className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          You&apos;re cutting {cutValue.toLocaleString()} in market value
          {plan.cut[0] && players[plan.cut[0]] ? ` (top asset: ${players[plan.cut[0]]!.name})` : ""} —
          consider trading these players for picks before the deadline instead of dropping them.
        </p>
      )}

      {section("Keep", plan.keep, "keep", rules.maxKeepers, "text-emerald-400")}
      {rules.taxiSlots > 0 && section("Taxi squad", plan.taxi, "taxi", rules.taxiSlots, "text-violet-400")}
      {section("Cut", plan.cut, "cut", null, "text-rose-400")}

      <p className="mt-4 text-[11px] text-slate-600">
        Pins: <span className="font-semibold">K</span>eep / <span className="font-semibold">T</span>axi /{" "}
        <span className="font-semibold">C</span>ut lock a player in place; everything else re-optimizes
        around your pins. Pins and rules are saved in this browser.
      </p>

      <div data-testid="cut-watch">
        <h3 className="mb-1.5 mt-8 text-[11px] font-semibold uppercase tracking-wider text-sky-400">
          League cut watch — rivals&apos; likely cuts under the same rules
        </h3>
        <div className="divide-y divide-slate-800/60 rounded-lg border border-slate-800 bg-slate-900/50">
          {cutWatch.map(({ id, ownerRosterId, fillsNeed }) => (
            <div key={`${ownerRosterId}-${id}`} className="flex items-center gap-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <PlayerCell player={players[id]} playerId={id} currentWeek={state.week} />
              </div>
              <span className="flex shrink-0 items-center gap-2">
                {fillsNeed && (
                  <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
                    fills your need at {fillsNeed}
                  </span>
                )}
                <span className="text-xs text-slate-500">
                  {teamName(users, rosters.find((r) => r.roster_id === ownerRosterId)!)}
                </span>
                <ValueChip value={players[id] ? valueOf(players[id]!) : 0} max={maxVal} />
              </span>
            </div>
          ))}
          {cutWatch.length === 0 && (
            <p className="px-3 py-2.5 text-xs text-slate-600">
              No projected cuts across the league under the current rules.
            </p>
          )}
        </div>
        <p className="mt-2 text-[11px] text-slate-600">
          Assumes rivals keep by market value with your configured rules — their actual decisions
          may differ. Players here are trade-for-cheap or waiver targets around the deadline.
        </p>
      </div>
    </div>
  );
}
