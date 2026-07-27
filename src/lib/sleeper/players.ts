import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { fetchWithFixture, fixturesMode, Sourced } from "../datasource";
import { TTL } from "../config";
import { PlayersMap, SlimPlayer } from "./types";

const FANTASY_POSITIONS = new Set(["QB", "RB", "WR", "TE", "K", "DEF"]);

interface RawPlayer {
  player_id?: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  position?: string;
  team?: string | null;
  age?: number | null;
  years_exp?: number | null;
  injury_status?: string | null;
  status?: string | null;
}

function slimPlayers(raw: unknown): PlayersMap {
  const out: PlayersMap = {};
  for (const [id, p] of Object.entries(raw as Record<string, RawPlayer>)) {
    if (!p || !p.position || !FANTASY_POSITIONS.has(p.position)) continue;
    const name =
      p.full_name ?? [p.first_name, p.last_name].filter(Boolean).join(" ");
    if (!name) continue;
    const slim: SlimPlayer = {
      player_id: id,
      full_name: name,
      position: p.position,
      team: p.team ?? null,
      age: p.age ?? null,
      years_exp: p.years_exp ?? null,
      injury_status: p.injury_status ?? null,
      status: p.status ?? null,
    };
    out[id] = slim;
  }
  return out;
}

const FILE_CACHE = path.join(os.tmpdir(), "therealdeal-players.json");

/**
 * The 5MB players blob is fetched at most daily; the slimmed (~300KB) result
 * is additionally persisted to tmp so serverless cold starts within 24h skip
 * the big download.
 */
export async function getPlayersMap(): Promise<Sourced<PlayersMap>> {
  if (!fixturesMode()) {
    try {
      const stat = await fs.stat(FILE_CACHE);
      if (Date.now() - stat.mtimeMs < TTL.players) {
        const data = JSON.parse(await fs.readFile(FILE_CACHE, "utf-8")) as PlayersMap;
        return { data, source: "cache", fetchedAt: stat.mtimeMs };
      }
    } catch {
      // no tmp cache — fall through to fetchWithFixture
    }
  }

  const result = await fetchWithFixture<PlayersMap>({
    key: "sleeper:players",
    url: "https://api.sleeper.app/v1/players/nfl",
    fixture: "players-subset.json",
    ttlMs: TTL.players,
    parse: slimPlayers,
  });

  if (result.source === "live") {
    fs.writeFile(FILE_CACHE, JSON.stringify(result.data)).catch(() => {});
  }
  return result;
}
