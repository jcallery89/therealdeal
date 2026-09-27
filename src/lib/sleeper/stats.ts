import { fetchWithFixture, Sourced } from "../datasource";
import { TTL } from "../config";

/** player_id -> stat line (e.g. pts_ppr, rec, pass_yd, gp). */
export type StatLines = Record<string, Record<string, number>>;

const FANTASY_POSITIONS = ["QB", "RB", "WR", "TE", "K", "DEF"];

/**
 * Sleeper's (undocumented) stats/projections endpoints return either an array
 * of `{player_id, stats}` rows or an object map `{player_id: stats}` depending
 * on the URL variant. Normalize both — and anything unexpected — to a map.
 */
export function normalizeStatLines(raw: unknown): StatLines {
  const out: StatLines = {};
  const add = (id: unknown, stats: unknown) => {
    if (typeof id !== "string" && typeof id !== "number") return;
    if (!stats || typeof stats !== "object" || Array.isArray(stats)) return;
    const clean: Record<string, number> = {};
    for (const [k, v] of Object.entries(stats as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v)) clean[k] = v;
    }
    out[String(id)] = clean;
  };

  if (Array.isArray(raw)) {
    for (const row of raw) {
      if (row && typeof row === "object") {
        const r = row as { player_id?: unknown; stats?: unknown };
        add(r.player_id, r.stats);
      }
    }
  } else if (raw && typeof raw === "object") {
    for (const [id, stats] of Object.entries(raw as Record<string, unknown>)) add(id, stats);
  }
  return out;
}

const positionParams = FANTASY_POSITIONS.map((p) => `position[]=${p}`).join("&");

/** Weekly projections. Best-effort: resolves to an empty map on failure. */
export async function getWeekProjections(season: string, week: number): Promise<Sourced<StatLines>> {
  try {
    return await fetchWithFixture<StatLines>({
      key: `sleeper:projections:${season}:${week}`,
      url: `https://api.sleeper.app/projections/nfl/${season}/${week}?season_type=regular&${positionParams}`,
      fixture: "projections-week.json",
      ttlMs: TTL.projections,
      parse: normalizeStatLines,
    }).then((r) => ({ ...r, data: normalizeStatLines(r.data) }));
  } catch {
    return { data: {}, source: "unavailable", fetchedAt: Date.now() };
  }
}

/** Season-to-date stat totals. Best-effort: empty map on failure. */
export async function getSeasonStats(season: string): Promise<Sourced<StatLines>> {
  try {
    return await fetchWithFixture<StatLines>({
      key: `sleeper:stats:${season}`,
      url: `https://api.sleeper.app/v1/stats/nfl/regular/${season}`,
      fixture: "stats-season.json",
      ttlMs: TTL.projections,
      parse: normalizeStatLines,
    }).then((r) => ({ ...r, data: normalizeStatLines(r.data) }));
  } catch {
    return { data: {}, source: "unavailable", fetchedAt: Date.now() };
  }
}

/** Full-season projections (Sleeper updates them in-season). Best-effort. */
export async function getSeasonProjections(season: string): Promise<Sourced<StatLines>> {
  try {
    return await fetchWithFixture<StatLines>({
      key: `sleeper:projections:${season}:season`,
      url: `https://api.sleeper.app/projections/nfl/${season}?season_type=regular&${positionParams}`,
      fixture: "projections-season.json",
      ttlMs: TTL.projections,
      parse: normalizeStatLines,
    }).then((r) => ({ ...r, data: normalizeStatLines(r.data) }));
  } catch {
    return { data: {}, source: "unavailable", fetchedAt: Date.now() };
  }
}

/**
 * Share of Sleeper leagues rostering / starting each player (0-100), from
 * Sleeper's research endpoint. Undocumented and best-effort: empty on failure.
 */
export type Ownership = Record<string, { owned: number; started: number }>;

export function parseOwnership(raw: unknown): Ownership {
  const out: Ownership = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    const r = v as { owned?: unknown; started?: unknown } | null;
    if (r && typeof r.owned === "number") {
      out[id] = { owned: r.owned, started: typeof r.started === "number" ? r.started : 0 };
    }
  }
  return out;
}

export async function getOwnership(season: string, week: number): Promise<Sourced<Ownership>> {
  try {
    return await fetchWithFixture<Ownership>({
      key: `sleeper:research:${season}:${week}`,
      url: `https://api.sleeper.app/players/nfl/research/regular/${season}/${week}`,
      fixture: "ownership.json",
      ttlMs: TTL.ownership,
      parse: parseOwnership,
    });
  } catch {
    return { data: {}, source: "unavailable", fetchedAt: Date.now() };
  }
}
