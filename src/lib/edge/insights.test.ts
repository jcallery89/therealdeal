import { beforeAll, describe, expect, it } from "vitest";
import type { LeagueBundle } from "../leagueBundle";
import type { EdgeInputs, Insight } from "./types";

// Runs the whole pipeline on the demo fixtures (see scripts/generate-fixtures.mjs).
process.env.SLEEPER_FIXTURES = "1";

const DYNASTY = "1315718697288990720";
let bundle: LeagueBundle;
let inputs: EdgeInputs;
let insights: Insight[];

beforeAll(async () => {
  const { getLeagueBundle } = await import("../bundle");
  const { getEdgeInputs } = await import("./data");
  const { buildInsights } = await import("./insights");
  bundle = (await getLeagueBundle(DYNASTY))!;
  inputs = await getEdgeInputs(bundle);
  insights = buildInsights(bundle, inputs, 1);
});

describe("buildInsights (demo league)", () => {
  it("flags the backup of an injured starter as next man up, with several sources", () => {
    const gem = insights.find((i) => i.kind === "waiver" && i.title.includes("Ray Davis"));
    expect(gem?.title).toMatch(/^Next man up/);
    expect(new Set(gem!.signals.map((s) => s.source)).size).toBeGreaterThanOrEqual(4);
  });

  it("puts an injured starter first and names the replacement", () => {
    expect(insights[0].urgent).toBe(true);
    const cook = insights.find((i) => i.kind === "injury" && i.title.includes("James Cook"));
    expect(cook?.detail).toContain("Ray Davis");
  });

  it("finds buy-lows on other rosters and sell-highs on mine", () => {
    const buy = insights.find((i) => i.kind === "buy" && i.title.includes("Garrett Wilson"));
    expect(buy?.href).toContain("/trade?a=1&b=");
    expect(insights.some((i) => i.kind === "sell")).toBe(true);
  });

  it("gives every insight a unique, stable id", async () => {
    const ids = insights.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    const { buildInsights } = await import("./insights");
    expect(buildInsights(bundle, inputs, 1).map((i) => i.id)).toEqual(ids);
  });

  it("stops lineup alerts once games have kicked off", async () => {
    const { buildInsights } = await import("./insights");
    const later = buildInsights(bundle, { ...inputs, asOf: inputs.asOf + 30 * 24 * 3600 * 1000 }, 1);
    expect(later.some((i) => i.kind === "injury" || i.kind === "lineup")).toBe(false);
  });

  it("without a linked team, still surfaces league-wide waiver gems", async () => {
    const { buildInsights } = await import("./insights");
    const anon = buildInsights(bundle, inputs, null);
    expect(anon.some((i) => i.kind === "waiver")).toBe(true);
    expect(anon.some((i) => i.kind === "injury" || i.kind === "sell")).toBe(false);
  });
});
