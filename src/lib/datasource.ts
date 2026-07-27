import { promises as fs } from "fs";
import path from "path";
import { cache } from "./cache";

export type DataSourceKind = "live" | "cache" | "fixture";

export interface Sourced<T> {
  data: T;
  source: DataSourceKind;
  fetchedAt: number;
}

export function fixturesMode(): boolean {
  return process.env.SLEEPER_FIXTURES === "1";
}

const FETCH_TIMEOUT_MS = 8000;

async function readFixture<T>(fixture: string): Promise<T> {
  const file = path.join(process.cwd(), "fixtures", fixture);
  const raw = await fs.readFile(file, "utf-8");
  return JSON.parse(raw) as T;
}

export interface FetchOptions<T> {
  /** Cache key; also used to dedupe. */
  key: string;
  url: string;
  /** Path relative to fixtures/, served in fixture mode or as last resort. */
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
 *  2. fresh in-memory cache
 *  3. live fetch (8s timeout) -> cached
 *  4. stale cache entry
 *  5. fixture file (so the UI degrades to demo data, never a blank page)
 */
export async function fetchWithFixture<T>(opts: FetchOptions<T>): Promise<Sourced<T>> {
  if (fixturesMode()) {
    const data = await readFixture<T>(opts.fixture);
    return { data, source: "fixture", fetchedAt: Date.now() };
  }

  const cached = cache.get<T>(opts.key);
  if (cached?.fresh && !opts.fresh) {
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
    console.warn(`[datasource] live fetch failed for ${opts.key}, using fixture:`, err);
    const data = await readFixture<T>(opts.fixture);
    return { data, source: "fixture", fetchedAt: Date.now() };
  }
}

/** Merge source metadata: live < cache < fixture (most degraded wins). */
export function worstSource(...sources: DataSourceKind[]): DataSourceKind {
  if (sources.includes("fixture")) return "fixture";
  if (sources.includes("cache")) return "cache";
  return "live";
}
