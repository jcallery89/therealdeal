import {
  CORE_POSITIONS,
  CorePosition,
  neededAtPosition,
  positionalStrength,
  starterSlots,
} from "../analysis/rosterStrength";
import { isUnavailable, lineupAdvice } from "../analysis/lineup";
import type { LeagueBundle } from "../leagueBundle";
import { teamName } from "../leagueBundle";
import type { CanonicalPlayer } from "../players/canonical";
import {
  HORIZON_SOURCES,
  playerValue,
  SOURCE_LABELS,
  sourceValue,
  ValueContext,
} from "../values/engine";
import { kickoffLabel, kickoffTime, teamGame, teamsPlaying } from "./schedule";
import type { EdgeInputs, Insight, InsightKind, Signal, SignalSource } from "./types";

/** Minimum weekly opportunity (expected PPR pts) that makes a player startable. */
const STARTABLE_XPPG: Record<string, number> = { QB: 15, RB: 10, WR: 9.5, TE: 7 };
/** How many players at each position count as "real" weekly options. */
const RELEVANT_RANK: Record<string, number> = { QB: 15, RB: 30, WR: 36, TE: 14 };

const pct = (x: number) => `${Math.round(x * 100)}%`;
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export const KIND_LABELS: Record<InsightKind, string> = {
  waiver: "Waiver gem",
  buy: "Buy low",
  sell: "Sell high",
  lineup: "Lineup",
  injury: "Injury",
  rival: "Rival intel",
  stash: "Stash",
};

interface Ctx {
  bundle: LeagueBundle;
  inputs: EdgeInputs;
  myRosterId: number | null;
  players: Record<string, CanonicalPlayer>;
  valueCtx: ValueContext;
  valueOf: (p: CanonicalPlayer) => number;
  week: number;
  ownerOf: Map<string, number>;
  teamNameById: Map<number, string>;
  /** My positions ranked bottom-4 in the league. */
  myWeakPositions: Set<string>;
  /** Positions where I hold more startable value than I can start. */
  mySurplus: Map<string, string[]>;
  playing: Set<string>;
  hrefBase: string;
}

function makeCtx(bundle: LeagueBundle, inputs: EdgeInputs, myRosterId: number | null): Ctx {
  const players = { ...inputs.players, ...bundle.players };
  const valueCtx: ValueContext = {
    ...bundle.valueContext,
    production: { ...inputs.production, ...bundle.valueContext.production },
  };
  const valueOf = (p: CanonicalPlayer) => playerValue(p, bundle.leagueConfig, bundle.defaultMode, valueCtx);
  const ownerOf = new Map<string, number>();
  for (const r of bundle.rosters) {
    for (const id of [...(r.players ?? []), ...(r.taxi ?? []), ...(r.reserve ?? [])]) ownerOf.set(id, r.roster_id);
  }
  const slots = starterSlots(bundle.league.roster_positions);
  const strength = bundle.rosters.map((r) => ({
    id: r.roster_id,
    s: positionalStrength(r.players ?? [], players, valueOf, slots),
  }));
  const myWeakPositions = new Set<string>();
  const mySurplus = new Map<string, string[]>();
  const mine = bundle.rosters.find((r) => r.roster_id === myRosterId);
  if (mine) {
    for (const pos of CORE_POSITIONS) {
      const ranked = [...strength].sort((a, b) => b.s[pos] - a.s[pos]);
      const myRank = ranked.findIndex((x) => x.id === myRosterId) + 1;
      if (myRank > bundle.rosters.length - 4) myWeakPositions.add(pos);
      const atPos = (mine.players ?? [])
        .filter((id) => players[id]?.position === pos && !(mine.reserve ?? []).includes(id))
        .sort((a, b) => valueOf(players[b]) - valueOf(players[a]));
      const need = Math.max(1, neededAtPosition(slots, pos));
      const extra = atPos.slice(need).filter((id) => valueOf(players[id]) >= 2500);
      if (myRank <= 3 && extra.length) mySurplus.set(pos, extra);
    }
  }
  return {
    bundle,
    inputs,
    myRosterId,
    players,
    valueCtx,
    valueOf,
    week: bundle.state.week,
    ownerOf,
    teamNameById: new Map(bundle.rosters.map((r) => [r.roster_id, teamName(bundle.users, r)])),
    myWeakPositions,
    mySurplus,
    playing: teamsPlaying(inputs.schedule, bundle.state.week),
    hrefBase: `/league/${bundle.leagueConfig.id}`,
  };
}

