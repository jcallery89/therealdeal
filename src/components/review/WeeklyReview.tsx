"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import DataSourceBanner from "@/components/DataSourceBanner";
import { MatchupResult, WeekSummary } from "@/lib/analysis/weeklyReview";
import { LeagueBundle } from "@/lib/leagueBundle";

const pts = (n: number) => n.toFixed(2);

function tagFor(r: MatchupResult, summary: WeekSummary): string | null {
  if (r.malpractice) return "🤡 malpractice";
  if (summary.blowout?.matchupId === r.matchupId && r.margin >= 20) return "💥 blowout";
  if (summary.nailBiter?.matchupId === r.matchupId && r.margin < 10) return "😬 nail-biter";
  return null;
}

export default function WeeklyReview({
  bundle,
  summary,
  prompt,
  currentWeek,
}: {
  bundle: LeagueBundle;
  summary: WeekSummary;
  prompt: string;
  currentWeek: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [copied, setCopied] = useState(false);
  const [attached, setAttached] = useState<Set<string>>(new Set());

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
    } catch {
      // Clipboard can be blocked (e.g. insecure context); select for manual copy.
      const el = document.getElementById("review-prompt") as HTMLTextAreaElement | null;
      el?.select();
      document.execCommand?.("copy");
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const toggle = (name: string) => {
    const next = new Set(attached);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setAttached(next);
  };

  const weeks = Array.from({ length: currentWeek }, (_, i) => i + 1);

  return (
    <div className="mx-auto max-w-5xl">
      <DataSourceBanner source={bundle.source} valueSources={bundle.valueSources} />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Weekly Review</h1>
          <p className="mt-1 text-sm text-slate-500">
            {bundle.leagueConfig.label} · turns the week&apos;s results into a savage-roast image prompt for ChatGPT
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-400">
          Week
          <select
            aria-label="Week"
            data-testid="review-week"
            value={summary.week}
            onChange={(e) => router.push(`${pathname}?week=${e.target.value}`)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200"
          >
            {weeks.map((w) => (
              <option key={w} value={w}>
                Week {w}
                {w === currentWeek ? " (in progress)" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>

      {summary.matchups.length === 0 ? (
        <p className="mt-8 rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-8 text-center text-sm text-slate-500">
          No scores for week {summary.week} yet. Pick a completed week.
        </p>
      ) : (
        <>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <div data-testid="review-results" className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Results</h3>
              <ul className="mt-2 flex flex-col divide-y divide-slate-800/60">
                {summary.matchups.map((r) => {
                  const tag = tagFor(r, summary);
                  return (
                    <li key={r.matchupId} className="py-2 text-sm">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-slate-200">
                          <span className="font-medium text-emerald-300">{r.winner.teamName}</span>{" "}
                          <span className="font-mono">{pts(r.winner.points)}</span>
                          <span className="text-slate-600"> def. </span>
                          <span className="text-slate-400">{r.loser.teamName}</span>{" "}
                          <span className="font-mono text-slate-400">{pts(r.loser.points)}</span>
                        </span>
                        {tag && <span className="shrink-0 text-[11px] text-amber-300">{tag}</span>}
                      </div>
                      {r.loser.benchLeft > 0 && (
                        <div className="text-[11px] text-slate-600">
                          {r.loser.teamName} left {pts(r.loser.benchLeft)} on the bench
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Awards</h3>
              <ul className="mt-2 flex flex-col gap-1.5 text-sm text-slate-300">
                {summary.topDog && (
                  <li>👑 Top dog: {summary.topDog.teamName} ({pts(summary.topDog.points)})</li>
                )}
                {summary.basement && (
                  <li>🪦 Basement: {summary.basement.teamName} ({pts(summary.basement.points)})</li>
                )}
                {summary.benchBlunder && (
                  <li>
                    🪑 Bench blunder: {summary.benchBlunder.teamName} ({pts(summary.benchBlunder.benchLeft)} left)
                  </li>
                )}
                {summary.mvp && (
                  <li>
                    ⭐ MVP: {summary.mvp.name} ({pts(summary.mvp.points)}, {summary.mvp.teamName})
                  </li>
                )}
                {summary.dud && (
                  <li>
                    🧊 Dud: {summary.dud.name} ({pts(summary.dud.points)}, {summary.dud.teamName})
                  </li>
                )}
              </ul>
            </div>
          </div>

          <div data-testid="attach-order" className="mt-4 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Step 1 · Attach your mascot images in ChatGPT in this order
            </h3>
            <ol className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
              {summary.attachOrder.map((name, i) => (
                <li key={name}>
                  <label className="flex cursor-pointer items-center gap-2 text-slate-300">
                    <input
                      type="checkbox"
                      checked={attached.has(name)}
                      onChange={() => toggle(name)}
                      className="accent-emerald-500"
                    />
                    <span className="w-5 text-right font-mono text-slate-500">{i + 1}.</span>
                    <span className={attached.has(name) ? "text-slate-500 line-through" : ""}>{name}</span>
                  </label>
                </li>
              ))}
            </ol>
          </div>

          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Step 2 · Paste this prompt with the images
              </h3>
              <div className="flex items-center gap-2">
                <a
                  href="https://chatgpt.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
                >
                  Open ChatGPT ↗
                </a>
                <button
                  onClick={copy}
                  data-testid="copy-prompt"
                  className="rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-emerald-400"
                >
                  {copied ? "Copied ✓" : "Copy prompt"}
                </button>
              </div>
            </div>
            <textarea
              id="review-prompt"
              data-testid="review-prompt"
              readOnly
              value={prompt}
              rows={18}
              className="mt-3 w-full rounded-lg border border-slate-800 bg-slate-950 p-3 font-mono text-xs leading-relaxed text-slate-300"
            />
            <p className="mt-1 text-[11px] text-slate-600">
              {prompt.length.toLocaleString("en-US")} characters · captions are fixed per week, so regenerating
              gives the same prompt.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
