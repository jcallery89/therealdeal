import { TTL } from "../config";
import { parseCsv } from "../csv";
import { fetchWithFixture, Sourced } from "../datasource";

/**
 * DynastyProcess open data (github.com/dynastyprocess/data): dynasty trade
 * values derived from FantasyPros expert consensus rankings, in both 1QB and
 * superflex, refreshed roughly daily. Free and hosted on GitHub.
 */
const BASE = "https://raw.githubusercontent.com/dynastyprocess/data/master/files";

export interface DpPlayer {
  name: string;
  position: string;
  team: string | null;
  /** FantasyPros player id, joined to Sleeper via the crosswalk. */
  fpId: string;
  value1qb: number;
  value2qb: number;
}

export interface DpPick {
  /** e.g. "2026 Pick 1.03" or "2027 Early 1st". */
  name: string;
  value1qb: number;
  value2qb: number;
}

export interface DpValues {
  players: DpPlayer[];
  picks: DpPick[];
}

const num = (s: string | undefined) => {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};
const present = (s: string | undefined) => s !== undefined && s !== "" && s !== "NA";

export function parseDpValues(raw: unknown): DpValues {
  const rows = parseCsv(String(raw));
  if (rows.length === 0 || !("value_2qb" in rows[0])) {
    throw new SyntaxError("DynastyProcess values.csv has an unexpected format");
  }
  const players: DpPlayer[] = [];
  const picks: DpPick[] = [];
  for (const r of rows) {
    if (r.pos === "PICK") {
      picks.push({ name: r.player, value1qb: num(r.value_1qb), value2qb: num(r.value_2qb) });
    } else if (present(r.fp_id)) {
      players.push({
        name: r.player,
        position: r.pos,
        team: present(r.team) ? r.team : null,
        fpId: r.fp_id,
        value1qb: num(r.value_1qb),
        value2qb: num(r.value_2qb),
      });
    }
  }
  return { players, picks };
}

/** Other providers' player ids -> Sleeper id, from db_playerids.csv. */
export interface IdCrosswalk {
  /** FantasyPros (DynastyProcess values). */
  fp: Record<string, string>;
  /** NFL GSIS (nflverse stats and injuries). */
  gsis: Record<string, string>;
  /** Pro Football Reference (nflverse snap counts). */
  pfr: Record<string, string>;
  /** ESPN (news). */
  espn: Record<string, string>;
}

export const EMPTY_CROSSWALK: IdCrosswalk = { fp: {}, gsis: {}, pfr: {}, espn: {} };

export function parseDpIds(raw: unknown): IdCrosswalk {
  const rows = parseCsv(String(raw));
  if (rows.length === 0 || !("sleeper_id" in rows[0])) {
    throw new SyntaxError("DynastyProcess db_playerids.csv has an unexpected format");
  }
  const out: IdCrosswalk = { fp: {}, gsis: {}, pfr: {}, espn: {} };
  const cols = { fp: "fantasypros_id", gsis: "gsis_id", pfr: "pfr_id", espn: "espn_id" } as const;
  for (const r of rows) {
    if (!present(r.sleeper_id)) continue;
    for (const [key, col] of Object.entries(cols) as [keyof IdCrosswalk, string][]) {
      if (present(r[col])) out[key][r[col]] = r.sleeper_id;
    }
  }
  return out;
}

export function getDpValues(): Promise<Sourced<DpValues>> {
  return fetchWithFixture({
    key: "dynastyprocess:values",
    url: `${BASE}/values.csv`,
    fixture: "dp-values.json",
    ttlMs: TTL.dynastyprocess,
    asText: true,
    parse: parseDpValues,
  });
}

export function getDpIds(): Promise<Sourced<IdCrosswalk>> {
  return fetchWithFixture({
    key: "dynastyprocess:ids",
    url: `${BASE}/db_playerids.csv`,
    fixture: "id-crosswalk.json",
    ttlMs: TTL.players,
    asText: true,
    parse: parseDpIds,
  });
}

/**
 * This week's FantasyPros expert consensus rankings (ECR), scraped daily by
 * DynastyProcess: ~100 experts' positional ranks with their spread.
 */
export interface FpWeeklyRank {
  fpId: string;
  name: string;
  position: string;
  team: string | null;
  /** Consensus positional rank (1 = best). */
  rank: number;
  best: number;
  worst: number;
  /** Standard deviation of expert ranks: higher = more disagreement. */
  sd: number;
  /** FantasyPros start/sit grade, e.g. "A+" or "C-". */
  grade: string | null;
  /** FantasyPros projected points (standard PPR). */
  projection: number | null;
  scrapeDate: string;
}

const FP_PAGES: Record<string, string> = { qb: "QB", "ppr-rb": "RB", "ppr-wr": "WR", "ppr-te": "TE" };

export function parseFpWeekly(raw: unknown): FpWeeklyRank[] {
  const rows = parseCsv(String(raw));
  if (rows.length === 0 || !("ecr" in rows[0]) || !("fantasypros_id" in rows[0])) {
    throw new SyntaxError("FantasyPros weekly rankings have an unexpected format");
  }
  const out: FpWeeklyRank[] = [];
  for (const r of rows) {
    const position = FP_PAGES[r.page];
    if (!position || !present(r.fantasypros_id)) continue;
    // Positional rank: "WR14" -> 14, else the page rank.
    const posRank = Number((r.pos_rank ?? "").replace(/^\D+/, ""));
    out.push({
      fpId: r.fantasypros_id,
      name: r.player_name,
      position,
      team: present(r.team) ? r.team : null,
      rank: Number.isFinite(posRank) && posRank > 0 ? posRank : num(r.rank),
      best: num(r.best),
      worst: num(r.worst),
      sd: num(r.sd),
      grade: present(r.start_sit_grade) ? r.start_sit_grade : null,
      projection: present(r.r2p_pts) ? num(r.r2p_pts) : null,
      scrapeDate: r.scrape_date,
    });
  }
  return out;
}

export function getFpWeekly(): Promise<Sourced<FpWeeklyRank[]>> {
  return fetchWithFixture({
    key: "dynastyprocess:fp-weekly",
    url: `${BASE}/fp_latest_weekly.csv`,
    fixture: "fp-weekly.json",
    ttlMs: TTL.news * 4,
    asText: true,
    parse: parseFpWeekly,
  });
}