// ---------------------------------------------------------------- signals

function usageSignals(c: Ctx, id: string): { signals: Signal[]; score: number } {
  const u = c.inputs.usage[id];
  const p = c.players[id];
  const signals: Signal[] = [];
  let score = 0;
  if (!u || !p) return { signals, score };
  if (u.snapRecent !== null && u.snapPrior !== null && u.snapRecent >= 0.55 && u.snapRecent - u.snapPrior >= 0.15) {
    signals.push({ source: "Snaps", text: `Snap share up to ${pct(u.snapRecent)} (from ${pct(u.snapPrior)})` });
    score += 18;
  } else if (u.snapRecent !== null && u.snapRecent >= 0.7) {
    signals.push({ source: "Snaps", text: `Playing ${pct(u.snapRecent)} of snaps` });
    score += 6;
  }
  if (u.targetShareRecent >= 0.2) {
    const rising = u.targetShareRecent - u.targetShare >= 0.05;
    signals.push({
      source: "Usage",
      text: `${pct(u.targetShareRecent)} target share last 2 games${rising ? ` (season ${pct(u.targetShare)})` : ""}`,
    });
    score += rising ? 18 : 12;
  }
  if (p.position === "RB" && u.carryShareRecent >= 0.45) {
    signals.push({ source: "Usage", text: `Handling ${pct(u.carryShareRecent)} of team carries` });
    score += 14;
  }
  const bar = STARTABLE_XPPG[p.position] ?? 10;
  if (u.xppgRecent >= bar * 0.8) {
    signals.push({ source: "Usage", text: `Recent opportunity worth ${u.xppgRecent.toFixed(1)} PPR pts/game` });
    score += Math.min(20, (u.xppgRecent / bar) * 10);
  }
  return { signals, score };
}

/** Teammate ahead of him on the depth chart who is hurt. */
function depthOpening(c: Ctx, id: string): { signal: Signal; score: number; starter: string } | null {
  const p = c.players[id];
  if (!p?.team || (p.depthOrder ?? 99) > 3) return null;
  const ahead = Object.values(c.players).filter(
    (t) =>
      t.sleeperId !== id &&
      t.team === p.team &&
      t.position === p.position &&
      (t.depthOrder ?? 99) < (p.depthOrder ?? 99) &&
      t.injuryStatus
  );
  const hurt = ahead.find((t) => isUnavailable(t) || t.injuryStatus === "Doubtful") ??
    ahead.find((t) => t.injuryStatus === "Questionable");
  if (!hurt) return null;
  const out = hurt.injuryStatus !== "Questionable";
  return {
    signal: { source: "Depth chart", text: `Next up behind ${hurt.name} (${hurt.injuryStatus})` },
    score: out ? 30 : 12,
    starter: hurt.name,
  };
}

function marketSignals(c: Ctx, id: string): { signals: Signal[]; trend: number } {
  const p = c.players[id];
  const signals: Signal[] = [];
  if (!p) return { signals, trend: 0 };
  const fc = c.bundle.leagueConfig.isDynasty ? p.values.fcDynastySf : p.values.fcRedraft;
  const trend = fc && fc.value > 0 && fc.trend30Day ? fc.trend30Day / fc.value : 0;
  if (Math.abs(trend) >= 0.08) {
    signals.push({ source: "Market", text: `FantasyCalc value ${trend > 0 ? "up" : "down"} ${pct(Math.abs(trend))} in 30 days` });
  }
  return { signals, trend };
}

/** Where the market sources disagree by 30%+ — pitch with the friendliest number. */
function marketSplit(c: Ctx, id: string): Signal | null {
  const p = c.players[id];
  const horizon = c.bundle.defaultMode.horizon;
  const vals = HORIZON_SOURCES[horizon]
    .filter((s) => s !== "proj")
    .map((s) => ({ s, v: sourceValue(p, horizon, s, c.valueCtx) }))
    .filter((x) => x.v > 0)
    .sort((a, b) => b.v - a.v);
  if (vals.length < 2) return null;
  const hi = vals[0];
  const lo = vals[vals.length - 1];
  if (hi.v < lo.v * 1.3 || hi.v < 1500) return null;
  return {
    source: "Market",
    text: `${SOURCE_LABELS[hi.s]} values him ${fmt(hi.v)} vs ${SOURCE_LABELS[lo.s]} ${fmt(lo.v)}`,
  };
}

