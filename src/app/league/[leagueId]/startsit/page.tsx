import { notFound } from "next/navigation";
import StartSitView from "@/components/startsit/StartSitView";
import { getLeagueBundle } from "@/lib/bundle";
import { getMatchups, getProjections } from "@/lib/sleeper/client";

export const dynamic = "force-dynamic";

export default async function StartSitPage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;
  const bundle = await getLeagueBundle(leagueId);
  if (!bundle) notFound();

  const [projRes, matchupsRes] = await Promise.all([
    getProjections(bundle.state.season, bundle.state.week),
    getMatchups(leagueId, bundle.state.week).catch(() => null),
  ]);

  return (
    <StartSitView
      bundle={bundle}
      projections={projRes?.data ?? null}
      matchups={matchupsRes?.data ?? []}
    />
  );
}
