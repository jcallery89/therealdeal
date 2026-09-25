import { notFound } from "next/navigation";
import DraftBoard from "@/components/draft/DraftBoard";
import { getLeagueBundle } from "@/lib/bundle";
import { getDraftPicks } from "@/lib/sleeper/client";

export const dynamic = "force-dynamic";

export default async function DraftPage({
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

  // The bundle already carries the league's latest draft; add its picks.
  const picksRes = bundle.draft
    ? await getDraftPicks(bundle.draft.draft_id, fresh).catch(() => null)
    : null;

  return <DraftBoard bundle={bundle} draftPicks={picksRes?.data ?? []} />;
}
