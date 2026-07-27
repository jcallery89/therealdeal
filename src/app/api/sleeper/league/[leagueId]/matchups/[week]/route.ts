import { getMatchups } from "@/lib/sleeper/client";
import { sourcedJson } from "@/lib/api";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ leagueId: string; week: string }> }
) {
  const { leagueId, week } = await params;
  return sourcedJson(await getMatchups(leagueId, parseInt(week, 10) || 1));
}
