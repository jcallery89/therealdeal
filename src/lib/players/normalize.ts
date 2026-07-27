/**
 * Name normalization for joining KTC (name-keyed) data to Sleeper players.
 */

const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);

/**
 * Known nickname/spelling mismatches between sources, applied after
 * normalization (both sides of the map are already-normalized strings).
 * Extend as unmatched players surface (unmatched count is exposed in
 * /api/values meta).
 */
export const NAME_ALIASES: Record<string, string> = {
  "hollywood brown": "marquise brown",
  "gabe davis": "gabriel davis",
  "mitch trubisky": "mitchell trubisky",
  "josh palmer": "joshua palmer",
  "cameron ward": "cam ward",
  "chigoziem okonkwo": "chig okonkwo",
  "tank dell": "nathaniel dell",
  "scotty miller": "scott miller",
};

export function normalizeName(name: string): string {
  let n = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // diacritics
    .replace(/[.'’-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const tokens = n.split(" ").filter((t) => !SUFFIXES.has(t));
  n = tokens.join(" ");
  return NAME_ALIASES[n] ?? n;
}
