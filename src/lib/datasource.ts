import { promises as fs } from "fs";
import path from "path";
import { cache } from "./cache";

/** "unavailable": an optional source failed live with nothing cached. */
export type DataSourceKind = "live" | "cache" | "fixture" | "unavailable";

export interface Sourced<T> {
  data: T;
  source: DataSourceKind;
  fetchedAt: number;
}

export function fixturesMode(): boolean {
  return process.env.SLEEPER_FIXTURES === "1";
}

const FETCH_TIMEOUT_MS = 8000;
/** A user sync only refetches entries older than this (rate-limit guard). */
const SYNC_FLOOR_MS = 10_000;

async function readFixture<T>(fixture: string): Promise<T> {
  const file = path.join(process.cwd(), "fixtures", fixture);
  const raw = await fs.readFile(file, "utf-8");
  return JSON.parse(raw) as T;
}

export interface FetchOptions<T> {
  /** Cache key; also used to dedupe. */
  key: string;
  url: string;
  /** Path relative to fixtures/, served only in fixture (demo) mode. */
  fixture: string;
  ttlMs: number;
  /** Transform/validate the live response (fixtures store the parsed shape). */
  parse?: (raw: unknown) => T;
  /** Response is HTML/text rather than JSON (e.g. KTC scrape). */
  asText?: boolean;
  /** Skip the cache read (user-initiated sync); the result is still cached. */
  fresh?: boolean;
}

/**
 * Resolution order:
 *  1. SLEEPER_FIXTURES=1  -> fixture file (offline/demo mode)
 *  2. fresh in-memory cache (a sync bypasses it once the entry is >10s old)
 *  3. live fetch (8s timeout) -> cached
 *  4. stale cache entry
 *  5. throw — live mode never substitutes demo fixtures for real league data;
 *     callers either surface an error page or treat the source as unavailable.
 */
export async function fetchWithFixture<T>(opts: FetchOptions<T>): Promise<Sourced<T>> {
  if (fixturesMode()) {
    const data = await readFixture<T>(opts.fixture);
    return { data, source: "fixture", fetchedAt: Date.now() };
  }

  const cached = cache.get<T>(opts.key);
  const syncBypass = opts.fresh && cached !== null && Date.now() - cached.fetchedAt > SYNC_FLOOR_MS;
  if (cached?.fresh && !syncBypass) {
    return { data: cached.data, source: "cache", fetchedAt: cached.fetchedAt };
  }

  try {
    const res = await fetch(opts.url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "user-agent": "therealdeal-league-manager" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${opts.url}`);
    const raw = opts.asText ? await res.text() : await res.json();
    const data = opts.parse ? opts.parse(raw) : (raw as T);
    cache.set(opts.key, data, opts.ttlMs);
    return { data, source: "live", fetchedAt: Date.now() };
  } catch (err) {
    if (cached) {
      return { data: cached.data, source: "cache", fetchedAt: cached.fetchedAt };
    }
    throw new SourceUnavailableError(opts.key, err);
  }
}

export class SourceUnavailableError extends Error {
  constructor(key: string, cause: unknown) {
    super(`Data source unavailable: ${key} (${cause instanceof Error ? cause.message : String(cause)})`);
    this.name = "SourceUnavailableError";
  }
}

/** Merge source metadata: live < cache < fixture < unavailable (most degraded wins). */
export function worstSource(...sources: DataSourceKind[]): DataSourceKind {
  if (sources.includes("unavailable")) return "unavailable";
  if (sources.includes("fixture")) return "fixture";
  if (sources.includes("cache")) return "cache";
  return "live";
}