function scheduleSignal(c: Ctx, id: string, weeks: number[], label: string): { signal: Signal; factor: number } | null {
  const p = c.players[id];
  if (!p?.team) return null;
  const opps: string[] = [];
  const factors: number[] = [];
  for (const w of weeks) {
    const g = teamGame(c.inputs.schedule, w, p.team);
    if (!g) continue;
    opps.push(g.opponent);
    factors.push(c.inputs.defense[g.opponent]?.[p.position] ?? 1);
  }
  if (factors.length < Math.min(2, weeks.length)) return null;
  const factor = factors.reduce((a, b) => a + b, 0) / factors.length;
  if (Math.abs(factor - 1) < 0.1) return null;
  const soft = factor > 1;
  return {
    factor,
    signal: {
      source: "Schedule",
      text: `${soft ? "Soft" : "Tough"} ${label}: ${opps.join(", ")} (${soft ? "+" : "−"}${pct(Math.abs(factor - 1))} ${p.position} pts allowed)`,
    },
  };
}

function vegasSignal(c: Ctx, id: string): { signal: Signal; implied: number } | null {
  const p = c.players[id];
  const g = teamGame(c.inputs.schedule, c.week, p?.team ?? null);
  if (!g || g.implied === null) return null;
  const tone = g.implied >= 26 ? "shootout-friendly" : g.implied <= 18 ? "low-scoring" : null;
  if (!tone) return null;
  return {
    implied: g.implied,
    signal: { source: "Vegas", text: `Team implied for ${g.implied} pts ${g.home ? "vs" : "at"} ${g.opponent} (${tone})` },
  };
}

function newsSignal(c: Ctx, id: string): Signal | null {
  const item = c.inputs.news[id]?.[0];
  if (!item) return null;
  const age = c.inputs.asOf - Date.parse(item.published);
  if (!(age < 4 * 24 * 3600 * 1000)) return null;
  return { source: "News", text: item.headline };
}

function consensusSignal(c: Ctx, id: string): Signal | null {
  const s = c.inputs.consensus[id];
  const p = c.players[id];
  if (!s || !p) return null;
  const parts = [`${s.tier} (${p.position}${s.rank})`];
  if (s.experts) parts.push(`experts ${p.position}${s.experts.rank}`);
  if (s.started !== undefined) parts.push(`started in ${Math.round(s.started)}% of leagues`);
  return { source: "Projections", text: `Consensus: ${parts.join(" · ")}` };
}

const distinctSources = (signals: Signal[]) => new Set<SignalSource>(signals.map((s) => s.source)).size;

function tradeHref(c: Ctx, opts: { b: number; sendA?: string[]; sendB?: string[] }): string {
  const params = new URLSearchParams();
  if (c.myRosterId !== null) params.set("a", String(c.myRosterId));
  params.set("b", String(opts.b));
  if (opts.sendA?.length) params.set("sendA", opts.sendA.join(","));
  if (opts.sendB?.length) params.set("sendB", opts.sendB.join(","));
  return `${c.hrefBase}/trade?${params.toString()}`;
}

const label = (p: CanonicalPlayer) => `${p.name} (${p.position}${p.team ? `, ${p.team}` : ""})`;

// ------------------------------------------------------------- generators

