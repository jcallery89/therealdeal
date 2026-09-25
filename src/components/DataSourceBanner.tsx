import { DataSourceKind } from "@/lib/datasource";

const SOURCE_NAMES = { fc: "FantasyCalc", ktc: "KeepTradeCut" } as const;

export default function DataSourceBanner({
  source,
  valueSources,
}: {
  source: DataSourceKind;
  valueSources?: { fc: DataSourceKind; ktc: DataSourceKind };
}) {
  if (source === "fixture") {
    return (
      <div
        data-testid="source-banner"
        className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300"
      >
        Demo data — SLEEPER_FIXTURES=1 is set, so you&apos;re viewing the built-in sample league.
      </div>
    );
  }
  if (source !== "live") {
    return (
      <div
        data-testid="source-banner"
        className="mb-4 rounded-md border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-xs text-sky-300"
      >
        Showing cached league data — Sleeper didn&apos;t respond just now. Try Sync in a minute.
      </div>
    );
  }

  // Rosters are live; softly note value sources that aren't.
  const issues = (["fc", "ktc"] as const)
    .filter((k) => valueSources && valueSources[k] !== "live" && valueSources[k] !== "fixture")
    .map((k) =>
      valueSources![k] === "unavailable"
        ? `${SOURCE_NAMES[k]} didn't respond`
        : `${SOURCE_NAMES[k]} values are cached`
    );
  if (issues.length === 0) return null;
  return (
    <div
      data-testid="values-note"
      className="mb-4 rounded-md border border-slate-700 bg-slate-800/40 px-3 py-2 text-xs text-slate-400"
    >
      {issues.join("; ")} — values lean on what&apos;s available. Rosters are live from Sleeper.
    </div>
  );
}
