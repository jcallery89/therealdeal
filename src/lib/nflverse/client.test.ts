import { describe, expect, it } from "vitest";
import { parseInjuryReports, parseSchedule, parseSnapCounts, parseWeeklyStats } from "./client";

const WEEKLY = `player_id,player_name,player_display_name,position,season,week,season_type,team,opponent_team,attempts,passing_yards,passing_tds,passing_interceptions,carries,rushing_yards,rushing_tds,receptions,targets,receiving_yards,receiving_tds,receiving_air_yards,target_share,air_yards_share,wopr,fantasy_points_ppr
00-1,P.Nacua,Puka Nacua,WR,2026,2,REG,LA,SF,0,0,0,0,1,5,0,9,12,120,1,100,0.35,0.4,0.8,33.5
00-2,J.Doe,John Doe,LB,2026,2,REG,SF,LA,0,0,0,0,0,0,0,0,0,0,0,0,NA,NA,NA,0
00-3,A.Back,Al Back,RB,2026,2,POST,SF,LA,0,0,0,0,10,50,0,1,2,5,0,0,0.05,0,0.1,6.5`;

describe("parseWeeklyStats", () => {
  it("keeps regular-season skill players and maps team codes to Sleeper's", () => {
    const rows = parseWeeklyStats(WEEKLY);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ gsisId: "00-1", team: "LAR", opponent: "SF", targets: 12, targetShare: 0.35, pprPoints: 33.5 });
  });
  it("rejects an unexpected file", () => {
    expect(() => parseWeeklyStats("<html></html>")).toThrow();
  });
});

describe("parseSnapCounts", () => {
  it("reads offensive snap share for skill players", () => {
    const csv = `game_id,season,game_type,week,player,pfr_player_id,position,team,opponent,offense_snaps,offense_pct
g,2026,REG,1,Puka Nacua,NacuPu00,WR,LA,SF,60,0.93
g,2026,REG,1,Big Guy,GuyBi00,G,LA,SF,60,1`;
    expect(parseSnapCounts(csv)).toEqual([
      { pfrId: "NacuPu00", name: "Puka Nacua", position: "WR", team: "LAR", week: 1, offensePct: 0.93 },
    ]);
  });
});

describe("parseInjuryReports", () => {
  it("keeps status, injury and practice participation", () => {
    const csv = `season,game_type,team,week,gsis_id,position,full_name,report_primary_injury,report_status,practice_primary_injury,practice_status
2026,REG,BAL,3,00-9,WR,Zay Flowers,Hamstring,Questionable,Hamstring,Limited Participation in Practice
2026,REG,BAL,3,00-8,WR,No Status,NA,NA,NA,Full Participation in Practice`;
    const rows = parseInjuryReports(csv);
    expect(rows[0]).toMatchObject({ name: "Zay Flowers", status: "Questionable", injury: "Hamstring" });
    expect(rows[1].status).toBeNull();
  });
});

describe("parseSchedule", () => {
  it("keeps the season's regular-season games with lines", () => {
    const csv = `game_id,season,game_type,week,gameday,gametime,away_team,away_score,home_team,home_score,spread_line,total_line
2026_04_TEN_BAL,2026,REG,4,2026-10-04,13:00,TEN,NA,BAL,NA,10.5,44.5
2025_01_A_B,2025,REG,1,2025-09-07,13:00,KC,20,LA,17,-3,47`;
    expect(parseSchedule(csv, "2026")).toEqual([
      {
        gameId: "2026_04_TEN_BAL",
        week: 4,
        kickoff: "2026-10-04T13:00",
        away: "TEN",
        home: "BAL",
        awayScore: null,
        homeScore: null,
        spread: 10.5,
        total: 44.5,
      },
    ]);
  });
});
