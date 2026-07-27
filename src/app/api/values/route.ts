import { NextResponse } from "next/server";
import { buildCanonicalTable } from "@/lib/players/canonical";
import { parseFcPicks } from "@/lib/values/picks";
import { computeValueContext } from "@/lib/values/engine";

/**
 * Unified value table: canonical players (Sleeper + FantasyCalc + KTC joined),
 * parsed draft-pick values, and normalization context for blending.
 */
export async function GET() {
  const table = await buildCanonicalTable();
  return NextResponse.json({
    data: {
      players: table.players,
      pickValues: {
        dynastySf: parseFcPicks(table.fcPicks.dynastySf),
        redraft: parseFcPicks(table.fcPicks.redraft),
      },
      valueContext: computeValueContext(table.players),
    },
    meta: {
      source: table.meta.source,
      fetchedAt: table.meta.fetchedAt,
      ktcUnmatched: table.meta.ktcUnmatched,
      counts: table.meta.counts,
    },
  });
}
