import { notFound } from "next/navigation";
import EdgeFeed from "@/components/edge/EdgeFeed";
import { getLeagueBundle } from "@/lib/bundle";
import { getEdgeInputs } from "@/lib/edge/data";
import { buildInsights } from "@/lib/edge/insights";

export const dynamic = "force-dynamic";

export default async function EdgePage({
  params,
  searchParams,
}: {
  params: Promise<{ leagueId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { leagueId } = await params;
  const fresh = Boolean((await searchParams).sync);
  const bundle = await getLeagueBundle(leagueId, fresh);
  if (!bundle) notFound();
  const inputs = await getEdgeInputs(bundle);
  // Insights depend on whose team it is; compute every team's feed so the
  // client can show the linked user's (or any team's) without the raw inputs.
  const byRoster = Object.fromEntries(
    bundle.rosters.map((r) => [r.roster_id, buildInsights(bundle, inputs, r.roster_id)])
  );
  const ids = new Set(Object.values(byRoster).flatMap((list) => list.flatMap((i) => i.playerIds)));
  const players = Object.fromEntries([...ids].filter((id) => inputs.players[id]).map((id) => [id, inputs.players[id]]));
  return <EdgeFeed bundle={bundle} insightsByRoster={byRoster} players={players} health={inputs.health} />;
}
