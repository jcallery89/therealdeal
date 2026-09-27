"use client";

import {
  HORIZON_LABELS,
  HORIZON_SOURCES,
  horizonsFor,
  SOURCE_LABELS,
  sourceAvailable,
  ValueContext,
  ValueMode,
  ValueSource,
} from "@/lib/values/engine";
import { LeagueConfig } from "@/lib/config";

const button = (active: boolean) =>
  `px-3 py-1.5 font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
    active ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-900 text-slate-400 hover:text-slate-200"
  }`;

/**
 * Picks the value lens: a horizon (The Real Deal: this season vs keeper) and
 * a source (Consensus or one provider). Sources with no data are disabled.
 */
export default function ValueModePicker({
  league,
  ctx,
  mode,
  onChange,
}: {
  league: LeagueConfig;
  ctx: ValueContext;
  mode: ValueMode;
  onChange: (mode: ValueMode) => void;
}) {
  const horizons = horizonsFor(league);
  const sources: ValueSource[] = ["consensus", ...HORIZON_SOURCES[mode.horizon]];
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="value-mode-picker">
      {horizons.length > 1 && (
        <div className="flex overflow-hidden rounded-lg border border-slate-700 text-xs">
          {horizons.map((h) => (
            <button
              key={h}
              data-testid={`horizon-${h}`}
              aria-pressed={mode.horizon === h}
              onClick={() =>
                onChange({
                  horizon: h,
                  // Keep the source if the new horizon has it, else Consensus.
                  source: mode.source === "consensus" || HORIZON_SOURCES[h].includes(mode.source as never)
                    ? mode.source
                    : "consensus",
                })
              }
              className={button(mode.horizon === h)}
            >
              {HORIZON_LABELS[h]}
            </button>
          ))}
        </div>
      )}
      <div className="flex overflow-hidden rounded-lg border border-slate-700 text-xs">
        {sources.map((s) => {
          const available = sourceAvailable(mode.horizon, s, ctx);
          return (
            <button
              key={s}
              data-testid={`source-${s}`}
              aria-pressed={mode.source === s}
              disabled={!available}
              title={available ? undefined : `${SOURCE_LABELS[s]} has no data right now`}
              onClick={() => onChange({ ...mode, source: s })}
              className={button(mode.source === s)}
            >
              {SOURCE_LABELS[s]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