function waiverGems(c: Ctx): Insight[] {
  const out: Insight[] = [];
  const mine = c.bundle.rosters.find((r) => r.roster_id === c.myRosterId);
  const myBench = mine
    ? (mine.players ?? [])
        .filter((id) => !(mine.starters ?? []).includes(id) && !(mine.taxi ?? []).includes(id) && !(mine.reserve ?? []).includes(id))
        .filter((id) => c.players[id])
        .sort((a, b) => c.valueOf(c.players[a]) - c.valueOf(c.players[b]))
    : [];
  const playoffStart = c.bundle.league.settings.playoff_week_start ?? 15;

  for (const p of Object.values(c.players)) {
    const id = p.sleeperId;
    if (!p.team || !["QB", "RB", "WR", "TE"].includes(p.position) || c.ownerOf.has(id)) continue;
    if (isUnavailable(p)) continue;
    const { signals, score: usageScore } = usageSignals(c, id);
    let score = usageScore;

    const opening = depthOpening(c, id);
    if (opening) {
      signals.unshift(opening.signal);
      score += opening.score;
    }
    const adds = p.trending?.add ?? 0;
    if (adds >= 1000) {
      signals.push({ source: "Trending", text: `Added in ${fmt(adds)} Sleeper leagues in the last 24h` });
      score += adds >= 20000 ? 15 : adds >= 5000 ? 10 : 6;
    }
    const owned = c.inputs.ownership[id];
    const sneaky = owned !== undefined && owned < 25;
    if (sneaky && score >= 20) {
      signals.push({ source: "Ownership", text: `Rostered in only ${Math.round(owned)}% of Sleeper leagues` });
      score += 6;
    }
    const cs = c.inputs.consensus[id];
    if (cs && (cs.tier === "Start" || cs.tier === "Must start" || cs.tier === "Flex")) {
      const sig = consensusSignal(c, id);
      if (sig) signals.push(sig);
      score += cs.tier === "Flex" ? 6 : 12;
    }
    const market = marketSignals(c, id);
    if (market.trend > 0) {
      signals.push(...market.signals);
      score += 6;
    }
    if (c.bundle.leagueConfig.isDynasty && (p.age ?? 99) <= 24 && c.valueOf(p) >= 1500) {
      signals.push({ source: "Market", text: `Age ${p.age} with dynasty value ${fmt(c.valueOf(p))}` });
      score += 8;
    }
    const next3 = scheduleSignal(c, id, [c.week, c.week + 1, c.week + 2], "next 3");
    if (next3 && next3.factor > 1) {
      signals.push(next3.signal);
      score += 5;
    }
    if (c.week < playoffStart) {
      const po = scheduleSignal(c, id, [playoffStart, playoffStart + 1, playoffStart + 2], "fantasy playoffs");
      if (po && po.factor >= 1.12) {
        signals.push(po.signal);
        score += 4;
      }
    }
    if (c.myWeakPositions.has(p.position)) {
      signals.push({ source: "Roster fit", text: `${p.position} is one of your thinnest spots` });
      score += 8;
    }
    if (score < 30 || distinctSources(signals) < 2) continue;
    const news = newsSignal(c, id);
    if (news) signals.push(news);

    const drop = myBench.find((d) => c.valueOf(c.players[d]) < c.valueOf(p) || c.valueOf(c.players[d]) < 800);
    const title = opening && opening.score >= 30
      ? `Next man up: ${label(p)}`
      : sneaky && score >= 45
        ? `Sneaky add: ${label(p)}`
        : `Waiver target: ${label(p)}`;
    out.push({
      id: `waiver:${c.bundle.leagueConfig.id}:${c.week}:${id}`,
      kind: "waiver",
      score: clamp(score),
      title,
      detail: `Backed by ${distinctSources(signals)} data sources.${
        drop ? ` Drop candidate: ${c.players[drop].name}.` : ""
      }`,
      signals,
      playerIds: drop ? [id, drop] : [id],
    });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 8);
}

