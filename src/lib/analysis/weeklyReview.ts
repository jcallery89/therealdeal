import { CanonicalPlayer } from "../players/canonical";
import { SleeperLeagueUser, SleeperMatchup, SleeperRoster } from "../sleeper/types";
import { optimalLineup } from "./lineup";

export interface TeamWeek {
  rosterId: number;
  teamName: string;
  points: number;
  /** Best possible score from this week's actual player points. */
  optimalPoints: number;
  /** Points left on the bench (optimal - actual, never negative). */
  benchLeft: number;
  record: string | null;
}

export interface MatchupResult {
  matchupId: number;
  winner: TeamWeek;
  loser: TeamWeek;
  margin: number;
  tie: boolean;
  /** The loser's best possible lineup would have won. */
  malpractice: boolean;
}

export interface PlayerPerformance {
  playerId: string;
  name: string;
  position: string;
  points: number;
  teamName: string;
}

export interface WeekSummary {
  leagueName: string;
  week: number;
  matchups: MatchupResult[];
  blowout: MatchupResult | null;
  nailBiter: MatchupResult | null;
  topDog: TeamWeek | null;
  basement: TeamWeek | null;
  benchBlunder: TeamWeek | null;
  mvp: PlayerPerformance | null;
  /** High-value starter who laid an egg. */
  dud: PlayerPerformance | null;
  /** Mascot image attach order (alphabetical by team name). */
  attachOrder: string[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function teamNameOf(users: SleeperLeagueUser[], roster: SleeperRoster | undefined, rosterId: number): string {
  const user = users.find((u) => u.user_id === roster?.owner_id);
  return user?.metadata?.team_name || user?.display_name || `Team ${rosterId}`;
}

/**
 * Turn one week of Sleeper matchups into storylines. Only paired matchups
 * with points count (unplayed weeks produce an empty summary).
 */
export function summarizeWeek(opts: {
  leagueName: string;
  week: number;
  matchups: SleeperMatchup[];
  rosters: SleeperRoster[];
  users: SleeperLeagueUser[];
  players: Record<string, CanonicalPlayer>;
  rosterPositions: string[];
  /** Market value, used to pick the "dud" (a valuable starter who flopped). */
  valueOf: (p: CanonicalPlayer) => number;
  includeRecords: boolean;
}): WeekSummary {
  const { leagueName, week, matchups, rosters, users, players, rosterPositions, valueOf, includeRecords } = opts;

  const teamWeek = (m: SleeperMatchup): TeamWeek => {
    const roster = rosters.find((r) => r.roster_id === m.roster_id);
    const pts = m.players_points ?? {};
    const excluded = new Set([...(roster?.taxi ?? []), ...(roster?.reserve ?? [])]);
    const eligible = (m.players ?? []).filter((id) => !excluded.has(id));
    const optimal = optimalLineup(eligible, rosterPositions, players, pts).reduce((s, x) => s + x.projected, 0);
    const points = round2(m.points ?? 0);
    const s = roster?.settings;
    return {
      rosterId: m.roster_id,
      teamName: teamNameOf(users, roster, m.roster_id),
      points,
      optimalPoints: round2(Math.max(optimal, points)),
      benchLeft: round2(Math.max(0, optimal - points)),
      record: includeRecords && s ? `${s.wins}-${s.losses}${s.ties ? `-${s.ties}` : ""}` : null,
    };
  };

  const pairs = new Map<number, SleeperMatchup[]>();
  for (const m of matchups) {
    if (m.matchup_id === null) continue;
    const list = pairs.get(m.matchup_id) ?? [];
    list.push(m);
    pairs.set(m.matchup_id, list);
  }

  const results: MatchupResult[] = [];
  for (const [matchupId, pair] of [...pairs.entries()].sort((a, b) => a[0] - b[0])) {
    if (pair.length !== 2) continue;
    const [a, b] = pair.map(teamWeek);
    if (a.points === 0 && b.points === 0) continue; // not played yet
    const [winner, loser] = a.points >= b.points ? [a, b] : [b, a];
    results.push({
      matchupId,
      winner,
      loser,
      margin: round2(winner.points - loser.points),
      tie: a.points === b.points,
      malpractice: loser.optimalPoints > winner.points,
    });
  }

  const teams = results.flatMap((r) => [r.winner, r.loser]);
  const maxBy = <T,>(xs: T[], f: (x: T) => number): T | null =>
    xs.reduce<T | null>((best, x) => (best === null || f(x) > f(best) ? x : best), null);

  // Starter performances across the league, for MVP and dud.
  const performances: (PlayerPerformance & { value: number })[] = [];
  for (const m of matchups) {
    if (m.matchup_id === null) continue;
    const team = teams.find((t) => t.rosterId === m.roster_id);
    if (!team) continue;
    for (const id of m.starters ?? []) {
      const p = players[id];
      if (!p || id === "0") continue;
      performances.push({
        playerId: id,
        name: p.name,
        position: p.position,
        points: round2(m.players_points?.[id] ?? 0),
        teamName: team.teamName,
        value: valueOf(p),
      });
    }
  }
  const mvp = maxBy(performances, (p) => p.points);
  // Dud: the most valuable starter who scored under 6.
  const dud = maxBy(
    performances.filter((p) => p.points < 6),
    (p) => p.value
  );
  const strip = (p: (PlayerPerformance & { value: number }) | null): PlayerPerformance | null =>
    p && { playerId: p.playerId, name: p.name, position: p.position, points: p.points, teamName: p.teamName };

  const benchBlunder = maxBy(teams, (t) => t.benchLeft);
  return {
    leagueName,
    week,
    matchups: results,
    blowout: maxBy(results, (r) => r.margin),
    nailBiter: maxBy(results.filter((r) => !r.tie), (r) => -r.margin),
    topDog: maxBy(teams, (t) => t.points),
    basement: maxBy(teams, (t) => -t.points),
    benchBlunder: benchBlunder && benchBlunder.benchLeft > 0 ? benchBlunder : null,
    mvp: strip(mvp),
    dud: strip(dud),
    attachOrder: [...new Set(teams.map((t) => t.teamName))].sort((a, b) => a.localeCompare(b)),
  };
}

// ---------------------------------------------------------------------------
// Image prompt

/** Deterministic pick so regenerating the same week gives the same captions. */
function pick<T>(options: T[], seed: string): T {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return options[(h >>> 0) % options.length];
}

const fill = (template: string, vars: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? "");

const LINES = {
  blowout: [
    "{L} got sent to the shadow realm",
    "That wasn't a game. That was an intervention.",
    "{L} filed a missing persons report for its offense",
    "{W} by {M}. Someone check on {L}.",
  ],
  close: [
    "Lost by {M}. Every bench point haunts {L}.",
    "Photo finish — {L} still found a way to lose",
    "{W} escapes. {L} escapes nothing.",
  ],
  malpractice: [
    "{L} benched the win. Genius move.",
    "{L} left {B} on the bench. Fire the GM.",
    "{L} had a winning lineup. On the bench.",
  ],
  normal: [
    "{W} handles business. {L} handles disappointment.",
    "{W} cooks. {L} gets cooked.",
    "{L} showed up. Nicest thing we can say.",
    "{L} played like it had somewhere better to be",
  ],
};

const SCENES = {
  blowout: [
    "{Wp} mascot flexing on top of the scoreboard while {Lp} mascot lies flattened under a pile of footballs",
    "{Wp} mascot driving a steamroller over {Lp} mascot, who is waving a tiny white flag",
  ],
  close: [
    "{Wp} mascot diving across the finish line a nose ahead of a devastated {Lp} mascot",
    "{Wp} mascot wiping its brow in relief while {Lp} mascot stares at a photo-finish replay in horror",
  ],
  malpractice: [
    "{Lp} mascot facepalming at its own bench, which is overflowing with glowing points",
    "{Lp} mascot being handed a giant 'WORST GM' trophy in front of a bench piled with points",
  ],
  normal: [
    "{Wp} mascot spiking a football in celebration as {Lp} mascot sulks on the sideline",
    "{Wp} mascot doing a victory dance while {Lp} mascot sits alone on a cold bench",
  ],
};

function storyType(r: MatchupResult): keyof typeof LINES {
  if (r.malpractice) return "malpractice";
  if (r.margin >= 30) return "blowout";
  if (r.margin < 5) return "close";
  return "normal";
}

const pts = (n: number) => n.toFixed(2);
const possessive = (name: string) => (/s$/i.test(name) ? `${name}'` : `${name}'s`);

/**
 * A ready-to-paste ChatGPT image prompt for a single savage-roast recap
 * graphic. Mascots are the images the user attaches, matched by the listed
 * attach order.
 */
export function buildImagePrompt(summary: WeekSummary): string {
  const { leagueName, week, matchups } = summary;
  const lines: string[] = [];

  lines.push(
    `Create ONE landscape (16:9) comic-book-style poster: "${leagueName.toUpperCase()} — WEEK ${week} REVIEW", a savage roast of this week's fantasy football results.`,
    ""
  );

  lines.push(`MASCOTS — I've attached ${summary.attachOrder.length} mascot images, one per team, in this order:`);
  summary.attachOrder.forEach((name, i) => lines.push(`${i + 1}. ${name}`));
  lines.push(
    "Use each team's attached mascot as its character everywhere it appears. Keep every mascot recognizable (same colors, outfit, and features) — exaggerate expressions and poses, not designs. If an image is missing, draw a generic cartoon football mascot labeled with that team's name.",
    ""
  );

  lines.push(
    "LAYOUT",
    `- Top banner: "${leagueName.toUpperCase()} • WEEK ${week}" with the subtitle "THE WEEKLY ROAST".`,
    `- ${matchups.length} matchup panels in a grid, one per game: the winner's mascot celebrating, the loser's mascot humiliated, the final score in big clear numbers, and a short caption.`,
    "- A strip of award badges along the bottom.",
    ""
  );

  lines.push("MATCHUP PANELS");
  matchups.forEach((r, i) => {
    const type = storyType(r);
    const vars = {
      W: r.winner.teamName,
      L: r.loser.teamName,
      Wp: possessive(r.winner.teamName),
      Lp: possessive(r.loser.teamName),
      M: pts(r.margin),
      B: pts(r.loser.benchLeft),
    };
    const seed = `${week}-${r.matchupId}`;
    const score = r.tie
      ? `${r.winner.teamName} ${pts(r.winner.points)} TIED ${r.loser.teamName} ${pts(r.loser.points)}`
      : `${r.winner.teamName} ${pts(r.winner.points)} def. ${r.loser.teamName} ${pts(r.loser.points)}`;
    const records =
      r.winner.record && r.loser.record ? ` (now ${r.winner.record} vs ${r.loser.record})` : "";
    lines.push(
      `${i + 1}. ${score}${records}`,
      `   Scene: ${fill(pick(SCENES[type], `${seed}-scene`), vars)}.`,
      `   Caption: "${fill(pick(LINES[type], seed), vars)}"`
    );
  });
  lines.push("");

  const badges: string[] = [];
  if (summary.blowout && summary.blowout.margin >= 20) {
    badges.push(
      `💥 BLOWOUT OF THE WEEK: ${summary.blowout.winner.teamName} over ${summary.blowout.loser.teamName} by ${pts(summary.blowout.margin)}`
    );
  }
  if (summary.nailBiter && summary.nailBiter.margin < 10) {
    badges.push(
      `😬 NAIL-BITER: ${summary.nailBiter.winner.teamName} survives ${summary.nailBiter.loser.teamName} by ${pts(summary.nailBiter.margin)}`
    );
  }
  if (summary.topDog) badges.push(`👑 TOP DOG: ${summary.topDog.teamName}, ${pts(summary.topDog.points)} points`);
  if (summary.basement) {
    badges.push(`🪦 BASEMENT DWELLER: ${summary.basement.teamName}, a pathetic ${pts(summary.basement.points)}`);
  }
  if (summary.benchBlunder) {
    badges.push(
      `🪑 BENCH BLUNDER: ${summary.benchBlunder.teamName} left ${pts(summary.benchBlunder.benchLeft)} points on the bench`
    );
  }
  for (const r of matchups.filter((m) => m.malpractice)) {
    badges.push(
      `🤡 COACHING MALPRACTICE: ${possessive(r.loser.teamName)} best lineup (${pts(r.loser.optimalPoints)}) would have beaten ${r.winner.teamName}`
    );
  }
  if (summary.mvp) {
    badges.push(`⭐ MVP: ${summary.mvp.name} — ${pts(summary.mvp.points)} for ${summary.mvp.teamName}`);
  }
  if (summary.dud) {
    badges.push(`🧊 DUD: ${summary.dud.name} — ${pts(summary.dud.points)} for ${summary.dud.teamName}`);
  }
  lines.push("AWARD BADGES", ...badges.map((b) => `- ${b}`), "");

  lines.push(
    "STYLE & RULES",
    "- Vibrant, high-energy sports-cartoon style with savage, trash-talking humor aimed at each team's performance.",
    "- Spell every team name and score exactly as written above. Keep captions short so the text renders cleanly.",
    "- Real NFL players appear ONLY as text on the badges — do not draw real people.",
    "- Roast the fantasy performance, not real people: no profanity, slurs, or personal insults."
  );
  return lines.join("\n");
}
