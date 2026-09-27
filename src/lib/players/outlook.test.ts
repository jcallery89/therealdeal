import { describe, expect, it } from "vitest";
import { computeOutlook, newsMentions } from "./outlook";

const NOW = Date.parse("2026-09-27T12:00:00Z");
const opts = { remainingWeeks: 15, now: NOW };
const news = (headline: string, description = "", daysAgo = 1) => ({
  headline,
  description,
  published: new Date(NOW - daysAgo * 86400000).toISOString(),
});

describe("computeOutlook", () => {
  it("detects a season-ending injury from news once Sleeper lists him as hurt", () => {
    const o = computeOutlook(
      { injuryStatus: "IR", injuryNotes: "Surgery" },
      [news("Giants' offense about to 'shift' with Jameis Winston", "Winston has to take over for the rest of the season.")],
      opts
    );
    expect(o).toMatchObject({ status: "season", label: "Out for season", missShare: 1, longTermFactor: 0.85 });
  });

  it("nets the long-term discount against FantasyCalc's own drop", () => {
    const o = computeOutlook({ injuryStatus: "IR" }, [news("Out for the season")], { ...opts, marketDrop: 0.1 });
    expect(o?.fcLongTermFactor).toBeCloseTo(0.95);
    expect(computeOutlook({ injuryStatus: "IR" }, [news("Out for the season")], { ...opts, marketDrop: 0.3 })?.fcLongTermFactor).toBe(1);
  });

  it("ignores season-ending talk for healthy players and stale news", () => {
    expect(computeOutlook({ injuryStatus: null }, [news("out for the season")], opts)).toBeNull();
    expect(computeOutlook({ injuryStatus: "IR" }, [news("out for the season", "", 40)], opts)?.status).toBe("multiweek");
  });

  it("reads Sleeper's own note", () => {
    expect(computeOutlook({ injuryStatus: "IR", injuryNotes: "Torn ACL" }, [], opts)?.status).toBe("season");
  });

  it("estimates missed time for IR and weekly statuses", () => {
    expect(computeOutlook({ injuryStatus: "IR" }, [], opts)).toMatchObject({ status: "multiweek", missShare: 4 / 15, longTermFactor: 1 });
    expect(computeOutlook({ injuryStatus: "Out" }, [], opts)).toMatchObject({ status: "week", missShare: 1 / 15 });
    expect(computeOutlook({ injuryStatus: "Questionable" }, [], opts)).toBeNull();
  });
});

describe("newsMentions", () => {
  const dart = { name: "Jaxson Dart", team: "NYG" };
  const item = (headline: string, description = "", espnIds: string[] = []) => ({ headline, description, espnIds });
  it("matches tags, full names, or surname plus team", () => {
    expect(newsMentions(item("x", "", ["123"]), dart, ["123"])).toBe(true);
    expect(newsMentions(item("Jaxson Dart scheduled for surgery"), dart, [])).toBe(true);
    expect(newsMentions(item("Giants shift", "The offense had Dart as QB"), dart, [])).toBe(true);
  });
  it("doesn't match a surname without the team", () => {
    expect(newsMentions(item("Dart throws", "a dart at the board"), dart, [])).toBe(false);
  });
});
