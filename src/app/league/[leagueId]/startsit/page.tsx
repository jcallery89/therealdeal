import { getLeagueConfig } from "@/lib/config";
import { notFound } from "next/navigation";

export default async function StartSitPage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;
  const config = getLeagueConfig(leagueId);
  if (!config) notFound();

  return (
    <div className="mx-auto max-w-3xl pt-16 text-center">
      <div className="text-4xl">🔜</div>
      <h1 className="mt-3 text-xl font-semibold text-slate-100">
        Start/Sit &amp; Matchups — coming in v2
      </h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
        Weekly lineup optimization from Sleeper projections, matchup previews, and
        waiver-wire trends for {config.label} will live here.
      </p>
    </div>
  );
}
