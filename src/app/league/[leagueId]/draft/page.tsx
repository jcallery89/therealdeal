import { notFound } from "next/navigation";
import DraftBoard from "@/components/draft/DraftBoard";
import { getLeagueBundle } from "@/lib/bundle";
import { getDraftPicks, getDrafts } from "@/lib/sleeper/client";

export const dynamic = "force-dynamic";

export default async function DraftPage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;
  const bundle = await getLeagueBundle(leagueId);
  if (!bundle) notFound();

  const draftsRes = await getDrafts(leagueId).catch(() => null);
  // Most recent draft first per Sleeper; fall back gracefully without one.
  const draft = draftsRes?.data?.[0] ?? null;
  const picksRes = draft ? await getDraftPicks(draft.draft_id).catch(() => null) : null;

  return <DraftBoard bundle={bundle} draft={draft} draftPicks={picksRes?.data ?? []} />;
}
