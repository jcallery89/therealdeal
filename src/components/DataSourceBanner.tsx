import { DataSourceKind } from "@/lib/datasource";

export default function DataSourceBanner({
  source,
  valuesDegraded,
}: {
  source: DataSourceKind;
  valuesDegraded?: { fc: boolean; ktc: boolean };
}) {
  if (source !== "live") {
    const demo = source === "fixture";
    return (
      <div
        data-testid="source-banner"
        className={`mb-4 rounded-md border px-3 py-2 text-xs ${
          demo
            ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
            : "border-sky-500/40 bg-sky-500/10 text-sky-300"
        }`}
      >
        {demo
          ? "Demo data — live sources are unreachable (or SLEEPER_FIXTURES=1 is set), so you're viewing the built-in sample league."
          : "Showing cached data — a live source didn't respond, so values may be slightly stale."}
      </div>
    );
  }

  // Rosters are live; only note degraded value sources, softly.
  if (valuesDegraded && (valuesDegraded.fc || valuesDegraded.ktc)) {
    const note =
      valuesDegraded.fc && valuesDegraded.ktc
        ? "Market values (FantasyCalc & KeepTradeCut) didn't refresh — showing cached values where available."
        : valuesDegraded.ktc
          ? "KeepTradeCut didn't respond — values lean on FantasyCalc for now."
          : "FantasyCalc didn't respond — values lean on KeepTradeCut for now.";
    return (
      <div
        data-testid="values-note"
        className="mb-4 rounded-md border border-slate-700 bg-slate-800/40 px-3 py-2 text-xs text-slate-400"
      >
        {note} Rosters are live from Sleeper.
      </div>
    );
  }

  return null;
}
