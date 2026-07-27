import { fetchWithFixture, Sourced } from "../datasource";
import { TTL } from "../config";
import { KtcEntry } from "./types";

/**
 * KeepTradeCut has no public API. Their dynasty rankings page embeds the full
 * value table as `var playersArray = [...]` in an inline script — we extract
 * and parse it server-side. Inherently brittle: any failure falls back to
 * stale cache or the committed fixture (handled by fetchWithFixture), and the
 * UI shows the data-source banner. Never on the critical path.
 */
export function extractPlayersArray(html: string): KtcEntry[] {
  const match = html.match(/var\s+playersArray\s*=\s*(\[.*?\]);/s);
  if (!match) throw new Error("KTC playersArray not found in page HTML");
  const parsed = JSON.parse(match[1]) as unknown[];
  return parsed.filter(
    (p): p is KtcEntry =>
      typeof p === "object" &&
      p !== null &&
      "playerName" in p &&
      "superflexValues" in p
  );
}

export function getKtcValues(): Promise<Sourced<KtcEntry[]>> {
  return fetchWithFixture<KtcEntry[]>({
    key: "ktc:values",
    url: "https://keeptradecut.com/dynasty-rankings",
    fixture: "ktc-playersArray.json",
    ttlMs: TTL.ktc,
    asText: true,
    parse: (raw) => extractPlayersArray(raw as string),
  });
}
