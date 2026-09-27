import { promises as fs } from "fs";
import path from "path";
import { cache } from "./cache";

/**
 * - "live": fetched just now.
 * - "cache": healthy — served from a recent fetch still within its TTL.
 * - "stale": the live fetch FAILED, so an older cached copy is being served.
 * - "fixture": demo mode (SLEEPER_FIXTURES=1).
 * - "unavailable": an optional source failed live with nothing cached.
 */
export type DataSourceKind = "live" | "cache" | "stale" | "fixture" | "unavailable";

export interface Sourced<T> {
  data: T;
  source: DataSourceKind;
  fetchedAt: number;
  /** Why the live fetch failed, when source is "stale". */
  error?: string;
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
  /** Response is text rather than JSON (e.g. CSV files). */
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

  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    try {
      const res = await fetch(opts.url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { "user-agent": "therealdeal-league-manager" },
      });
      if (!res.ok) throw new HttpError(res.status, opts.url);
      const raw = opts.asText ? await res.text() : await res.json();
      const data = opts.parse ? opts.parse(raw) : (raw as T);
      cache.set(opts.key, data, opts.ttlMs);
      return { data, source: "live", fetchedAt: Date.now() };
    } catch (err) {
      lastError = err;
      if (!isRetryable(err)) break;
    }
  }
  const error = describeError(lastError);
  console.warn(`[datasource] ${opts.key} failed: ${error}`);
  if (cached) {
    return { data: cached.data, source: "stale", fetchedAt: cached.fetchedAt, error };
  }
  throw new SourceUnavailableError(opts.key, lastError);
}

/** One retry for transient failures (network blips, rate limits, 5xx). */
const MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 400;

class HttpError extends Error {
  constructor(public status: number, url: string) {
    super(`HTTP ${status} for ${url}`);
  }
}

function isRetryable(err: unknown): boolean {
  if (err instanceof HttpError) return err.status === 429 || err.status >= 500;
  // Parse errors (bad JSON/HTML) won't fix themselves; network errors might.
  return !(err instanceof SyntaxError);
}

/** Short, user-readable reason for a failed fetch. */
export function describeError(err: unknown): string {
  if (err instanceof HttpError) {
    return err.status === 429 ? "rate limited (HTTP 429)" : `HTTP ${err.status}`;
  }
  if (err instanceof Error) {
    if (err.name === "TimeoutError" || err.name === "AbortError") return `timed out after ${FETCH_TIMEOUT_MS / 1000}s`;
    if (err instanceof SyntaxError) return "unexpected response format";
    return err.message || err.name;
  }
  return String(err);
}

export class SourceUnavailableError extends Error {
  constructor(key: string, cause: unknown) {
    super(`Data source unavailable: ${key} (${describeError(cause)})`);
    this.name = "SourceUnavailableError";
  }
}

/** Merge source metadata: live < cache < stale < fixture < unavailable (most degraded wins). */
export function worstSource(...sources: DataSourceKind[]): DataSourceKind {
  if (sources.includes("unavailable")) return "unavailable";
  if (sources.includes("fixture")) return "fixture";
  if (sources.includes("stale")) return "stale";
  if (sources.includes("cache")) return "cache";
  return "live";
}
