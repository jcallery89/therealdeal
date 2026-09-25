"use client";

import Link from "next/link";
import { useEffect } from "react";

/** Shown when a league page can't load (e.g. Sleeper unreachable with nothing cached). */
export default function LeagueError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const sleeperDown = /unavailable|fetch|timeout|HTTP/i.test(error.message);
  return (
    <div className="mx-auto max-w-md pt-16 text-center" data-testid="league-error">
      <div className="text-4xl">📡</div>
      <h1 className="mt-3 text-xl font-semibold text-slate-100">
        {sleeperDown ? "Couldn't reach Sleeper" : "Something went wrong"}
      </h1>
      <p className="mt-2 text-sm text-slate-400">
        {sleeperDown
          ? "Sleeper didn't respond and there's no recent copy of this league cached. It's usually brief — try again in a moment."
          : "This page hit an unexpected error. Trying again usually fixes it."}
      </p>
      <div className="mt-5 flex justify-center gap-2">
        <button
          onClick={reset}
          className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-400"
        >
          Try again
        </button>
        <Link href="/" className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">
          Overview
        </Link>
      </div>
    </div>
  );
}
