import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cache } from "./cache";
import { fetchWithFixture, SourceUnavailableError, worstSource } from "./datasource";

const opts = { key: "test:key", url: "https://example.test/data", fixture: "unused.json", ttlMs: 1000 };

function mockFetch(impl: () => Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn(impl));
}
const ok = (body: unknown) => () => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
const fail = () => Promise.reject(new Error("network down"));

describe("fetchWithFixture (live mode)", () => {
  beforeEach(() => {
    vi.stubEnv("SLEEPER_FIXTURES", "");
    vi.useFakeTimers();
    cache.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("labels a fresh fetch live and a recent cache hit as healthy cache", async () => {
    mockFetch(ok({ n: 1 }));
    expect((await fetchWithFixture(opts)).source).toBe("live");
    const again = await fetchWithFixture(opts);
    expect(again.source).toBe("cache");
    expect(again.data).toEqual({ n: 1 });
  });

  it("labels an expired entry served after a failed refetch as stale", async () => {
    mockFetch(ok({ n: 1 }));
    await fetchWithFixture(opts);
    vi.advanceTimersByTime(2000); // past the 1s TTL
    mockFetch(fail);
    const result = await fetchWithFixture(opts);
    expect(result.source).toBe("stale");
    expect(result.data).toEqual({ n: 1 });
  });

  it("throws when the fetch fails with nothing cached", async () => {
    mockFetch(fail);
    await expect(fetchWithFixture(opts)).rejects.toBeInstanceOf(SourceUnavailableError);
  });
});

describe("worstSource", () => {
  it("ranks healthy cache below a failed (stale) fetch", () => {
    expect(worstSource("live", "cache")).toBe("cache");
    expect(worstSource("cache", "stale")).toBe("stale");
    expect(worstSource("stale", "fixture")).toBe("fixture");
    expect(worstSource("fixture", "unavailable")).toBe("unavailable");
    expect(worstSource("live", "live")).toBe("live");
  });
});
