"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/**
 * Pulls the latest league data from Sleeper on demand: clears this server
 * instance's cache, then re-renders the current page with a cache-bypassing
 * ?sync= param so the render is guaranteed fresh even on serverless hosting.
 */
export default function SyncButton() {
  const router = useRouter();
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [syncedAt, setSyncedAt] = useState<string | null>(null);

  async function sync() {
    setBusy(true);
    try {
      await fetch("/api/sync", { method: "POST" });
    } catch {
      // cache clear is best-effort; the fresh render below still bypasses it
    }
    if (pathname.startsWith("/league/")) {
      startTransition(() => {
        router.replace(`${pathname}?sync=${Date.now()}`);
        router.refresh();
      });
    } else {
      router.refresh();
      window.location.reload();
      return;
    }
    setSyncedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    setBusy(false);
  }

  const spinning = busy || isPending;
  return (
    <div className="flex items-center gap-2 px-3">
      <button
        onClick={sync}
        disabled={spinning}
        data-testid="sync-button"
        title="Pull the latest rosters, transactions, and picks from Sleeper"
        className="flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-emerald-500/50 hover:text-emerald-300 disabled:opacity-60"
      >
        <span className={spinning ? "inline-block animate-spin" : ""}>⟳</span>
        {spinning ? "Syncing…" : "Sync"}
      </button>
      {syncedAt && !spinning && (
        <span className="text-[10px] text-slate-600">at {syncedAt}</span>
      )}
    </div>
  );
}