function buyLowSellHigh(c: Ctx): Insight[] {
  const out: Insight[] = [];
  // Opportunity ranks per position (min 2 games).
  const byPos = new Map<string, string[]>();
  for (const [id, u] of Object.entries(c.inputs.usage)) {
    const p = c.players[id];
    if (!p || u.games < 2) continue;
    const list = byPos.get(p.position) ?? [];
    list.push(id);
    byPos.set(p.position, list);
  }
  const xRank = new Map<string, number>();
  for (const list of byPos.values()) {
    list.sort((a, b) => c.inputs.usage[b].xppg - c.inputs.usage[a].xppg).forEach((id, i) => xRank.set(id, i + 1));
  }
  const analytics = new Map(c.bundle.teamAnalytics.map((t) => [t.rosterId, t]));
  const myPosture = c.myRosterId !== null ? analytics.get(c.myRosterId)?.bucket : undefined;

  for (const [id, owner] of c.ownerOf) {
    const p = c.players[id];
    const u = c.inputs.usage[id];
    if (!p || !u || u.games < 3) continue;
    const luck = u.ppg - u.xppg;
    const rank = xRank.get(id) ?? 999;
    const relevant = rank <= (RELEVANT_RANK[p.position] ?? 20);
    const market = marketSignals(c, id);
    const split = marketSplit(c, id);
    const value = c.valueOf(p);

    if (owner !== c.myRosterId && relevant && (luck <= -2.5 || (market.trend <= -0.08 && (u.snapRecent ?? 0) >= 0.65))) {
      const signals: Signal[] = [];
      let score = 25 + Math.min(15, value / 600);
      if (luck <= -2.5) {
        signals.push({
          source: "Usage",
          text: `${p.position}${rank} in opportunity (${u.xppg.toFixed(1)} expected pts/game) but scoring ${u.ppg.toFixed(1)} — due to bounce back`,
        });
        score += Math.min(25, -luck * 4);
      }
      if (market.trend < 0) {
        signals.push(...market.signals);
        score += 10;
      }
      if ((u.snapRecent ?? 0) >= 0.65) {
        signals.push({ source: "Snaps", text: `Still playing ${pct(u.snapRecent!)} of snaps` });
        score += 5;
      }
      const posture = analytics.get(owner)?.bucket;
      if (posture === "Rebuild" || posture === "Retool") {
        signals.push({ source: "Roster fit", text: `${c.teamNameById.get(owner)} is in ${posture.toLowerCase()} mode — motivated to deal` });
        score += 8;
      }
      if (c.myWeakPositions.has(p.position)) {
        signals.push({ source: "Roster fit", text: `Fills your thin ${p.position} spot` });
        score += 8;
      }
      if (split) signals.push(split);
      if (distinctSources(signals) < 2) continue;
      out.push({
        id: `buy:${c.bundle.leagueConfig.id}:${c.week}:${id}`,
        kind: "buy",
        score: clamp(score),
        title: `Buy low: ${label(p)}`,
        detail: `Owned by ${c.teamNameById.get(owner)}. The usage is there; the points haven't followed yet.`,
        signals,
        playerIds: [id],
        href: tradeHref(c, { b: owner, sendB: [id] }),
      });
    }

    if (owner === c.myRosterId && u.games >= 3) {
      const signals: Signal[] = [];
      let score = 20 + Math.min(15, value / 600);
      if (luck >= 3 && u.tdPerGame >= 0.5) {
        signals.push({
          source: "Usage",
          text: `Scoring ${u.ppg.toFixed(1)} PPG on ${u.xppg.toFixed(1)} expected — ${u.tdPerGame.toFixed(1)} TDs/game won't last`,
        });
        score += Math.min(25, luck * 4);
      }
      if (market.trend >= 0.08) {
        signals.push(...market.signals);
        score += 10;
      }
      const ageCliff = { QB: 34, RB: 27, WR: 30, TE: 31 }[p.position as CorePosition] ?? 99;
      if (c.bundle.leagueConfig.isDynasty && (p.age ?? 0) >= ageCliff && value >= 2500) {
        signals.push({ source: "Market", text: `Age ${p.age} ${p.position} — value usually falls off a cliff from here` });
        score += 12;
      }
      if (split) signals.push(split);
      // A market split alone isn't a reason to sell.
      if (signals.every((s) => s === split)) continue;
      if (distinctSources(signals) < 2 && score < 45) continue;
      // Suggest the rebuilders/contenders most likely to pay.
      const buyers = c.bundle.teamAnalytics
        .filter((t) => t.rosterId !== c.myRosterId && (t.bucket === "Contend" || t.bucket === "Push"))
        .slice(0, 2)
        .map((t) => c.teamNameById.get(t.rosterId));
      out.push({
        id: `sell:${c.bundle.leagueConfig.id}:${c.week}:${id}`,
        kind: "sell",
        score: clamp(score),
        title: `Sell high: ${label(p)}`,
        detail: `His price is likely at its peak.${buyers.length ? ` Contenders to pitch: ${buyers.join(", ")}.` : ""}${
          myPosture === "Contend" ? " You're contending — only sell for a starter back." : ""
        }`,
        signals,
        playerIds: [id],
        href: `${c.hrefBase}/tradefinder`,
      });
    }
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 10);
}

