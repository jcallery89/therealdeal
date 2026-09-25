/** Skeleton shown while a league page's server data loads (cold caches can take a few seconds). */
export default function LeagueLoading() {
  return (
    <div className="mx-auto max-w-5xl animate-pulse" aria-busy="true" aria-label="Loading league data">
      <div className="h-7 w-56 rounded bg-slate-800" />
      <div className="mt-2 h-4 w-80 rounded bg-slate-800/70" />
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="h-36 rounded-xl bg-slate-900" />
        <div className="h-36 rounded-xl bg-slate-900" />
      </div>
      <div className="mt-6 flex flex-col gap-2">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="h-10 rounded-lg bg-slate-900" />
        ))}
      </div>
      <p className="mt-4 text-center text-xs text-slate-600">Pulling the latest from Sleeper…</p>
    </div>
  );
}
