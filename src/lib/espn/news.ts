import { TTL } from "../config";
import { fetchWithFixture, Sourced } from "../datasource";

/** ESPN's public NFL news feed (no key). Headlines tagged with athlete ids. */
const URL = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/news?limit=100";

export interface NewsItem {
  headline: string;
  description: string;
  /** ISO timestamp. */
  published: string;
  url: string | null;
  /** ESPN athlete ids mentioned (mapped to Sleeper via the id crosswalk). */
  espnIds: string[];
}

interface RawArticle {
  headline?: string;
  description?: string;
  published?: string;
  links?: { web?: { href?: string } };
  categories?: { type?: string; athleteId?: number | string; athlete?: { id?: number | string } }[];
}

export function parseEspnNews(raw: unknown): NewsItem[] {
  const articles = (raw as { articles?: RawArticle[] } | null)?.articles;
  if (!Array.isArray(articles)) throw new SyntaxError("ESPN news has an unexpected format");
  return articles
    .filter((a) => a.headline && a.published)
    .map((a) => ({
      headline: a.headline!,
      description: a.description ?? "",
      published: a.published!,
      url: a.links?.web?.href ?? null,
      espnIds: (a.categories ?? [])
        .filter((c) => c.type === "athlete")
        .map((c) => String(c.athleteId ?? c.athlete?.id ?? ""))
        .filter(Boolean),
    }));
}

export function getEspnNews(): Promise<Sourced<NewsItem[]>> {
  return fetchWithFixture({
    key: "espn:news",
    url: URL,
    fixture: "espn-news.json",
    ttlMs: TTL.news,
    parse: parseEspnNews,
  });
}