function lineupAndInjuries(c: Ctx): Insight[] {
  const mine = c.bundle.rosters.find((r) => r.roster_id === c.myRosterId);
  if (!mine) return [];
  // Once the week's last game has kicked off there's nothing left to set.
  const thisWeek = c.inputs.schedule.filter((g) => g.week === c.week);
  if (thisWeek.length && thisWeek.every((g) => kickoffTime(g.kickoff) <= c.inputs.asOf)) return [];
  const out: Insight[] = [];
  const league = c.bundle.leagueConfig.id;
  // Consensus points drive the optimizer; raw Sleeper projections fill gaps.
  const points: Record<string, number> = { ...c.inputs.weekProjections };
  for (const [id, s] of Object.entries(c.inputs.consensus)) points[id] = s.points;
  if (c.playing.size > 0) {
    for (const p of Object.values(c.players)) if (p.team && !c.playing.has(p.team)) points[p.sleeperId] = 0;
  }
  const active = (mine.players ?? []).filter((id) => !(mine.taxi ?? []).includes(id) && !(mine.reserve ?? []).includes(id));
  const starters = (mine.starters ?? []).filter((id) => id !== "0");
  const locked = (id: string) => {
    const g = teamGame(c.inputs.schedule, c.week, c.players[id]?.team ?? null);
    return g ? kickoffTime(g.game.kickoff) <= c.inputs.asOf : false;
  };
  const kickoff = (id: string) => {
    const g = teamGame(c.inputs.schedule, c.week, c.players[id]?.team ?? null);
    return g ? kickoffLabel(g.game.kickoff) : null;
  };
  const advice = lineupAdvice(starters, active.filter((id) => !locked(id) || starters.includes(id)), c.bundle.league.roster_positions, c.players, points);
  const bestFreeAgent = (pos: string) =>
    Object.values(c.players)
      .filter((p) => p.position === pos && p.team && !c.ownerOf.has(p.sleeperId) && !isUnavailable(p) && c.playing.has(p.team))
      .sort((a, b) => (points[b.sleeperId] ?? 0) - (points[a.sleeperId] ?? 0))[0];
  const bestBench = (pos: string) =>
    active
      .filter(
        (id) =>
          !starters.includes(id) &&
          c.players[id]?.position === pos &&
          !isUnavailable(c.players[id]) &&
          !locked(id) &&
          (points[id] ?? 0) > 0
      )
      .sort((a, b) => (points[b] ?? 0) - (points[a] ?? 0))[0];

  for (const id of starters) {
    const p = c.players[id];
    if (!p || locked(id)) continue;
    const report = c.inputs.injuryReports[id];
    const practice = report?.practice ? ` · practice: ${report.practice.replace(/ in Practice$/i, "").replace("Did Not Participate", "DNP")}` : "";
    const onBye = c.playing.size > 0 && p.team !== null && !c.playing.has(p.team);
    const status = onBye ? "Bye" : p.injuryStatus;
    if (!status) continue;
    const severe = onBye || isUnavailable(p) || status === "Doubtful";
    if (!severe && status !== "Questionable") continue;
    const pivot = bestBench(p.position);
    const fa = pivot ? undefined : bestFreeAgent(p.position);
    const signals: Signal[] = [
      {
        source: "Injury report",
        text: onBye ? `${p.team} is on bye in week ${c.week}` : `${status}${p.injuryBodyPart ? ` (${p.injuryBodyPart})` : ""}${practice}`,
      },
    ];
    if (pivot) signals.push({ source: "Projections", text: `Pivot: ${c.players[pivot].name} (${(points[pivot] ?? 0).toFixed(1)} proj)` });
    if (fa) signals.push({ source: "Projections", text: `Best free agent: ${fa.name} (${(points[fa.sleeperId] ?? 0).toFixed(1)} proj)` });
    const news = newsSignal(c, id);
    if (news) signals.push(news);
    const ko = kickoff(id);
    out.push({
      id: `injury:${league}:${c.week}:${id}:${status}`,
      kind: "injury",
      score: severe ? 92 : 62,
      urgent: severe,
      title: severe ? `Bench ${p.name} — ${onBye ? "on bye" : status}` : `Monitor ${p.name} — Questionable`,
      detail: severe
        ? `He's in your starting lineup.${
            pivot
              ? ` Start ${c.players[pivot].name} instead.`
              : fa
                ? ` No healthy bench option — pick up ${fa.name}.`
                : " No healthy bench option — check waivers."
          }`
        : `Decide before kickoff${ko ? ` (${ko})` : ""}.${pivot ? ` Have ${c.players[pivot].name} ready.` : ""}`,
      signals,
      playerIds: [id, ...(pivot ? [pivot] : fa ? [fa.sleeperId] : [])],
      href: `${c.hrefBase}/startsit`,
    });
  }

  // Healthy swaps the consensus prefers.
  const handled = new Set(out.flatMap((i) => i.playerIds));
  advice.promote.forEach((up, i) => {
    const down = advice.sit[i];
    if (!down || handled.has(up) || handled.has(down)) return;
    const gain = (points[up] ?? 0) - (points[down] ?? 0);
    if (gain < 1.5) return;
    const signals: Signal[] = [];
    for (const [pid, verb] of [[up, "Start"], [down, "Sit"]] as const) {
      const s = c.inputs.consensus[pid];
      const pl = c.players[pid];
      if (s && pl) {
        const bits = [`${pl.position}${s.rank}`];
        if (s.experts) bits.push(`experts ${pl.position}${s.experts.rank}`);
        if (s.projection !== undefined) bits.push(`proj ${s.projection.toFixed(1)}`);
        if (s.started !== undefined) bits.push(`started ${Math.round(s.started)}%`);
        signals.push({ source: "Projections", text: `${verb} ${pl.name}: ${bits.join(" · ")}` });
      }
      const v = vegasSignal(c, pid);
      if (v) signals.push({ source: "Vegas", text: `${pl?.name}: ${v.signal.text}` });
    }
    out.push({
      id: `lineup:${league}:${c.week}:${up}:${down}`,
      kind: "lineup",
      score: clamp(50 + gain * 5),
      title: `Start ${c.players[up]?.name} over ${c.players[down]?.name}`,
      detail: `+${gain.toFixed(1)} consensus points (experts, projections and the crowd blended).`,
      signals,
      playerIds: [up, down],
      href: `${c.hrefBase}/startsit`,
    });
  });
  return out;
}

