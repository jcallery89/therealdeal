import { NextResponse } from "next/server";
import { LEAGUES } from "@/lib/config";
import { Sourced } from "@/lib/datasource";
import { getFcValues } from "@/lib/fantasycalc/client";
import { getDdValues } from "@/lib/dynastydealer/client";
import { getDtvPicks, getDtvValues } from "@/lib/dynastytradevalues/client";
import {
  getLeague,
  getLeagueUsers,
  getRosters,
  getState,
  getTradedPicks,
} from "@/lib/sleeper/client";
import { getPlayersMap } from "@/lib/sleeper/players";
import { getDpIds, getDpValues, getFpWeekly } from "@/lib/dynastyprocess/client";
import { getEspnNews } from "@/lib/espn/news";
import { getInjuryReports, getSchedule, getSnapCounts, getWeeklyStats } from "@/lib/nflverse/client";
import { getOwnership, getWeekProjections } from "@/lib/sleeper/stats";

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
  const state = await getState().catch(() => null);
  const season = state?.data.season ?? String(new Date().getFullYear());
  const week = state?.data.week ?? 1;
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
    check("dynasty dealer", () => getDdValues()),
    check("dynastytradevalues: 1QB", () => getDtvValues("1qb")),
    check("dynastytradevalues: superflex", () => getDtvValues("sf")),
    check("dynastytradevalues: picks", () => getDtvPicks()),
    check("dynastyprocess: values", () => getDpValues()),
    check("dynastyprocess: id crosswalk", () => getDpIds()),
    check("fantasypros: weekly expert rankings", () => getFpWeekly()),
    check("nflverse: weekly usage", () => getWeeklyStats(season)),
    check("nflverse: snap counts", () => getSnapCounts(season)),
    check("nflverse: injury reports", () => getInjuryReports(season)),
    check("nfldata: schedule & lines", () => getSchedule(season)),
    check("sleeper: weekly projections", () => getWeekProjections(season, week)),
    check("sleeper: ownership & start rates", () => getOwnership(season, week)),
    check("espn: news", () => getEspnNews()),
  ]);
  return NextResponse.json(
    { ok: checks.every((c) => c.ok), checkedAt: new Date().toISOString(), checks },
    { headers: { "Cache-Control": "no-store" } }
  );
}
