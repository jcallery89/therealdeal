import { NextResponse } from "next/server";
import { LEAGUES } from "@/lib/config";
import { Sourced } from "@/lib/datasource";
import { getFcValues } from "@/lib/fantasycalc/client";
import { getKtcValues } from "@/lib/ktc/scrape";
import {
  getLeague,
  getLeagueUsers,
  getRosters,
  getState,
  getTradedPicks,
} from "@/lib/sleeper/client";
import { getPlayersMap } from "@/lib/sleeper/players";

export const dynamic = "force-dynamic";

interface Check {
  name: string;
  ok: boolean;
  source: string;
  ms: number;
  error?: string;
}

async function check(name: string, run: () => Promise<Sourced<unknown>>): Promise<Check> {
  const start = Date.now();
  try {
    const r = await run();
    return {
      name,
      ok: r.source !== "stale" && r.source !== "unavailable",
      source: r.source,
      ms: Date.now() - start,
      ...(r.error ? { error: r.error } : {}),
    };
  } catch (err) {
    return {
      name,
      ok: false,
      source: "failed",
      ms: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Diagnostics: tries every upstream data source (bypassing the cache where the
 * sync rate-limit allows) and reports status, timing, and the exact error.
 * Open /api/health in a browser when a "didn't respond" banner appears.
 */
export async function GET() {
  const checks = await Promise.all([
    check("sleeper: state", () => getState(true)),
    check("sleeper: players database", () => getPlayersMap()),
    ...LEAGUES.flatMap((l) => [
      check(`sleeper: ${l.label} settings`, () => getLeague(l.id, true)),
      check(`sleeper: ${l.label} rosters`, () => getRosters(l.id, true)),
      check(`sleeper: ${l.label} members`, () => getLeagueUsers(l.id, true)),
      check(`sleeper: ${l.label} traded picks`, () => getTradedPicks(l.id, true)),
    ]),
    check("fantasycalc: dynasty superflex", () => getFcValues("dynasty_sf")),
    check("fantasycalc: redraft", () => getFcValues("redraft_1qb")),
    check("keeptradecut", () => getKtcValues()),
  ]);
  return NextResponse.json(
    { ok: checks.every((c) => c.ok), checkedAt: new Date().toISOString(), checks },
    { headers: { "Cache-Control": "no-store" } }
  );
}