function rivalIntel(c: Ctx): Insight[] {
  const out: Insight[] = [];
  const league = c.bundle.leagueConfig.id;
  const oppId = c.myRosterId !== null ? c.inputs.opponents[c.myRosterId] : undefined;

  for (const r of c.bundle.rosters) {
    if (r.roster_id === c.myRosterId) continue;
    const name = c.teamNameById.get(r.roster_id);
    for (const id of (r.starters ?? []).filter((s) => s !== "0")) {
      const p = c.players[id];
      if (!p || !(isUnavailable(p) || p.injuryStatus === "Doubtful")) continue;
      // Handcuff sitting on waivers: grab it before they do.
      const backup = Object.values(c.players).find(
        (t) => t.team === p.team && t.position === p.position && t.depthOrder === 2 && !c.ownerOf.has(t.sleeperId) && !isUnavailable(t)
      );
      if (r.roster_id === oppId) {
        out.push({
          id: `rival:${league}:${c.week}:opp:${id}`,
          kind: "rival",
          score: 45,
          title: `Your opponent ${name} is without ${p.name}`,
          detail: backup
            ? `Block move: ${backup.name} is his backup and still on waivers.`
            : `Their ${p.position} room is thin this week.`,
          signals: [{ source: "Injury report", text: `${p.name}: ${p.injuryStatus}` }],
          playerIds: backup ? [id, backup.sleeperId] : [id],
        });
      }
      const surplus = c.mySurplus.get(p.position);
      if (surplus?.length && isUnavailable(p)) {
        const offer = surplus[0];
        out.push({
          id: `rival:${league}:${c.week}:need:${r.roster_id}:${id}`,
          kind: "rival",
          score: 55,
          title: `${name} just lost ${p.name} — pitch ${c.players[offer]?.name}`,
          detail: `You're deep at ${p.position} and they suddenly aren't. Needs create leverage.`,
          signals: [
            { source: "Injury report", text: `${p.name}: ${p.injuryStatus}` },
            { source: "Roster fit", text: `Your ${p.position} depth: ${surplus.map((s) => c.players[s]?.name).join(", ")}` },
          ],
          playerIds: [id, offer],
          href: tradeHref(c, { b: r.roster_id, sendA: [offer] }),
        });
      }
    }
  }

  // Dynasty: rebuilders holding productive veterans.
  if (c.bundle.leagueConfig.isDynasty && c.myRosterId !== null) {
    const me = c.bundle.teamAnalytics.find((t) => t.rosterId === c.myRosterId);
    if (me && (me.bucket === "Contend" || me.bucket === "Push")) {
      for (const t of c.bundle.teamAnalytics.filter((x) => x.bucket === "Rebuild")) {
        const r = c.bundle.rosters.find((x) => x.roster_id === t.rosterId);
        const vet = (r?.players ?? [])
          .map((id) => c.players[id])
          .filter((p): p is CanonicalPlayer => !!p && (p.age ?? 0) >= 28 && (p.values.fcRedraft?.value ?? 0) >= 4000)
          .sort((a, b) => (b.values.fcRedraft?.value ?? 0) - (a.values.fcRedraft?.value ?? 0))[0];
        if (!vet) continue;
        out.push({
          id: `rival:${league}:${c.week}:vet:${vet.sleeperId}`,
          kind: "rival",
          score: 40,
          title: `Rebuilding ${c.teamNameById.get(t.rosterId)} holds ${vet.name}`,
          detail: `A ${vet.age}-year-old producer is worth more to your push than to their rebuild — ask for a win-now discount.`,
          signals: [
            { source: "Roster fit", text: `${c.teamNameById.get(t.rosterId)}: ${t.bucket} · you: ${me.bucket}` },
            { source: "Market", text: `Redraft value ${fmt(vet.values.fcRedraft?.value ?? 0)}, dynasty ${fmt(c.valueOf(vet))}` },
          ],
          playerIds: [vet.sleeperId],
          href: tradeHref(c, { b: t.rosterId, sendB: [vet.sleeperId] }),
        });
      }
    }
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 6);
}

