import { notFound } from "next/navigation";
import RosterDashboard from "@/components/roster/RosterDashboard";
import { getLeagueBundle } from "@/lib/bundle";

export const dynamic = "force-dynamic";

export default async function LeaguePage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;
  const bundle = await getLeagueBundle(leagueId);
  if (!bundle) notFound();
  return <RosterDashboard bundle={bundle} />;
}
