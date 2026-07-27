import { notFound } from "next/navigation";
import KeeperPlanner from "@/components/keepers/KeeperPlanner";
import { getLeagueBundle } from "@/lib/bundle";

export const dynamic = "force-dynamic";

export default async function KeepersPage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;
  const bundle = await getLeagueBundle(leagueId);
  if (!bundle) notFound();
  return <KeeperPlanner bundle={bundle} />;
}
