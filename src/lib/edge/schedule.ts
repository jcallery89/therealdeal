import type { ScheduledGame } from "../nflverse/client";

/**
 * Kickoff as epoch ms. nflverse publishes kickoffs in US Eastern time; DST
 * ends the first Sunday of November.
 */
export function kickoffTime(kickoff: string): number {
  const [date] = kickoff.split("T");
  const [y, m, d] = date.split("-").map(Number);
  const firstNovSunday = 1 + ((7 - new Date(Date.UTC(y, 10, 1)).getUTCDay()) % 7);
  const dst = m > 3 && (m < 11 || (m === 11 && d < firstNovSunday));
  return Date.parse(`${kickoff}:00${dst ? "-04:00" : "-05:00"}`);
}

export interface TeamGame {
  game: ScheduledGame;
  opponent: string;
  home: boolean;
  /** Vegas implied points for this team, when lines are posted. */
  implied: number | null;
}

export function teamGame(schedule: ScheduledGame[], week: number, team: string | null): TeamGame | null {
  if (!team) return null;
  const game = schedule.find((g) => g.week === week && (g.home === team || g.away === team));
  if (!game) return null;
  const home = game.home === team;
  let implied: number | null = null;
  if (game.total !== null && game.spread !== null) {
    // spread = points the home team is favored by.
    const homeImplied = (game.total + game.spread) / 2;
    implied = Math.round((home ? homeImplied : game.total - homeImplied) * 10) / 10;
  }
  return { game, opponent: home ? game.away : game.home, home, implied };
}

/** Teams with a game in the given week (anyone else is on bye). */
export function teamsPlaying(schedule: ScheduledGame[], week: number): Set<string> {
  const out = new Set<string>();
  for (const g of schedule) {
    if (g.week === week) {
      out.add(g.home);
      out.add(g.away);
    }
  }
  return out;
}

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Sun 1:00 PM ET" */
export function kickoffLabel(kickoff: string): string {
  const [date, time = "13:00"] = kickoff.split("T");
  const [y, m, d] = date.split("-").map(Number);
  const day = DAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const [hh, mm] = time.split(":").map(Number);
  const h12 = ((hh + 11) % 12) + 1;
  return `${day} ${h12}:${String(mm).padStart(2, "0")} ${hh >= 12 ? "PM" : "AM"} ET`;
}
