/**
 * Prints what each external value source actually returns (status, shape,
 * sample rows), trying the format variants we care about. Run from a network
 * that can reach the providers — e.g. the "Source check" GitHub Action:
 *
 *   npx tsx scripts/check-sources.ts
 */
const TARGETS: Record<string, string[]> = {
  dynastydealer: [
    "https://www.dynastydealer.com/api/player-values",
    "https://www.dynastydealer.com/api/player-values?format=superflex",
    "https://www.dynastydealer.com/api/player-values?format=1qb",
    "https://www.dynastydealer.com/api/player-values?superflex=true",
    "https://www.dynastydealer.com/api/player-values?qb=1",
  ],
  dynastytradevalues: [
    "https://dynastytradevalues.com/wp-json/dtc/v1/public/player-values?limit=5",
    "https://dynastytradevalues.com/wp-json/dtc/v1/public/player-values?limit=5&format=superflex",
    "https://dynastytradevalues.com/wp-json/dtc/v1/public/player-values?limit=5&format=1qb",
    "https://dynastytradevalues.com/wp-json/dtc/v1/public/player-values?limit=5&superflex=1",
    "https://dynastytradevalues.com/wp-json/dtc/v1/public/pick-values?limit=5",
    "https://dynastytradevalues.com/wp-json/dtc/v1/public",
  ],
};

function shape(v: unknown, depth = 0): string {
  if (Array.isArray(v)) return `array(${v.length})${v.length ? ` of ${shape(v[0], depth + 1)}` : ""}`;
  if (v && typeof v === "object") {
    if (depth > 1) return `{${Object.keys(v).join(",")}}`;
    return `{ ${Object.entries(v as Record<string, unknown>)
      .map(([k, x]) => `${k}: ${shape(x, depth + 1)}`)
      .join(", ")} }`;
  }
  return typeof v === "string" ? `"${v.slice(0, 40)}"` : String(v);
}

function firstRows(v: unknown): unknown[] {
  if (Array.isArray(v)) return v.slice(0, 3);
  if (v && typeof v === "object") {
    for (const x of Object.values(v)) if (Array.isArray(x)) return x.slice(0, 3);
  }
  return [];
}

async function main() {
  for (const [name, urls] of Object.entries(TARGETS)) {
    console.log(`\n===== ${name}`);
    for (const url of urls) {
      try {
        const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
        const text = await res.text();
        console.log(`\n${res.status} ${url} (${text.length} bytes, ${res.headers.get("content-type")})`);
        try {
          const json = JSON.parse(text);
          console.log("shape:", shape(json).slice(0, 1500));
          console.log("rows:", JSON.stringify(firstRows(json)).slice(0, 1500));
        } catch {
          console.log("not JSON:", text.slice(0, 300).replace(/\s+/g, " "));
        }
      } catch (err) {
        console.log(`ERR ${url}: ${err instanceof Error ? err.message : err}`);
      }
    }
  }
}

main();
