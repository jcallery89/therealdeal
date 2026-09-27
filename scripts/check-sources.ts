/**
 * Live check of every value source: fetches them, joins them to Sleeper's
 * player database exactly as the app does, and prints health, match counts
 * and each source's top players. Run from a network that can reach the
 * providers — e.g. the "Source check" GitHub Action:
 *
 *   npx tsx scripts/check-sources.ts
 */
import { LEAGUES } from "../src/lib/config";
import { getEspnNews } from "../src/lib/espn/news";
import { getInjuryReports } from "../src/lib/nflverse/client";
import { buildCanonicalTable } from "../src/lib/players/canonical";
import {
  computeValueContext,
  HORIZON_SOURCES,
  playerValue,
  SOURCE_LABELS,
  sourceValue,
  staleFor,
  ValueHorizon,
} from "../src/lib/values/engine";

async function main() {
  const table = await buildCanonicalTable();
  console.log("source health:", JSON.stringify(table.meta.sources));
  console.log("players matched per source:", JSON.stringify(table.meta.counts));
  console.log(`picks: dd ${table.ddPicks.length}, dtv ${table.dtvPicks.length}, dp ${table.dpPicks.length}`);

  const ctx = computeValueContext(table.players, {}, table.meta.sourceDates);
  console.log("source dates:", JSON.stringify(Object.fromEntries(Object.entries(table.meta.sourceDates).map(([k, v]) => [k, new Date(v).toISOString()]))));
  const players = Object.values(table.players);
  for (const horizon of ["dynasty", "keeper"] as ValueHorizon[]) {
    const league = LEAGUES.find((l) => l.isDynasty === (horizon === "dynasty"))!;
    console.log(`\n=== ${horizon} (${league.label})`);
    for (const s of HORIZON_SOURCES[horizon]) {
      const top = players
        .map((p) => ({ p, v: sourceValue(p, horizon, s, ctx) }))
        .filter((x) => x.v > 0)
        .sort((a, b) => b.v - a.v);
      console.log(
        `${SOURCE_LABELS[s]} (${top.length} players): ` +
          top.slice(0, 8).map((x) => `${x.p.name} ${x.p.position} ${Math.round(x.v)}`).join(" | ")
      );
    }
    const consensus = players
      .map((p) => ({ p, v: playerValue(p, league, { horizon, source: "consensus" }, ctx) }))
      .sort((a, b) => b.v - a.v)
      .slice(0, 12);
    console.log("Consensus:", consensus.map((x) => `${x.p.name} ${x.v}`).join(" | "));
  }
}

/** PLAYER="Name" prints everything every source knows about one player. */
async function inspectPlayer(name: string) {
  const table = await buildCanonicalTable();
  const matches = Object.values(table.players).filter((p) => p.name.toLowerCase() === name.toLowerCase());
  console.log(`\n=== ${name}: ${matches.length} match(es)`);
  const raw = (await (await fetch("https://api.sleeper.app/v1/players/nfl")).json()) as Record<string, Record<string, unknown>>;
  for (const p of matches) {
    const r = raw[p.sleeperId] ?? {};
    const keys = Object.keys(r).filter((k) => /injur|status|practice|news|depth|team|active/i.test(k));
    console.log("sleeper fields:", JSON.stringify(Object.fromEntries(keys.map((k) => [k, r[k]]))));
    console.log("values:", JSON.stringify(p.values));
    console.log("outlook:", JSON.stringify(p.outlook ?? null));
    const ctx = computeValueContext(table.players, {}, table.meta.sourceDates);
    const stale = (["fc", "dp", "dd", "dtv"] as const).filter((s) => staleFor(p, s, ctx));
    console.log("sources predating his injury news (ignored in consensus):", stale.join(", ") || "none");
    for (const league of LEAGUES) {
      for (const horizon of (league.isDynasty ? ["dynasty"] : ["season", "keeper"]) as ValueHorizon[]) {
        const mode = { horizon, source: "consensus" as const };
        const before = playerValue({ ...p, outlook: undefined }, league, mode, ctx);
        console.log(`${league.label} ${horizon}: ${before} -> ${playerValue(p, league, mode, ctx)} after injury outlook`);
      }
    }
    const espnIds = Object.entries(table.ids.espn).filter(([, sid]) => sid === p.sleeperId).map(([e]) => e);
    const gsis = Object.entries(table.ids.gsis).filter(([, sid]) => sid === p.sleeperId).map(([g]) => g);
    const news = await getEspnNews().catch(() => null);
    for (const n of news?.data ?? []) {
      if (n.espnIds.some((e) => espnIds.includes(e)) || n.headline.includes(p.name.split(" ").pop()!)) {
        console.log("espn news:", n.published, "|", n.headline, "|", n.description.slice(0, 200));
      }
    }
    const season = String(new Date().getFullYear());
    const reports = await getInjuryReports(season).catch(() => null);
    for (const r of reports?.data ?? []) if (gsis.includes(r.gsisId)) console.log("injury report:", JSON.stringify(r));
  }
}

main()
  .then(() => (process.env.PLAYER ? inspectPlayer(process.env.PLAYER) : undefined))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
