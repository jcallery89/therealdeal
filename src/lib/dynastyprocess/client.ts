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

/** FantasyPros id -> Sleeper id, from the DynastyProcess player-id database. */
export function parseDpIds(raw: unknown): Record<string, string> {
  const rows = parseCsv(String(raw));
  if (rows.length === 0 || !("sleeper_id" in rows[0])) {
    throw new SyntaxError("DynastyProcess db_playerids.csv has an unexpected format");
  }
  const out: Record<string, string> = {};
  for (const r of rows) {
    if (present(r.fantasypros_id) && present(r.sleeper_id)) out[r.fantasypros_id] = r.sleeper_id;
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

export function getDpIds(): Promise<Sourced<Record<string, string>>> {
  return fetchWithFixture({
    key: "dynastyprocess:ids",
    url: `${BASE}/db_playerids.csv`,
    fixture: "dp-ids.json",
    ttlMs: TTL.players,
    asText: true,
    parse: parseDpIds,
  });
}
