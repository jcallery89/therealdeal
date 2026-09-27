import { describe, expect, it } from "vitest";
import { parseDpIds, parseDpValues } from "./client";

const VALUES = `"player","pos","team","age","draft_year","ecr_1qb","ecr_2qb","ecr_pos","value_1qb","value_2qb","scrape_date","fp_id"
"Ja'Marr Chase","WR","CIN",26.6,2021,1.2,5.3,1.3,10208,9270,"2026-09-25","19788"
"Josh Allen","QB","BUF",30.3,2018,20,1.5,1.1,5500,10000,"2026-09-25","17298"
"2026 Pick 1.01","PICK",NA,NA,NA,22.4,16.6,NA,7300,7100,"2026-09-25",NA
"Free Guy","WR",NA,24,2024,300,300,99,10,12,"2026-09-25","99999"`;

const IDS = `mfl_id,fantasypros_id,gsis_id,sleeper_id,espn_id,pfr_id,name
1,19788,00-0036900,7564,4362628,ChasJa00,Ja'Marr Chase
2,17298,00-0034857,4984,3918298,AlleJo02,Josh Allen
3,NA,00-0099999,1234,NA,NA,No FP id
4,55555,00-0011111,NA,1,Nobo00,No Sleeper id`;

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
  it("maps each provider's ids to Sleeper ids, skipping incomplete rows", () => {
    const ids = parseDpIds(IDS);
    expect(ids.fp).toEqual({ "19788": "7564", "17298": "4984" });
    expect(ids.gsis).toEqual({ "00-0036900": "7564", "00-0034857": "4984", "00-0099999": "1234" });
    expect(ids.pfr).toEqual({ ChasJa00: "7564", AlleJo02: "4984" });
    expect(ids.espn).toEqual({ "4362628": "7564", "3918298": "4984" });
  });
});

const FP_WEEKLY = `"page","page_pos","scrape_date","fantasypros_id","player_name","pos","team","rank","ecr","sd","best","worst","pos_rank","start_sit_grade","r2p_pts"
"qb","QB",2026-09-27,"17298","Josh Allen","QB","BUF",1,1,0,1,1,"QB1","A+","24.5"
"ppr-wr","WR",2026-09-27,"19788","Ja'Marr Chase","WR","CIN",1,1.2,0.4,1,2,"WR1","A",NA
"k","K",2026-09-27,"1","Some Kicker","K","BUF",1,1,0,1,1,"K1","A","9"
"ppr-te","TE",2026-09-27,NA,"No Id","TE","BUF",9,9,1,8,10,"TE9",NA,NA`;

describe("parseFpWeekly", () => {
  it("keeps skill positions with positional rank, spread, grade and projection", async () => {
    const { parseFpWeekly } = await import("./client");
    const rows = parseFpWeekly(FP_WEEKLY);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ fpId: "17298", position: "QB", rank: 1, grade: "A+", projection: 24.5 });
    expect(rows[1]).toMatchObject({ position: "WR", rank: 1, sd: 0.4, projection: null });
  });
});
