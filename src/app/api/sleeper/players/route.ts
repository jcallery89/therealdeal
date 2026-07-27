import { getPlayersMap } from "@/lib/sleeper/players";
import { sourcedJson } from "@/lib/api";

export async function GET() {
  const res = sourcedJson(await getPlayersMap());
  res.headers.set("Cache-Control", "public, max-age=3600");
  return res;
}
