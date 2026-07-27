import { NextResponse } from "next/server";
import { cache } from "@/lib/cache";

/**
 * User-initiated sync: drop cached Sleeper league data (rosters, picks,
 * matchups, drafts...) so the next render refetches. The big players blob and
 * the FantasyCalc/KTC value tables are kept — roster moves don't change them.
 *
 * Note: on serverless hosting this clears only the instance that handles the
 * request, which is why pages ALSO accept a ?sync= param that bypasses the
 * cache read for that render — the button uses both.
 */
export async function POST() {
  const cleared = cache.sweep("sleeper:", ["sleeper:players"]);
  return NextResponse.json({ cleared });
}
