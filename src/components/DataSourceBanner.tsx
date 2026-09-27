import { DataSourceKind } from "@/lib/datasource";
import type { SourceIssue } from "@/lib/leagueBundle";

function minutesAgo(ts: number): string {
  const mins = Math.max(0, Math.round((Date.now() - ts) / 60_000));
  return mins < 1 ? "under a minute ago" : `${mins} min ago`;
}

export default function DataSourceBanner({
  source,
  valuesUnavailable = false,
  issues = [],
}: {
  source: DataSourceKind;
  /** Every value source behind the current view failed. */
  valuesUnavailable?: boolean;
  issues?: SourceIssue[];
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
  // A recent cached fetch ("cache") is healthy; only warn when a live fetch
  // actually failed and older data is being shown.
  if (source === "stale" || source === "unavailable") {
    return (
      <div
        data-testid="source-banner"
        className="mb-4 rounded-md border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-xs text-sky-300"
      >
        Showing earlier league data — Sleeper didn&apos;t respond just now. Try Sync in a minute.
        {issues.length > 0 && (
          <ul className="mt-1 list-inside list-disc text-sky-300/80" data-testid="source-issues">
            {issues.map((i) => (
              <li key={i.name}>
                {i.name}: {i.error} · showing data from{" "}
                <span suppressHydrationWarning>{minutesAgo(i.fetchedAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  // Individual value providers drop out of the consensus silently; only warn
  // when all of them fail.
  if (!valuesUnavailable) return null;
  return (
    <div
      data-testid="values-note"
      className="mb-4 rounded-md border border-slate-700 bg-slate-800/40 px-3 py-2 text-xs text-slate-400"
    >
      Market values couldn&apos;t be loaded just now, so player values may be missing. Rosters are
      live from Sleeper — try Sync in a few minutes.
    </div>
  );
}
