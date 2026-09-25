import { notFound } from "next/navigation";
import WeeklyReview from "@/components/review/WeeklyReview";
import { buildImagePrompt, buildTextRecap, summarizeWeek } from "@/lib/analysis/weeklyReview";
import { getLeagueBundle } from "@/lib/bundle";
import { getMatchups } from "@/lib/sleeper/client";
import { playerValue } from "@/lib/values/engine";

export const dynamic = "force-dynamic";

export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ leagueId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { leagueId } = await params;
  const sp = await searchParams;
  const fresh = Boolean(sp.sync);
  const bundle = await getLeagueBundle(leagueId, fresh);
  if (!bundle) notFound();

  // Sleeper's current week is usually still in progress; default to the last
  // completed one.
  const currentWeek = Math.max(1, bundle.state.week);
  const defaultWeek = Math.max(1, currentWeek - 1);
  const requested = parseInt(String(sp.week ?? ""), 10);
  const week = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), currentWeek) : defaultWeek;

  const matchupsRes = await getMatchups(leagueId, week, fresh).catch(() => null);
  const summary = summarizeWeek({
    leagueName: bundle.leagueConfig.label,
    week,
    matchups: matchupsRes?.data ?? [],
    rosters: bundle.rosters,
    users: bundle.users,
    players: bundle.players,
    rosterPositions: bundle.league.roster_positions,
    valueOf: (p) => playerValue(p, bundle.leagueConfig, bundle.defaultSource, bundle.valueContext),
    // Current records only describe the most recent week.
    includeRecords: week === defaultWeek,
  });

  return (
    <WeeklyReview
      bundle={{ ...bundle, players: {} }}
      summary={summary}
      prompt={summary.matchups.length > 0 ? buildImagePrompt(summary) : ""}
      recaps={{ chat: buildTextRecap(summary, "chat"), newsletter: buildTextRecap(summary, "newsletter") }}
      currentWeek={currentWeek}
    />
  );
}
