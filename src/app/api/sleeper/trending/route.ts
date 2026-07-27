import { getTrending } from "@/lib/sleeper/client";
import { sourcedJson } from "@/lib/api";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get("type") === "drop" ? "drop" : "add";
  return sourcedJson(await getTrending(type));
}
