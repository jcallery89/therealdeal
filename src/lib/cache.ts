/**
 * In-memory TTL cache. Entries are kept after expiry so callers can fall back
 * to stale data when a live refresh fails. The narrow get/set interface is the
 * seam for swapping in Redis/KV or a database later.
 */
interface Entry {
  data: unknown;
  fetchedAt: number;
  expiresAt: number;
}

const store = new Map<string, Entry>();

export interface CacheHit<T> {
  data: T;
  fetchedAt: number;
  fresh: boolean;
}

export const cache = {
  get<T>(key: string): CacheHit<T> | null {
    const entry = store.get(key);
    if (!entry) return null;
    return {
      data: entry.data as T,
      fetchedAt: entry.fetchedAt,
      fresh: Date.now() < entry.expiresAt,
    };
  },

  set(key: string, data: unknown, ttlMs: number): void {
    const now = Date.now();
    store.set(key, { data, fetchedAt: now, expiresAt: now + ttlMs });
  },

  clear(): void {
    store.clear();
  },
};
