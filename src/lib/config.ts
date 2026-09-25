export type LeagueFormat = "keeper_ppr_tep" | "dynasty_sf_ppr_tep";

export interface LeagueConfig {
  id: string;
  label: string;
  short: string;
  format: LeagueFormat;
  numQbs: 1 | 2;
  isDynasty: boolean;
  description: string;
}

/**
 * Sleeper issues a NEW league_id every season when a league renews. Override
 * the IDs via NEXT_PUBLIC_LEAGUE_ID_KEEPER / NEXT_PUBLIC_LEAGUE_ID_DYNASTY
 * (e.g. in Vercel project settings) instead of editing code each year.
 */
const KEEPER_LEAGUE_ID = process.env.NEXT_PUBLIC_LEAGUE_ID_KEEPER || "1377306985065619456";
const DYNASTY_LEAGUE_ID = process.env.NEXT_PUBLIC_LEAGUE_ID_DYNASTY || "1315718697288990720";

export const LEAGUES: LeagueConfig[] = [
  {
    id: KEEPER_LEAGUE_ID,
    label: "The Real Deal",
    short: "Keeper",
    format: "keeper_ppr_tep",
    numQbs: 1,
    isDynasty: false,
    description: "10-team Keeper · PPR · TE Premium",
  },
  {
    id: DYNASTY_LEAGUE_ID,
    label: "Dynasty League",
    short: "Dynasty SF",
    format: "dynasty_sf_ppr_tep",
    numQbs: 2,
    isDynasty: true,
    description: "10-team Dynasty · Superflex · PPR · TEP",
  },
];

export function getLeagueConfig(leagueId: string): LeagueConfig | undefined {
  return LEAGUES.find((l) => l.id === leagueId);
}

/**
 * Both leagues are TE Premium; FantasyCalc/KTC values are TEP-agnostic, so TE
 * values get a small visible bump ("TEP adj" in the UI).
 */
export const TE_PREMIUM_MULTIPLIER = 1.05;

/** How many future seasons of rookie picks each team natively owns. */
export const PICK_SEASONS_AHEAD = 3;
export const ROOKIE_DRAFT_ROUNDS = 4;

export const TTL = {
  players: 24 * 60 * 60 * 1000,
  fantasycalc: 12 * 60 * 60 * 1000,
  ktc: 24 * 60 * 60 * 1000,
  league: 5 * 60 * 1000,
  trending: 15 * 60 * 1000,
  state: 15 * 60 * 1000,
  projections: 6 * 60 * 60 * 1000,
  canonical: 60 * 60 * 1000,
} as const;

/**
 * 2026 NFL bye weeks (Weeks 5-14; no byes in Week 12). Sleeper's player blob
 * doesn't carry byes, so this is a static per-season map — update it each May
 * when the NFL schedule is released (see README).
 */
export const BYE_WEEKS_SEASON = "2026";
export const BYE_WEEKS: Record<string, number> = {
  KC: 5, CAR: 5,
  CIN: 6, DET: 6, MIA: 6, MIN: 6,
  BUF: 7, JAX: 7, LAC: 7, WAS: 7,
  HOU: 8, NO: 8, NYG: 8, SF: 8,
  PIT: 9, TEN: 9,
  CHI: 10, DEN: 10, PHI: 10, TB: 10,
  ATL: 11, CLE: 11, GB: 11, LAR: 11, NE: 11, SEA: 11,
  BAL: 13, IND: 13, LV: 13, NYJ: 13,
  ARI: 14, DAL: 14,
};
