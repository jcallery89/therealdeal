import { getState } from "@/lib/sleeper/client";
import { sourcedJson } from "@/lib/api";

export async function GET() {
  return sourcedJson(await getState());
}
