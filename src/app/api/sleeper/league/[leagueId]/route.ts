import { getLeague } from "@/lib/sleeper/client";
import { sourcedJson } from "@/lib/api";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params;
  return sourcedJson(await getLeague(leagueId));
}
