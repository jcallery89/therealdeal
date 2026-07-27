import { DataSourceKind } from "@/lib/datasource";

export default function DataSourceBanner({ source }: { source: DataSourceKind }) {
  if (source === "live") return null;
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
