import { TTL } from "../config";
import { fetchWithFixture, Sourced } from "../datasource";

/**
 * Dynasty Dealer (dynastydealer.com): free, keyless dynasty values computed
 * daily from 670k+ real Sleeper trades, nudged by community votes. Rows carry
 * Sleeper ids for a direct join. The API serves one value set (its superflex
 * flag doesn't change the numbers); its QB pricing tracks superflex markets,
 * so it's used for the superflex dynasty league only.
 */
const URL = "https://www.dynastydealer.com/api/player-values";

export interface DdPlayer {
  sleeperId: string;
  name: string;
  position: string;
  team: string | null;
  /** Trade-derived value adjusted by community votes. */
  value: number;
}

export interface DdValues {
  players: DdPlayer[];
  /** Draft picks, e.g. { name: "2027 Early 1st", value }. */
  picks: { name: string; value: number }[];
  /** Latest row update (ISO), i.e. how fresh the values are. */
  updatedAt?: string | null;
}

interface RawRow {
  sleeper_id?: string | number | null;
  name?: string;
  position?: string;
  team?: string | null;
  base_value?: number;
  current_value?: number;
  updated_at?: string;
}

const ORDINAL = ["", "1st", "2nd", "3rd", "4th", "5th"];

export function parseDdValues(raw: unknown): DdValues {
  const doc = raw as { players?: RawRow[] } | null;
  if (!doc || !Array.isArray(doc.players)) throw new SyntaxError("Dynasty Dealer values have an unexpected format");
  const out: DdValues = { players: [], picks: [], updatedAt: null };
  for (const r of doc.players) {
    if (r.updated_at && (!out.updatedAt || r.updated_at > out.updatedAt)) out.updatedAt = r.updated_at;
    const value = r.current_value ?? r.base_value;
    if (r.sleeper_id === undefined || r.sleeper_id === null || !r.name || typeof value !== "number") continue;
    const id = String(r.sleeper_id);
    // Picks: sleeper_id "pick_2027_1_early" -> "2027 Early 1st".
    const pick = id.match(/^pick_(\d{4})_(\d)_(early|mid|late)$/);
    if (pick) {
      const [, season, round, bucket] = pick;
      out.picks.push({ name: `${season} ${bucket[0].toUpperCase()}${bucket.slice(1)} ${ORDINAL[+round]}`, value });
      continue;
    }
    if (r.position === "PICK") continue;
    out.players.push({ sleeperId: id, name: r.name, position: r.position ?? "", team: r.team ?? null, value });
  }
  return out;
}

export function getDdValues(): Promise<Sourced<DdValues>> {
  return fetchWithFixture({
    key: "dynastydealer:values",
    url: URL,
    fixture: "dynastydealer.json",
    ttlMs: TTL.fantasycalc,
    parse: parseDdValues,
  });
}
