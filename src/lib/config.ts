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

export const LEAGUES: LeagueConfig[] = [
  {
    id: "1377306985065619456",
    label: "The Real Deal",
    short: "Keeper",
    format: "keeper_ppr_tep",
    numQbs: 1,
    isDynasty: false,
    description: "10-team Keeper · PPR · TE Premium",
  },
  {
    id: "1315718697288990720",
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
 * Team bye weeks. Sleeper's player blob does not reliably carry byes, so this
 * is a static per-season map — update once each season when the NFL schedule
 * drops (see README). Empty/missing entries simply hide bye badges.
 */
export const BYE_WEEKS: Record<string, number> = {
  ATL: 5, CHI: 5, GB: 5, PIT: 5,
  HOU: 6, MIN: 6,
  BAL: 7, BUF: 7,
  ARI: 8, DET: 8, JAX: 8, LV: 8, LAR: 8, SEA: 8,
  CLE: 9, NYJ: 9, PHI: 9, TB: 9,
  CIN: 10, DAL: 10, KC: 10, TEN: 10,
  IND: 11, NO: 11,
  DEN: 12, LAC: 12, MIA: 12, WAS: 12,
  CAR: 14, NE: 14, NYG: 14, SF: 14,
};
