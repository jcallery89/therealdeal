/**
 * Push League HQ edges to your phone via ntfy (https://ntfy.sh).
 *
 *   npx tsx scripts/alerts.ts --run=waivers|gameday|daily [--dry-run]
 *
 * Env:
 *   NTFY_TOPIC        your private topic (required unless --dry-run)
 *   NTFY_SERVER       default https://ntfy.sh
 *   SLEEPER_USERNAME  whose team to alert for (default LubeyGolfGloves)
 *   APP_URL           links in alerts (default the Vercel deployment)
 *   ALERTS_STATE      JSON file remembering what was already sent
 *
 * Run by .github/workflows/alerts.yml at key moments of the NFL week.
 */
import { existsSync, readFileSync, writeFileSync } from "fs";
import { getLeagueBundle } from "../src/lib/bundle";
import { LEAGUES } from "../src/lib/config";
import { getEdgeInputs } from "../src/lib/edge/data";
import { buildInsights, KIND_LABELS } from "../src/lib/edge/insights";
import type { Insight, InsightKind } from "../src/lib/edge/types";
import { resolveMyRosterId } from "../src/lib/leagueBundle";
import { getUser } from "../src/lib/sleeper/client";

type RunKind = "waivers" | "gameday" | "daily";

const args = process.argv.slice(2);
const run = (args.find((a) => a.startsWith("--run="))?.split("=")[1] ?? "daily") as RunKind;
const dryRun = args.includes("--dry-run");
const topic = process.env.NTFY_TOPIC?.trim();
const server = (process.env.NTFY_SERVER || "https://ntfy.sh").replace(/\/$/, "");
const username = process.env.SLEEPER_USERNAME || "LubeyGolfGloves";
const appUrl = (process.env.APP_URL || "https://therealdeal-ebon.vercel.app").replace(/\/$/, "");
const statePath = process.env.ALERTS_STATE || ".alerts-state.json";

const RETENTION_MS = 21 * 24 * 3600 * 1000;

interface State {
  sent: Record<string, number>;
}

function loadState(): State {
  try {
    if (existsSync(statePath)) return JSON.parse(readFileSync(statePath, "utf8")) as State;
  } catch {
    console.warn(`Couldn't read ${statePath}; starting fresh.`);
  }
  return { sent: {} };
}

const TAGS: Record<InsightKind, string> = {
  injury: "rotating_light",
  lineup: "clipboard",
  waiver: "gem",
  stash: "package",
  buy: "chart_with_upwards_trend",
  sell: "moneybag",
  rival: "eyes",
};

/** Which edges each run pushes, and how. */
const RUNS: Record<RunKind, { kinds: InsightKind[]; minScore: number; digest: boolean; max: number }> = {
  // Tuesday night: everything worth a claim or a trade offer, as one digest per league.
  waivers: { kinds: ["waiver", "stash", "buy", "sell", "rival"], minScore: 35, digest: true, max: 8 },
  // Before kickoffs: lineup problems, one push each.
  gameday: { kinds: ["injury", "lineup"], minScore: 50, digest: false, max: 6 },
  // Daily sweep: anything new and strong, plus lineup emergencies.
  daily: { kinds: ["injury", "lineup", "waiver", "buy", "sell", "rival", "stash"], minScore: 60, digest: false, max: 5 },
};

interface Message {
  title: string;
  message: string;
  priority: number;
  tags: string[];
  click: string;
}

function toMessage(i: Insight, leagueLabel: string, edgeUrl: string): Message {
  const evidence = i.signals.slice(0, 4).map((s) => `• ${s.source}: ${s.text}`).join("\n");
  return {
    title: `${leagueLabel}: ${i.title}`,
    message: `${i.detail}\n${evidence}`,
    priority: i.urgent ? 5 : i.score >= 75 ? 4 : 3,
    tags: [TAGS[i.kind]],
    click: i.href ? `${appUrl}${i.href}` : edgeUrl,
  };
}

function toDigest(items: Insight[], leagueLabel: string, week: number, edgeUrl: string): Message {
  const lines = items.map((i) => {
    const top = i.signals[0];
    const title = i.title.startsWith(KIND_LABELS[i.kind]) ? i.title : `${KIND_LABELS[i.kind]}: ${i.title}`;
    return `• ${title}${top ? ` — ${top.text}` : ""}`;
  });
  return {
    title: `${leagueLabel} — week ${week} waiver & trade rundown`,
    message: lines.join("\n"),
    priority: 4,
    tags: ["football"],
    click: edgeUrl,
  };
}

async function send(msg: Message): Promise<void> {
  if (dryRun || !topic) {
    console.log(`\n--- ${msg.title} (priority ${msg.priority})\n${msg.message}\n→ ${msg.click}`);
    return;
  }
  const res = await fetch(server, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic, ...msg }),
  });
  if (!res.ok) throw new Error(`ntfy responded HTTP ${res.status}: ${await res.text()}`);
}

async function main() {
  if (!RUNS[run]) throw new Error(`Unknown --run=${run} (use waivers, gameday or daily)`);
  if (!topic && !dryRun) {
    console.log("::warning::NTFY_TOPIC is not set — printing alerts instead of sending. Add it as a repository secret.");
  }
  const cfg = RUNS[run];
  const state = loadState();
  const now = Date.now();
  for (const [id, at] of Object.entries(state.sent)) if (now - at > RETENTION_MS) delete state.sent[id];

  const user = await getUser(username);
  let sentCount = 0;
  for (const league of LEAGUES) {
    const bundle = await getLeagueBundle(league.id, true);
    if (!bundle) continue;
    const myRosterId = resolveMyRosterId({ userId: user.data.user_id }, bundle.rosters, league.id);
    if (myRosterId === null) {
      console.log(`${league.label}: ${username} isn't on a roster; skipping.`);
      continue;
    }
    const inputs = await getEdgeInputs(bundle);
    const fresh = buildInsights(bundle, inputs, myRosterId).filter(
      (i) => cfg.kinds.includes(i.kind) && (i.score >= cfg.minScore || i.urgent) && !state.sent[i.id]
    );
    const picked = fresh.slice(0, cfg.max);
    console.log(`${league.label}: ${fresh.length} new edges, sending ${picked.length} (${run}).`);
    if (picked.length === 0) continue;

    const edgeUrl = `${appUrl}/league/${league.id}/edge`;
    if (cfg.digest) {
      await send(toDigest(picked, league.label, bundle.state.week, edgeUrl));
    } else {
      for (const i of picked) await send(toMessage(i, league.label, edgeUrl));
    }
    if (!dryRun && topic) for (const i of picked) state.sent[i.id] = now;
    sentCount += picked.length;
  }

  // Only real sends are remembered; the file always exists for the cache step.
  writeFileSync(statePath, JSON.stringify(state, null, 2));
  console.log(`Done: ${sentCount} edge(s) ${dryRun || !topic ? "printed" : "sent"}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
