import { notFound } from "next/navigation";
import RosterDashboard from "@/components/roster/RosterDashboard";
import { getLeagueBundle } from "@/lib/bundle";

export const dynamic = "force-dynamic";

export default async function LeaguePage({
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
  return <RosterDashboard bundle={bundle} />;
}
