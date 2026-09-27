import { TTL } from "../config";
import { fetchWithFixture, Sourced } from "../datasource";

/**
 * DynastyTradeValues (dynastytradevalues.com): free public API of algorithmic
 * dynasty trade values built from ADP/market data. Name-keyed (no Sleeper
 * ids), so rows are joined by normalized name + position/team.
 */
const BASE = "https://dynastytradevalues.com/wp-json/dtc/v1/public";

export interface DtvPlayer {
  name: string;
  position: string;
  team: string | null;
  value: number;
}

export interface DtvValues {
  players: DtvPlayer[];
  /** "1qb" or "sf", as reported by the API. */
  format: string;
  generatedAt: string | null;
}

interface RawRow {
  name?: string;
  position?: string;
  team?: string | null;
  value?: number;
}

export function parseDtvValues(raw: unknown): DtvValues {
  const doc = raw as { players?: RawRow[]; format?: string; generated_at?: string } | null;
  if (!doc || !Array.isArray(doc.players)) throw new SyntaxError("DynastyTradeValues has an unexpected format");
  const players: DtvPlayer[] = [];
  for (const r of doc.players) {
    if (!r.name || typeof r.value !== "number" || !["QB", "RB", "WR", "TE"].includes(r.position ?? "")) continue;
    players.push({ name: r.name, position: r.position!, team: r.team || null, value: r.value });
  }
  return {
    players,
    format: doc.format ?? "1qb",
    generatedAt: doc.generated_at ?? null,
  };
}

/** Rookie pick values, slot-named ("2027 Pick 1.01"); same in 1QB and superflex. */
export function parseDtvPicks(raw: unknown): { name: string; value: number }[] {
  const doc = raw as { picks?: { name?: string; value?: number }[] } | null;
  if (!doc || !Array.isArray(doc.picks)) throw new SyntaxError("DynastyTradeValues picks have an unexpected format");
  return doc.picks
    .filter((p) => p.name && typeof p.value === "number")
    .map((p) => ({ name: p.name!, value: p.value! }));
}

export function getDtvPicks(): Promise<Sourced<{ name: string; value: number }[]>> {
  return fetchWithFixture({
    key: "dynastytradevalues:picks",
    url: `${BASE}/pick-values?limit=200`,
    fixture: "dtv-picks.json",
    ttlMs: TTL.fantasycalc,
    // A small WordPress host that drops some requests: try harder.
    attempts: 3,
    parse: parseDtvPicks,
  });
}

export function getDtvValues(format: "1qb" | "sf"): Promise<Sourced<DtvValues>> {
  return fetchWithFixture({
    key: `dynastytradevalues:${format}`,
    url: `${BASE}/player-values?limit=2000${format === "sf" ? "&format=sf" : ""}`,
    fixture: format === "sf" ? "dtv-sf.json" : "dtv-1qb.json",
    ttlMs: TTL.fantasycalc,
    attempts: 3,
    parse: parseDtvValues,
  });
}
