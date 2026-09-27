import { describe, expect, it } from "vitest";
import { parseEspnNews } from "./news";

describe("parseEspnNews", () => {
  it("extracts headlines with athlete ids", () => {
    const items = parseEspnNews({
      articles: [
        {
          headline: "Cook out",
          published: "2026-10-01T12:00:00Z",
          links: { web: { href: "https://espn.com/x" } },
          categories: [{ type: "athlete", athleteId: 4379399 }, { type: "team", teamId: 2 }],
        },
        { description: "no headline" },
      ],
    });
    expect(items).toEqual([
      { headline: "Cook out", description: "", published: "2026-10-01T12:00:00Z", url: "https://espn.com/x", espnIds: ["4379399"] },
    ]);
  });
  it("rejects an unexpected payload", () => {
    expect(() => parseEspnNews({ nope: true })).toThrow();
  });
});