function stashes(c: Ctx): Insight[] {
  const mine = c.bundle.rosters.find((r) => r.roster_id === c.myRosterId);
  if (!mine) return [];
  const out: Insight[] = [];
  for (const id of mine.starters ?? []) {
    const p = c.players[id];
    // An injured starter's backup is already a waiver alert.
    if (!p || p.position !== "RB" || !p.team || c.valueOf(p) < 3000 || isUnavailable(p)) continue;
    const backup = Object.values(c.players).find(
      (t) => t.team === p.team && t.position === "RB" && t.depthOrder === 2 && !c.ownerOf.has(t.sleeperId)
    );
    if (!backup) continue;
    const signals: Signal[] = [{ source: "Depth chart", text: `${backup.name} is the RB2 behind ${p.name}` }];
    const u = c.inputs.usage[backup.sleeperId];
    if (u && u.carryShare > 0) signals.push({ source: "Usage", text: `Already sees ${pct(u.carryShare)} of team carries` });
    if (p.injuryStatus) signals.push({ source: "Injury report", text: `${p.name}: ${p.injuryStatus}` });
    out.push({
      id: `stash:${c.bundle.leagueConfig.id}:${backup.sleeperId}`,
      kind: "stash",
      score: 30 + (p.injuryStatus ? 15 : 0),
      title: `Insure ${p.name}: stash ${backup.name}`,
      detail: "Cheap insurance for one of your starting RBs — and it keeps a rival from getting it.",
      signals,
      playerIds: [backup.sleeperId, id],
    });
  }
  return out;
}

/** Every edge for a league, highest priority first. */
export function buildInsights(bundle: LeagueBundle, inputs: EdgeInputs, myRosterId: number | null): Insight[] {
  const c = makeCtx(bundle, inputs, myRosterId);
  return [
    ...lineupAndInjuries(c),
    ...waiverGems(c),
    ...buyLowSellHigh(c),
    ...rivalIntel(c),
    ...stashes(c),
  ].sort((a, b) => Number(b.urgent ?? false) - Number(a.urgent ?? false) || b.score - a.score);
}
