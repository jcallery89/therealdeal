import { describe, expect, it } from "vitest";
import { parseDpIds, parseDpValues } from "./client";

const VALUES = `"player","pos","team","age","draft_year","ecr_1qb","ecr_2qb","ecr_pos","value_1qb","value_2qb","scrape_date","fp_id"
"Ja'Marr Chase","WR","CIN",26.6,2021,1.2,5.3,1.3,10208,9270,"2026-09-25","19788"
"Josh Allen","QB","BUF",30.3,2018,20,1.5,1.1,5500,10000,"2026-09-25","17298"
"2026 Pick 1.01","PICK",NA,NA,NA,22.4,16.6,NA,7300,7100,"2026-09-25",NA
"Free Guy","WR",NA,24,2024,300,300,99,10,12,"2026-09-25","99999"`;

const IDS = `mfl_id,fantasypros_id,sleeper_id,name
1,19788,7564,Ja'Marr Chase
2,17298,4984,Josh Allen
3,NA,1234,No FP id
4,55555,NA,No Sleeper id`;

describe("parseDpValues", () => {
  const dp = parseDpValues(VALUES);

  it("splits players and picks with both 1QB and superflex values", () => {
    expect(dp.players).toHaveLength(3);
    expect(dp.players[1]).toEqual({
      name: "Josh Allen",
      position: "QB",
      team: "BUF",
      fpId: "17298",
      value1qb: 5500,
      value2qb: 10000,
    });
    expect(dp.picks).toEqual([{ name: "2026 Pick 1.01", value1qb: 7300, value2qb: 7100 }]);
  });

  it("treats NA team as null", () => {
    expect(dp.players[2].team).toBeNull();
  });

  it("rejects an unexpected file", () => {
    expect(() => parseDpValues("<html>moved</html>")).toThrow();
  });
});

describe("parseDpIds", () => {
  it("maps FantasyPros ids to Sleeper ids, skipping incomplete rows", () => {
    expect(parseDpIds(IDS)).toEqual({ "19788": "7564", "17298": "4984" });
  });
});
