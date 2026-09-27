/**
 * Injury outlook: how much of the season a player is expected to miss, from
 * Sleeper's injury fields and recent news. Market values react to injuries
 * slowly (some sources refresh weekly), so the value engine applies this on
 * top of them.
 */

export interface Outlook {
  status: "season" | "multiweek" | "week";
  /** Short badge text, e.g. "Out for season". */
  label: string;
  /** Why we think so (a headline or Sleeper's note). */
  reason: string | null;
  /** Share of the remaining fantasy season he'll miss, 0-1. */
  missShare: number;
  /** Multiplier for long-term (dynasty/keeper) values from sources that haven't reacted yet. */
  longTermFactor: number;
  /** Same for FantasyCalc, net of the drop its market already shows. */
  fcLongTermFactor: number;
}

export interface OutlookNews {
  headline: string;
  description: string;
  published: string;
}

const SEASON_OUT =
  /(rest|remainder) of the (\d{4} )?(regular )?season|season[- ]ending|out for the (\d{4} )?season|miss(es|ing)? the (\d{4} )?season|torn (acl|achilles)|(acl|achilles) (tear|rupture)/i;
const MULTI_WEEK_STATUSES = new Set(["IR", "PUP", "NFI", "Sus", "Suspended"]);
const WEEK_STATUSES = new Set(["Out", "Doubtful"]);
/** News older than this doesn't decide anything. */
const NEWS_WINDOW_MS = 21 * 24 * 3600 * 1000;
/** IR means at least four games. */
const IR_MIN_WEEKS = 4;
/** Long-term hit for a lost season (lost development year + re-injury risk). */
const SEASON_OUT_LONG_TERM = 0.15;

/**
 * @param remainingWeeks fantasy weeks left including this one
 * @param marketDrop how far FantasyCalc already marked him down in 30 days
 *   (0.13 = 13%); its long-term discount only covers what's not priced in.
 *   The other sources publish no trend, so they get the full discount.
 */
export function computeOutlook(
  p: { injuryStatus: string | null; injuryNotes?: string | null },
  news: OutlookNews[],
  opts: { remainingWeeks: number; now: number; marketDrop?: number }
): Outlook | null {
  const remaining = Math.max(1, opts.remainingWeeks);
  const recent = news.filter((n) => {
    const age = opts.now - Date.parse(n.published);
    return age >= 0 && age <= NEWS_WINDOW_MS;
  });
  const seasonNews = recent.find((n) => SEASON_OUT.test(`${n.headline} ${n.description}`));
  const seasonNote = p.injuryNotes && SEASON_OUT.test(p.injuryNotes) ? p.injuryNotes : null;
  // Season-ending news only counts once Sleeper also lists him as injured.
  if (p.injuryStatus && (seasonNews || seasonNote)) {
    const alreadyPriced = Math.max(0, opts.marketDrop ?? 0);
    return {
      status: "season",
      label: "Out for season",
      reason: seasonNews ? seasonNews.headline : seasonNote,
      missShare: 1,
      longTermFactor: 1 - SEASON_OUT_LONG_TERM,
      fcLongTermFactor: 1 - Math.max(0, SEASON_OUT_LONG_TERM - alreadyPriced),
    };
  }
  if (p.injuryStatus && MULTI_WEEK_STATUSES.has(p.injuryStatus)) {
    return {
      status: "multiweek",
      label: p.injuryStatus === "IR" ? "IR" : p.injuryStatus,
      reason: p.injuryNotes ?? null,
      missShare: Math.min(1, IR_MIN_WEEKS / remaining),
      longTermFactor: 1,
      fcLongTermFactor: 1,
    };
  }
  if (p.injuryStatus && WEEK_STATUSES.has(p.injuryStatus)) {
    return {
      status: "week",
      label: p.injuryStatus,
      reason: p.injuryNotes ?? null,
      missShare: Math.min(1, 1 / remaining),
      longTermFactor: 1,
      fcLongTermFactor: 1,
    };
  }
  return null;
}

/** Team nicknames, for matching news that names a player by surname only. */
export const TEAM_NICKNAMES: Record<string, string> = {
  ARI: "Cardinals", ATL: "Falcons", BAL: "Ravens", BUF: "Bills", CAR: "Panthers", CHI: "Bears",
  CIN: "Bengals", CLE: "Browns", DAL: "Cowboys", DEN: "Broncos", DET: "Lions", GB: "Packers",
  HOU: "Texans", IND: "Colts", JAX: "Jaguars", KC: "Chiefs", LAC: "Chargers", LAR: "Rams",
  LV: "Raiders", MIA: "Dolphins", MIN: "Vikings", NE: "Patriots", NO: "Saints", NYG: "Giants",
  NYJ: "Jets", PHI: "Eagles", PIT: "Steelers", SEA: "Seahawks", SF: "49ers", TB: "Buccaneers",
  TEN: "Titans", WAS: "Commanders",
};

/** Does this article concern the player (tagged, full name, or surname + team)? */
export function newsMentions(
  item: { headline: string; description: string; espnIds: string[] },
  player: { name: string; team: string | null },
  playerEspnIds: string[]
): boolean {
  if (item.espnIds.some((id) => playerEspnIds.includes(id))) return true;
  const text = `${item.headline} ${item.description}`;
  if (text.includes(player.name)) return true;
  const surname = player.name.replace(/\s+(Jr\.?|Sr\.?|II|III|IV|V)$/i, "").split(" ").pop();
  const nickname = player.team ? TEAM_NICKNAMES[player.team] : undefined;
  return !!surname && surname.length > 2 && !!nickname && new RegExp(`\\b${surname}\\b`).test(text) && text.includes(nickname);
}
