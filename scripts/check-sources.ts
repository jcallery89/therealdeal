/**
 * Live check of every value source: fetches them, joins them to Sleeper's
 * player database exactly as the app does, and prints health, match counts
 * and each source's top players. Run from a network that can reach the
 * providers — e.g. the "Source check" GitHub Action:
 *
 *   npx tsx scripts/check-sources.ts
 */
import { LEAGUES } from "../src/lib/config";
import { buildCanonicalTable } from "../src/lib/players/canonical";
import {
  computeValueContext,
  HORIZON_SOURCES,
  playerValue,
  SOURCE_LABELS,
  sourceValue,
  ValueHorizon,
} from "../src/lib/values/engine";

async function main() {
  const table = await buildCanonicalTable();
  console.log("source health:", JSON.stringify(table.meta.sources));
  console.log("players matched per source:", JSON.stringify(table.meta.counts));
  console.log(`picks: dd ${table.ddPicks.length}, dtv ${table.dtvPicks.length}, dp ${table.dpPicks.length}`);

  const ctx = computeValueContext(table.players);
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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
