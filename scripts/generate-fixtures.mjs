/**
 * Deterministic fixture generator for offline/demo mode.
 *
 * Produces an internally consistent demo world: 120 players (synthetic
 * Sleeper ids) shared by both leagues, distributed across 10 rosters per
 * league, with value files for every market source that reference the same
 * players. Run `node scripts/generate-fixtures.mjs` to regenerate.
 */
import { mkdirSync, writeFileSync } from "fs";
import path from "path";

const ROOT = path.join(import.meta.dirname, "..", "fixtures");
const KEEPER_ID = "1377306985065619456";
const DYNASTY_ID = "1315718697288990720";
const SEASON = "2025";
const WEEK = 10;
const MY_USER_ID = "900000000000000001";

// mulberry32 — seeded PRNG so regeneration is stable.
function rng(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(42);

// [name, pos, team, age, yearsExp, dynastySfValue, redraftValue]
// Values are on FantasyCalc-like scales (top ~10500 dynasty SF).
const POOL = [
  ["Josh Allen", "QB", "BUF", 29, 7, 10500, 7800],
  ["Lamar Jackson", "QB", "BAL", 28, 7, 9900, 7600],
  ["Jayden Daniels", "QB", "WAS", 24, 1, 9800, 6900],
  ["Jalen Hurts", "QB", "PHI", 27, 5, 8900, 6500],
  ["Patrick Mahomes", "QB", "KC", 30, 8, 8300, 6200],
  ["Joe Burrow", "QB", "CIN", 28, 5, 8800, 6800],
  ["C.J. Stroud", "QB", "HOU", 24, 2, 7200, 5200],
  ["Caleb Williams", "QB", "CHI", 23, 1, 7400, 5000],
  ["Drake Maye", "QB", "NE", 23, 1, 7100, 4800],
  ["Justin Herbert", "QB", "LAC", 27, 5, 7000, 5100],
  ["Kyler Murray", "QB", "ARI", 28, 6, 6300, 4700],
  ["Bo Nix", "QB", "DEN", 25, 1, 6500, 4900],
  ["Jordan Love", "QB", "GB", 27, 5, 6200, 4600],
  ["Baker Mayfield", "QB", "TB", 30, 7, 5200, 4800],
  ["Dak Prescott", "QB", "DAL", 32, 9, 4600, 4200],
  ["Tua Tagovailoa", "QB", "MIA", 27, 5, 4400, 4000],
  ["Trevor Lawrence", "QB", "JAX", 26, 4, 4800, 3900],
  ["Cam Ward", "QB", "TEN", 23, 0, 6000, 3600],
  ["J.J. McCarthy", "QB", "MIN", 22, 1, 6100, 4100],
  ["Michael Penix Jr.", "QB", "ATL", 25, 1, 5400, 3800],
  ["Jared Goff", "QB", "DET", 31, 9, 4300, 4300],
  ["Brock Purdy", "QB", "SF", 26, 3, 4700, 4100],
  ["Bijan Robinson", "RB", "ATL", 23, 2, 9600, 9200],
  ["Jahmyr Gibbs", "RB", "DET", 23, 2, 9300, 9000],
  ["Ashton Jeanty", "RB", "LV", 22, 0, 8800, 7400],
  ["Saquon Barkley", "RB", "PHI", 28, 7, 6900, 8300],
  ["Breece Hall", "RB", "NYJ", 24, 3, 6100, 6300],
  ["Jonathan Taylor", "RB", "IND", 26, 5, 5900, 7000],
  ["De'Von Achane", "RB", "MIA", 24, 2, 6800, 6900],
  ["Bucky Irving", "RB", "TB", 23, 1, 6600, 6500],
  ["Kyren Williams", "RB", "LAR", 25, 3, 5300, 6200],
  ["Derrick Henry", "RB", "BAL", 31, 9, 4200, 7100],
  ["Josh Jacobs", "RB", "GB", 27, 6, 5100, 6600],
  ["Chase Brown", "RB", "CIN", 25, 2, 5000, 5800],
  ["Kenneth Walker III", "RB", "SEA", 25, 3, 4600, 5300],
  ["James Cook", "RB", "BUF", 26, 3, 4700, 5700],
  ["Omarion Hampton", "RB", "LAC", 22, 0, 6400, 5500],
  ["TreVeyon Henderson", "RB", "NE", 23, 0, 5600, 4700],
  ["Quinshon Judkins", "RB", "CLE", 22, 0, 5500, 4900],
  ["RJ Harvey", "RB", "DEN", 24, 0, 4300, 3600],
  ["Chuba Hubbard", "RB", "CAR", 26, 4, 3900, 4600],
  ["Alvin Kamara", "RB", "NO", 30, 8, 3000, 4800],
  ["Christian McCaffrey", "RB", "SF", 29, 8, 4000, 6000],
  ["Aaron Jones", "RB", "MIN", 31, 8, 2400, 3900],
  ["Rachaad White", "RB", "TB", 26, 4, 2200, 2800],
  ["Tony Pollard", "RB", "TEN", 28, 6, 2500, 3500],
  ["David Montgomery", "RB", "DET", 28, 7, 2600, 3700],
  ["D'Andre Swift", "RB", "CHI", 26, 5, 2900, 3800],
  ["Isiah Pacheco", "RB", "KC", 26, 3, 2700, 3400],
  ["Brian Robinson Jr.", "RB", "WAS", 26, 4, 2300, 3200],
  ["Rhamondre Stevenson", "RB", "NE", 27, 5, 2100, 2900],
  ["Zach Charbonnet", "RB", "SEA", 24, 2, 2800, 3000],
  ["Jaylen Warren", "RB", "PIT", 27, 4, 2000, 2700],
  ["Tyjae Spears", "RB", "TEN", 24, 2, 1900, 2200],
  ["Kaleb Johnson", "RB", "PIT", 22, 0, 3400, 2600],
  ["Braelon Allen", "RB", "NYJ", 21, 1, 2400, 1900],
  ["Ja'Marr Chase", "WR", "CIN", 25, 4, 10200, 9800],
  ["Justin Jefferson", "WR", "MIN", 26, 5, 9500, 9300],
  ["CeeDee Lamb", "WR", "DAL", 26, 5, 8900, 8800],
  ["Amon-Ra St. Brown", "WR", "DET", 26, 4, 8500, 8600],
  ["Puka Nacua", "WR", "LAR", 24, 2, 9000, 8900],
  ["Malik Nabers", "WR", "NYG", 22, 1, 8800, 8200],
  ["Marvin Harrison Jr.", "WR", "ARI", 23, 1, 7300, 6400],
  ["Nico Collins", "WR", "HOU", 26, 5, 7100, 7500],
  ["Brian Thomas Jr.", "WR", "JAX", 23, 1, 8000, 7300],
  ["A.J. Brown", "WR", "PHI", 28, 6, 6500, 7600],
  ["Drake London", "WR", "ATL", 24, 3, 7500, 7400],
  ["Garrett Wilson", "WR", "NYJ", 25, 3, 6800, 6700],
  ["Tyreek Hill", "WR", "MIA", 31, 9, 4400, 6200],
  ["Davante Adams", "WR", "LAR", 33, 11, 3200, 5400],
  ["Jaxon Smith-Njigba", "WR", "SEA", 23, 2, 7700, 7200],
  ["Ladd McConkey", "WR", "LAC", 24, 1, 6900, 6600],
  ["Tetairoa McMillan", "WR", "CAR", 22, 0, 6600, 5600],
  ["Travis Hunter", "WR", "JAX", 22, 0, 6300, 4800],
  ["Rome Odunze", "WR", "CHI", 23, 1, 5800, 5100],
  ["Rashee Rice", "WR", "KC", 25, 2, 5900, 6100],
  ["DeVonta Smith", "WR", "PHI", 27, 4, 5200, 5700],
  ["Jaylen Waddle", "WR", "MIA", 27, 4, 4900, 5200],
  ["Terry McLaurin", "WR", "WAS", 30, 6, 3700, 5500],
  ["Mike Evans", "WR", "TB", 32, 11, 3300, 5600],
  ["Chris Godwin", "WR", "TB", 29, 8, 2900, 4300],
  ["DK Metcalf", "WR", "PIT", 28, 6, 4500, 5300],
  ["Zay Flowers", "WR", "BAL", 25, 2, 5400, 5500],
  ["DJ Moore", "WR", "CHI", 28, 7, 4300, 5000],
  ["Jameson Williams", "WR", "DET", 24, 3, 5000, 4900],
  ["Xavier Worthy", "WR", "KC", 22, 1, 5700, 5400],
  ["Jordan Addison", "WR", "MIN", 23, 2, 4800, 4700],
  ["Chris Olave", "WR", "NO", 25, 3, 4400, 4400],
  ["George Pickens", "WR", "DAL", 24, 3, 4600, 4800],
  ["Tee Higgins", "WR", "CIN", 26, 5, 4700, 5800],
  ["Hollywood Brown", "WR", "KC", 28, 6, 1800, 2400],
  ["Stefon Diggs", "WR", "NE", 31, 10, 1900, 2900],
  ["Calvin Ridley", "WR", "TEN", 30, 6, 2200, 3300],
  ["Jerry Jeudy", "WR", "CLE", 26, 5, 2600, 3400],
  ["Courtland Sutton", "WR", "DEN", 30, 7, 2300, 3600],
  ["Cooper Kupp", "WR", "SEA", 32, 8, 1600, 2600],
  ["Matthew Golden", "WR", "GB", 22, 0, 4500, 3700],
  ["Emeka Egbuka", "WR", "TB", 23, 0, 4900, 4100],
  ["Luther Burden III", "WR", "CHI", 22, 0, 3800, 2800],
  ["Jayden Higgins", "WR", "HOU", 23, 0, 3500, 2700],
  ["Brock Bowers", "TE", "LV", 23, 1, 8200, 7700],
  ["Trey McBride", "TE", "ARI", 26, 3, 6700, 6800],
  ["Sam LaPorta", "TE", "DET", 24, 2, 5600, 5600],
  ["George Kittle", "TE", "SF", 32, 8, 3100, 5200],
  ["T.J. Hockenson", "TE", "MIN", 28, 6, 3400, 4200],
  ["Mark Andrews", "TE", "BAL", 30, 7, 2500, 3900],
  ["Travis Kelce", "TE", "KC", 36, 12, 1700, 3500],
  ["David Njoku", "TE", "CLE", 29, 8, 2700, 3700],
  ["Dalton Kincaid", "TE", "BUF", 26, 2, 3000, 3200],
  ["Evan Engram", "TE", "DEN", 31, 8, 1500, 2500],
  ["Kyle Pitts", "TE", "ATL", 25, 4, 2800, 3000],
  ["Tucker Kraft", "TE", "GB", 25, 2, 3600, 3800],
  ["Jake Ferguson", "TE", "DAL", 26, 3, 2000, 2600],
  ["Dallas Goedert", "TE", "PHI", 30, 7, 1400, 2300],
  ["Pat Freiermuth", "TE", "PIT", 27, 4, 1600, 2200],
  ["Tyler Warren", "TE", "IND", 23, 0, 5300, 4400],
  ["Colston Loveland", "TE", "CHI", 21, 0, 4700, 3300],
  ["Isaiah Likely", "TE", "BAL", 25, 3, 1900, 2000],
  ["Cade Otton", "TE", "TB", 26, 3, 1300, 1800],
  ["Hunter Henry", "TE", "NE", 31, 9, 1000, 1900],
];

const players = POOL.map(([name, pos, team, age, exp, dyn, red], i) => ({
  id: `p${1001 + i}`,
  name, pos, team, age, exp, dyn, red,
  injury: null,
}));

// A couple of injury statuses for badge testing.
players.find((p) => p.name === "Rashee Rice").injury = "Questionable";
players.find((p) => p.name === "Christian McCaffrey").injury = "IR";
players.find((p) => p.name === "Chris Godwin").injury = "Out";

// Unrostered players so free-agent views (waiver watch, players explorer)
// have data. Not distributed to any roster.
const FA_POOL = [
  ["Justin Fields", "QB", "NYJ", 27, 7, 2600, 2900],
  ["Daniel Jones", "QB", "IND", 29, 7, 1500, 2400],
  ["Tyler Allgeier", "RB", "ATL", 26, 4, 1700, 2100],
  ["Jaylen Wright", "RB", "MIA", 23, 2, 2100, 1600],
  ["Ray Davis", "RB", "BUF", 26, 2, 1200, 1300],
  ["Tank Bigsby", "RB", "JAX", 25, 3, 1400, 1500],
  ["Wan'Dale Robinson", "WR", "NYG", 25, 4, 1600, 2300],
  ["Rashid Shaheed", "WR", "NO", 28, 4, 1300, 2000],
  ["Jalen McMillan", "WR", "TB", 24, 2, 1500, 1400],
  ["Demario Douglas", "WR", "NE", 25, 3, 1100, 1500],
  ["Dalton Schultz", "TE", "HOU", 30, 8, 800, 1800],
  ["Mike Gesicki", "TE", "CIN", 31, 8, 600, 1500],
];
const faPlayers = FA_POOL.map(([name, pos, team, age, exp, dyn, red], i) => ({
  id: `p${2001 + i}`,
  name, pos, team, age, exp, dyn, red,
  injury: null,
}));
const allPlayers = [...players, ...faPlayers];

const TEAMS = [
  { name: "The Real Deal Crew", user: "Demo Manager", username: "demo" },
  { name: "Bijan Mustard", user: "Alex R." },
  { name: "Nacua Matata", user: "Sam T." },
  { name: "Hurts So Good", user: "Jordan K." },
  { name: "Breece Mode", user: "Casey M." },
  { name: "Lamar the Merrier", user: "Riley P." },
  { name: "Chase-ing Rings", user: "Morgan L." },
  { name: "Purdy Good Squad", user: "Taylor B." },
  { name: "The Gibbs Standard", user: "Drew S." },
  { name: "Waddle We Do Now", user: "Jamie F." },
];

function userId(i) {
  return i === 0 ? MY_USER_ID : `9000000000000000${String(i + 1).padStart(2, "0")}`;
}

// Snake-draft distribution so both leagues get different but balanced rosters.
function distribute(sortKey, order) {
  const sorted = [...players].sort((a, b) => b[sortKey] - a[sortKey]);
  const rosters = Array.from({ length: 10 }, () => []);
  sorted.forEach((p, i) => {
    const round = Math.floor(i / 10);
    const idx = round % 2 === 0 ? i % 10 : 9 - (i % 10);
    rosters[order[idx] - 1].push(p);
  });
  return rosters; // rosters[rosterId-1] = player list
}

const dynastyOrder = [3, 7, 1, 9, 5, 2, 10, 4, 8, 6];
const keeperOrder = [6, 2, 9, 1, 4, 10, 3, 8, 5, 7];

const DYNASTY_POSITIONS = ["QB", "RB", "RB", "WR", "WR", "WR", "TE", "FLEX", "SUPER_FLEX", "BN", "BN", "BN"];
const KEEPER_POSITIONS = ["QB", "RB", "RB", "WR", "WR", "WR", "TE", "FLEX", "BN", "BN", "BN", "BN"];

function pickStarters(list, positions, key) {
  const remaining = [...list].sort((a, b) => b[key] - a[key]);
  const take = (pred) => {
    const i = remaining.findIndex(pred);
    return i >= 0 ? remaining.splice(i, 1)[0] : null;
  };
  const starters = [];
  for (const slot of positions) {
    if (slot === "BN") continue;
    let p = null;
    if (slot === "FLEX") p = take((x) => ["RB", "WR", "TE"].includes(x.pos));
    else if (slot === "SUPER_FLEX") p = take((x) => ["QB", "RB", "WR", "TE"].includes(x.pos));
    else p = take((x) => x.pos === slot);
    starters.push(p ? p.id : "0");
  }
  return starters;
}

function makeLeagueFixtures(leagueId, name, isDynasty, order) {
  const positions = isDynasty ? DYNASTY_POSITIONS : KEEPER_POSITIONS;
  const lists = distribute(isDynasty ? "dyn" : "red", order);

  const league = {
    league_id: leagueId,
    name,
    season: SEASON,
    status: "in_season",
    total_rosters: 10,
    roster_positions: positions,
    scoring_settings: { rec: 1, bonus_rec_te: 0.5, pass_td: isDynasty ? 6 : 4 },
    settings: {
      type: isDynasty ? 2 : 1,
      taxi_slots: isDynasty ? 3 : 0,
      max_keepers: isDynasty ? 30 : 3,
      reserve_slots: 2,
      leg: WEEK,
    },
    previous_league_id: null,
    avatar: null,
  };

  const strength = lists.map((list) =>
    list.reduce((s, p) => s + p.red, 0)
  );
  const strengthRank = [...strength]
    .map((v, i) => [v, i])
    .sort((a, b) => b[0] - a[0])
    .map(([, i]) => i);

  const rosters = lists.map((list, i) => {
    const rank = strengthRank.indexOf(i); // 0 = strongest
    const wins = Math.max(1, Math.min(8, Math.round(8 - (rank * 7) / 9)));
    const losses = WEEK - 1 - wins;
    const taxi = isDynasty
      ? list.filter((p) => p.exp === 0).slice(0, 2).map((p) => p.id)
      : [];
    const reserve = list
      .filter((p) => p.injury === "IR" || p.injury === "Out")
      .slice(0, 1)
      .map((p) => p.id);
    const active = list.filter((p) => !taxi.includes(p.id) && !reserve.includes(p.id));
    return {
      roster_id: i + 1,
      owner_id: userId(i),
      co_owners: null,
      players: list.map((p) => p.id),
      starters: pickStarters(active, positions, "red"),
      reserve,
      taxi,
      settings: {
        wins,
        losses,
        ties: 0,
        fpts: Math.round(900 + strength[i] / 80 + rand() * 120),
        fpts_against: Math.round(950 + rand() * 150),
      },
    };
  });

  const users = TEAMS.map((t, i) => ({
    user_id: userId(i),
    display_name: t.user,
    avatar: null,
    metadata: { team_name: t.name },
    is_owner: i === 0,
  }));

  const nextSeasons = [1, 2, 3].map((n) => String(parseInt(SEASON) + n));
  const tradedPicks = [];
  const pickTrades = isDynasty
    ? [
        [nextSeasons[0], 1, 4, 1], // my team acquired team 4's next 1st
        [nextSeasons[0], 2, 1, 6], // sent my next 2nd to team 6
        [nextSeasons[1], 1, 9, 2],
        [nextSeasons[0], 3, 2, 9],
        [nextSeasons[1], 2, 5, 3],
        [nextSeasons[2], 1, 7, 10],
        [nextSeasons[1], 3, 10, 5],
        [nextSeasons[0], 1, 8, 5],
      ]
    : [
        [nextSeasons[0], 1, 3, 1],
        [nextSeasons[0], 2, 1, 8],
        [nextSeasons[1], 1, 6, 2],
      ];
  for (const [season, round, orig, owner] of pickTrades) {
    tradedPicks.push({
      season,
      round,
      roster_id: orig,
      owner_id: owner,
      previous_owner_id: orig,
    });
  }

  const matchups = [];
  for (let m = 1; m <= 5; m++) {
    for (const rosterId of [m * 2 - 1, m * 2]) {
      const r = rosters[rosterId - 1];
      // Per-player actual points; a team's score is its starters' sum, so
      // bench points and "optimal lineup" math are internally consistent.
      const byId = Object.fromEntries(allPlayers.map((p) => [p.id, p]));
      const playersPoints = {};
      for (const id of r.players) {
        const p = byId[id];
        const out = p.injury === "IR" || p.injury === "Out";
        playersPoints[id] = out ? 0 : Math.round(Math.max(0, p.red / 450 + (rand() - 0.35) * 16) * 100) / 100;
      }
      const startersPoints = r.starters.map((id) => playersPoints[id] ?? 0);
      matchups.push({
        roster_id: rosterId,
        matchup_id: m,
        points: Math.round(startersPoints.reduce((a, b) => a + b, 0) * 100) / 100,
        starters: r.starters,
        players: r.players,
        players_points: playersPoints,
        starters_points: startersPoints,
      });
    }
  }

  // Upcoming rookie/startup draft: order = inverse standings (worst picks first).
  const draftId = `draft-${leagueId.slice(-6)}`;
  const byRecord = [...rosters].sort(
    (a, b) => a.settings.wins - b.settings.wins || a.settings.fpts - b.settings.fpts
  );
  const draftOrder = {};
  byRecord.forEach((r, i) => {
    draftOrder[r.owner_id] = i + 1;
  });
  const drafts = [
    {
      draft_id: draftId,
      season: String(parseInt(SEASON) + 1),
      status: "pre_draft",
      type: "linear",
      draft_order: draftOrder,
      settings: { rounds: isDynasty ? 4 : 3, teams: 10 },
      start_time: null,
    },
  ];
  mkdirSync(path.join(ROOT, "drafts"), { recursive: true });
  writeFileSync(path.join(ROOT, "drafts", `${draftId}-picks.json`), JSON.stringify([], null, 2));

  const dir = path.join(ROOT, "leagues", leagueId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "drafts.json"), JSON.stringify(drafts, null, 2));
  writeFileSync(path.join(dir, "league.json"), JSON.stringify(league, null, 2));
  writeFileSync(path.join(dir, "rosters.json"), JSON.stringify(rosters, null, 2));
  writeFileSync(path.join(dir, "users.json"), JSON.stringify(users, null, 2));
  writeFileSync(path.join(dir, "traded_picks.json"), JSON.stringify(tradedPicks, null, 2));
  writeFileSync(path.join(dir, "matchups-1.json"), JSON.stringify(matchups, null, 2));
}

mkdirSync(ROOT, { recursive: true });

// --- Sleeper-shaped fixtures ---
writeFileSync(
  path.join(ROOT, "state.json"),
  JSON.stringify({ week: WEEK, season: SEASON, season_type: "regular", league_season: SEASON }, null, 2)
);

writeFileSync(
  path.join(ROOT, "user-therealdeal.json"),
  JSON.stringify(
    { user_id: MY_USER_ID, username: "demo", display_name: "Demo Manager", avatar: null },
    null,
    2
  )
);

const playersMap = {};
for (const p of allPlayers) {
  playersMap[p.id] = {
    player_id: p.id,
    full_name: p.name,
    position: p.pos,
    team: p.team,
    age: p.age,
    years_exp: p.exp,
    injury_status: p.injury === "IR" ? "Out" : p.injury,
    status: p.injury === "IR" ? "Inactive" : "Active",
  };
}
writeFileSync(path.join(ROOT, "players-subset.json"), JSON.stringify(playersMap, null, 2));

makeLeagueFixtures(KEEPER_ID, "The Real Deal", false, keeperOrder);
makeLeagueFixtures(DYNASTY_ID, "Dynasty League", true, dynastyOrder);

// --- FantasyCalc-shaped fixtures ---
function jitter(v, pct) {
  return Math.round(v * (1 + (rand() * 2 - 1) * pct));
}

function fcEntries(key) {
  const sorted = [...allPlayers].sort((a, b) => b[key] - a[key]);
  const posCounts = {};
  return sorted.map((p, i) => {
    posCounts[p.pos] = (posCounts[p.pos] ?? 0) + 1;
    return {
      player: {
        id: 20000 + allPlayers.indexOf(p),
        name: p.name,
        position: p.pos,
        sleeperId: p.id,
        maybeAge: p.age,
        maybeTeam: p.team,
      },
      value: p[key],
      overallRank: i + 1,
      positionRank: posCounts[p.pos],
      trend30Day: jitter(300, 1) - 300 + (p.exp === 0 ? 150 : 0),
      redraftValue: p.red,
    };
  });
}

const PICK_CURVE = { 1: [6500, 5000, 3800], 2: [2600, 2000, 1500], 3: [900, 700, 500], 4: [350, 250, 180] };
const fcPicks = [];
let pickId = 30000;
const y1 = String(parseInt(SEASON) + 1);
for (const round of [1, 2, 3, 4]) {
  ["Early", "Mid", "Late"].forEach((bucket, bi) => {
    fcPicks.push({
      player: { id: pickId++, name: `${y1} ${bucket} ${["1st", "2nd", "3rd", "4th"][round - 1]}`, position: "PICK", sleeperId: null, maybeAge: null, maybeTeam: null },
      value: PICK_CURVE[round][bi],
      overallRank: 0, positionRank: null, trend30Day: 0, redraftValue: null,
    });
  });
}
for (const yearsOut of [2, 3]) {
  const season = String(parseInt(SEASON) + yearsOut);
  for (const round of [1, 2, 3, 4]) {
    fcPicks.push({
      player: { id: pickId++, name: `${season} ${["1st", "2nd", "3rd", "4th"][round - 1]}`, position: "PICK", sleeperId: null, maybeAge: null, maybeTeam: null },
      value: Math.round(PICK_CURVE[round][1] * Math.pow(0.9, yearsOut - 1)),
      overallRank: 0, positionRank: null, trend30Day: 0, redraftValue: null,
    });
  }
}

writeFileSync(
  path.join(ROOT, "fantasycalc-dynasty-sf.json"),
  JSON.stringify([...fcEntries("dyn"), ...fcPicks], null, 2)
);
writeFileSync(
  path.join(ROOT, "fantasycalc-redraft.json"),
  JSON.stringify(fcEntries("red"), null, 2)
);

// --- Dynasty Dealer (parsed shape; Sleeper ids). Mirrors the draw order of
// the retired KTC fixture so the rest of the demo world stays identical. ---
const ddPlayers = allPlayers
  .filter((p) => p.dyn > 1200 || rand() > 0.5) // ~85% coverage
  .map((p) => {
    jitter(1, 0.06); // keep the random sequence stable
    return {
      sleeperId: p.id,
      name: p.name,
      position: p.pos,
      team: p.team,
      value: Math.min(9999, jitter(Math.round((p.dyn / 10500) * 9700), 0.05)),
    };
  });
const ddPicks = [];
for (const [yi, season] of [String(parseInt(SEASON) + 1), String(parseInt(SEASON) + 2)].entries()) {
  for (const round of [1, 2, 3]) {
    ["Early", "Mid", "Late"].forEach((bucket, bi) => {
      ddPicks.push({
        name: `${season} ${bucket} ${["1st", "2nd", "3rd"][round - 1]}`,
        value: Math.round(PICK_CURVE[round][bi] * 1.05 * Math.pow(0.9, yi)),
      });
    });
  }
}
writeFileSync(path.join(ROOT, "dynastydealer.json"), JSON.stringify({ players: ddPlayers, picks: ddPicks }, null, 2));

// --- Trending ---
const byTrend = [...allPlayers].sort((a, b) => (b.exp === 0 ? b.dyn : b.dyn * 0.4) - (a.exp === 0 ? a.dyn : a.dyn * 0.4));
writeFileSync(
  path.join(ROOT, "trending-add.json"),
  JSON.stringify(byTrend.slice(0, 15).map((p, i) => ({ player_id: p.id, count: 5200 - i * 300 })), null, 2)
);
const olds = [...allPlayers].sort((a, b) => b.age - a.age);
writeFileSync(
  path.join(ROOT, "trending-drop.json"),
  JSON.stringify(olds.slice(0, 15).map((p, i) => ({ player_id: p.id, count: 2100 - i * 120 })), null, 2)
);

// --- Projections (best-effort endpoint fixture; pts_ppr + rec exercise the
// fallback scoring path with TE premium) ---
const RECEPTIONS = { QB: 0, RB: 2.5, WR: 5, TE: 4.5 };
const weekProjections = allPlayers.map((p) => ({
  player_id: p.id,
  stats: {
    pts_ppr: Math.round((p.red / 400 + rand() * 8) * 10) / 10,
    rec: Math.round((RECEPTIONS[p.pos] ?? 0) * (0.6 + rand() * 0.8) * 10) / 10,
  },
}));
writeFileSync(path.join(ROOT, "projections-week.json"), JSON.stringify(weekProjections, null, 2));

// --- Season-to-date stats: Sleeper's object-map shape {player_id: stats}
// (the projections fixture uses the array shape; both are normalized). ---
const GAMES = WEEK - 1;
const seasonStats = {};
for (const p of allPlayers) {
  const gp = p.injury === "IR" ? Math.max(1, GAMES - 5) : GAMES - (rand() > 0.85 ? 1 : 0);
  const ppg = p.red / 450 + rand() * 6 - 2;
  seasonStats[p.id] = {
    gp,
    pts_ppr: Math.round(Math.max(0, ppg) * gp * 10) / 10,
    rec: Math.round((RECEPTIONS[p.pos] ?? 0) * gp * (0.6 + rand() * 0.8)),
  };
}
writeFileSync(path.join(ROOT, "stats-season.json"), JSON.stringify(seasonStats, null, 2));

// New sources are generated last so the fixtures above keep their values.

// --- Season-long projections (array shape) for the projections value source ---
writeFileSync(
  path.join(ROOT, "projections-season.json"),
  JSON.stringify(
    allPlayers.map((p) => {
      const gp = 17;
      const ppg = Math.max(0, p.red / 430 + rand() * 5 - 2);
      return {
        player_id: p.id,
        stats: {
          gp,
          pts_ppr: Math.round(ppg * gp * 10) / 10,
          rec: Math.round((RECEPTIONS[p.pos] ?? 0) * gp * (0.6 + rand() * 0.8)),
        },
      };
    }),
    null,
    2
  )
);

// --- FantasyCalc dynasty 1QB (keeper horizon for The Real Deal) ---
for (const p of allPlayers) {
  p.dyn1 = jitter(Math.round(p.pos === "QB" ? p.dyn * 0.55 : p.dyn * 0.95), 0.04);
}
writeFileSync(
  path.join(ROOT, "fantasycalc-dynasty-1qb.json"),
  JSON.stringify([...fcEntries("dyn1"), ...fcPicks], null, 2)
);

// --- DynastyProcess (parsed shape of values.csv + db_playerids.csv). A few
// players are missing from the id crosswalk to exercise the name fallback. ---
const dpPlayers = allPlayers
  .filter((p) => p.dyn > 1500 || rand() > 0.3)
  .map((p) => ({
    name: p.name,
    position: p.pos,
    team: p.team,
    fpId: `fp${p.id}`,
    value1qb: jitter(Math.round((p.pos === "QB" ? p.dyn * 0.5 : p.dyn * 0.9) * 0.95), 0.08),
    value2qb: jitter(Math.round(p.dyn * 0.95), 0.08),
  }));
const dpPicks = [];
for (let slot = 1; slot <= 10; slot++) {
  for (const round of [1, 2, 3, 4]) {
    const bucket = slot <= 3 ? 0 : slot <= 7 ? 1 : 2;
    const v = jitter(Math.round(PICK_CURVE[round][bucket] * (1.08 - slot * 0.015)), 0.03);
    dpPicks.push({ name: `${y1} Pick ${round}.${String(slot).padStart(2, "0")}`, value1qb: Math.round(v * 0.9), value2qb: v });
  }
}
for (const yearsOut of [2, 3]) {
  const season = String(parseInt(SEASON) + yearsOut);
  for (const round of [1, 2, 3, 4]) {
    ["Early", "Mid", "Late"].forEach((bucket, bi) => {
      const v = jitter(Math.round(PICK_CURVE[round][bi] * Math.pow(0.88, yearsOut - 1)), 0.03);
      dpPicks.push({ name: `${season} ${bucket} ${["1st", "2nd", "3rd", "4th"][round - 1]}`, value1qb: Math.round(v * 0.9), value2qb: v });
    });
  }
}
writeFileSync(path.join(ROOT, "dp-values.json"), JSON.stringify({ players: dpPlayers, picks: dpPicks }, null, 2));
const dpIds = {};
dpPlayers.forEach((p, i) => {
  if (i % 17 !== 5) dpIds[p.fpId] = p.fpId.slice(2);
});
// dpIds feeds the id crosswalk written with the edge fixtures below.


// --- Edge engine sources (nflverse, FantasyPros weekly, Sleeper ownership,
// ESPN news). Scenarios baked in: James Cook goes down so his FA backup Ray
// Davis is "next man up"; Chris Godwin's absence lifts Jalen McMillan's snaps;
// Rashid Shaheed is a low-owned target-share riser; Garrett Wilson is a
// buy-low (volume without points); my dynasty WR1 is running TD-hot. ---
const byName = Object.fromEntries(allPlayers.map((p) => [p.name, p]));
byName["James Cook"].injury = "Out";
byName["James Cook"].bodyPart = "Ankle";
byName["Rashee Rice"].bodyPart = "Knee";
byName["Chris Godwin"].bodyPart = "Fibula";

// Depth charts: order within team+position by redraft value.
const depthGroups = {};
for (const p of allPlayers) (depthGroups[`${p.team}:${p.pos}`] ??= []).push(p);
for (const list of Object.values(depthGroups)) {
  list.sort((a, b) => b.red - a.red).forEach((p, i) => { p.depth = i + 1; });
}
// Rewrite the player database with depth charts and the new injury.
for (const p of allPlayers) {
  Object.assign(playersMap[p.id], {
    injury_status: p.injury === "IR" ? "Out" : p.injury,
    status: p.injury === "IR" ? "Inactive" : "Active",
    depth_chart_order: p.depth,
    depth_chart_position: p.pos,
    injury_body_part: p.bodyPart ?? null,
    news_updated: null,
  });
}
writeFileSync(path.join(ROOT, "players-subset.json"), JSON.stringify(playersMap, null, 2));
for (const row of weekProjections) {
  if (row.player_id === byName["James Cook"].id) row.stats.pts_ppr = 0;
  if (row.player_id === byName["Ray Davis"].id) row.stats.pts_ppr = 14.6;
}
writeFileSync(path.join(ROOT, "projections-week.json"), JSON.stringify(weekProjections, null, 2));

// Schedule: all 32 teams, weeks 1-18, byes from the bye map.
const ALL_TEAMS = ["ARI","ATL","BAL","BUF","CAR","CHI","CIN","CLE","DAL","DEN","DET","GB","HOU","IND","JAX","KC","LAC","LAR","LV","MIA","MIN","NE","NO","NYG","NYJ","PHI","PIT","SEA","SF","TB","TEN","WAS"];
const BYES = { KC: 5, CAR: 5, CIN: 6, DET: 6, MIA: 6, MIN: 6, BUF: 7, JAX: 7, LAC: 7, WAS: 7, HOU: 8, NO: 8, NYG: 8, SF: 8, PIT: 9, TEN: 9, CHI: 10, DEN: 10, PHI: 10, TB: 10, ATL: 11, CLE: 11, GB: 11, LAR: 11, NE: 11, SEA: 11, BAL: 13, IND: 13, LV: 13, NYJ: 13, ARI: 14, DAL: 14 };
const sunday = (w) => new Date(Date.UTC(2025, 8, 7 + 7 * (w - 1)));
const ymd = (d) => d.toISOString().slice(0, 10);
const schedule = [];
const oppOf = {}; // `${week}:${team}` -> opponent
for (let w = 1; w <= 18; w++) {
  const teams = ALL_TEAMS.filter((t) => BYES[t] !== w);
  for (let i = teams.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [teams[i], teams[j]] = [teams[j], teams[i]];
  }
  for (let g = 0; g + 1 < teams.length; g += 2) {
    const [away, home] = [teams[g], teams[g + 1]];
    const sun = sunday(w);
    const slot = g === 0 ? [-3, "20:15"] : g === teams.length - 2 ? [1, "20:15"] : g === teams.length - 4 ? [0, "20:20"] : g % 6 === 2 ? [0, "16:25"] : [0, "13:00"];
    const day = new Date(sun.getTime() + slot[0] * 86400000);
    const spread = Math.round((rand() * 2 - 1) * 9 * 2) / 2;
    const total = 38 + Math.round(rand() * 28) / 2;
    const played = w < WEEK;
    schedule.push({
      gameId: `${SEASON}_${String(w).padStart(2, "0")}_${away}_${home}`,
      week: w,
      kickoff: `${ymd(day)}T${slot[1]}`,
      away, home,
      awayScore: played ? Math.round((total - spread) / 2 + (rand() - 0.5) * 14) : null,
      homeScore: played ? Math.round((total + spread) / 2 + (rand() - 0.5) * 14) : null,
      spread, total,
    });
    oppOf[`${w}:${away}`] = home;
    oppOf[`${w}:${home}`] = away;
  }
}
writeFileSync(path.join(ROOT, "schedule.json"), JSON.stringify(schedule, null, 2));

// Weekly usage (nflverse shape), weeks 1..WEEK-1.
const myDynastyRoster = distribute("dyn", dynastyOrder)[0];
const hotHand = myDynastyRoster.filter((p) => p.pos === "WR").sort((a, b) => b.dyn - a.dyn)[0];
const ROLE = {
  QB: [{ att: 34, car: 4, snap: 0.99 }, { att: 0, car: 0, snap: 0.02 }],
  RB: [{ car: 16, tgt: 3.5, snap: 0.66 }, { car: 7, tgt: 2, snap: 0.36 }, { car: 2, tgt: 1, snap: 0.12 }],
  WR: [{ tgt: 8.5, snap: 0.9 }, { tgt: 6.5, snap: 0.84 }, { tgt: 4.5, snap: 0.7 }, { tgt: 2.5, snap: 0.42 }],
  TE: [{ tgt: 5.5, snap: 0.82 }, { tgt: 2, snap: 0.4 }],
};
const absent = (p, w) => (p.injury === "IR" && w >= 5) || (p.injury === "Out" && w >= 8);
const weekly = [];
const snapRows = [];
for (let w = 1; w < WEEK; w++) {
  for (const p of allPlayers) {
    if (!oppOf[`${w}:${p.team}`] || absent(p, w)) continue;
    const group = depthGroups[`${p.team}:${p.pos}`];
    // Injured teammates ahead of him bump him up the depth chart.
    const ahead = group.filter((t) => t.depth < p.depth && !absent(t, w)).length;
    let role = ROLE[p.pos][Math.min(ahead, ROLE[p.pos].length - 1)];
    const boost = 1 + (p.red - 3000) / 20000;
    let tgt = Math.max(0, (role.tgt ?? 0) * boost + (rand() - 0.5) * 3);
    let car = Math.max(0, (role.car ?? 0) * boost + (rand() - 0.5) * 4);
    let snap = Math.min(1, Math.max(0.05, role.snap + (rand() - 0.5) * 0.1));
    const att = Math.max(0, (role.att ?? 0) + (rand() - 0.5) * 8);
    if (p.name === "Rashid Shaheed" && w >= WEEK - 2) { tgt = 9 + rand() * 2; snap = 0.86; }
    if (p.name === "Garrett Wilson") tgt = 10.5 + rand() * 2;
    const catchRate = p.pos === "RB" ? 0.78 : p.pos === "TE" ? 0.7 : 0.64;
    const rec = Math.round(tgt * catchRate);
    const eff = p.name === "Garrett Wilson" ? 0.55 : 1;
    const recYds = Math.round(rec * (p.pos === "RB" ? 7.5 : 11.5) * eff * (0.8 + rand() * 0.4));
    const rushYds = Math.round(car * (p.pos === "QB" ? 5.5 : 4.3) * (0.7 + rand() * 0.6));
    const tdRoll = (chance) => (rand() < chance ? 1 : 0);
    let recTd = tdRoll(tgt * 0.045 * eff);
    if (p === hotHand) recTd = 1 + tdRoll(0.6);
    const rushTd = tdRoll(car * 0.03);
    const passYds = Math.round(att * 7.1 * (0.85 + rand() * 0.3));
    const passTd = att ? Math.round(att * 0.045 + (rand() - 0.5) * 2) : 0;
    const passInt = att ? tdRoll(0.6) : 0;
    const ppr = rec + recYds / 10 + 6 * recTd + rushYds / 10 + 6 * rushTd + passYds / 25 + 4 * Math.max(0, passTd) - 2 * passInt;
    const ts = tgt / 34;
    weekly.push({
      gsisId: `00-${p.id}`, name: p.name, position: p.pos, team: p.team, opponent: oppOf[`${w}:${p.team}`], week: w,
      passAtt: Math.round(att), passYds, passTd: Math.max(0, passTd), passInt,
      carries: Math.round(car), rushYds, rushTd,
      targets: Math.round(tgt), receptions: rec, recYds, recTd,
      airYards: Math.round(tgt * 8.5), targetShare: Math.round(ts * 1000) / 1000,
      airYardsShare: Math.round(ts * 1.05 * 1000) / 1000, wopr: Math.round((1.5 * ts + 0.7 * ts * 1.05) * 1000) / 1000,
      pprPoints: Math.round(ppr * 10) / 10,
    });
    snapRows.push({ pfrId: `PFR${p.id}`, name: p.name, position: p.pos, team: p.team, week: w, offensePct: Math.round(snap * 100) / 100 });
  }
}
writeFileSync(path.join(ROOT, "nflverse-weekly.json"), JSON.stringify(weekly));
writeFileSync(path.join(ROOT, "nflverse-snaps.json"), JSON.stringify(snapRows));

writeFileSync(
  path.join(ROOT, "nflverse-injuries.json"),
  JSON.stringify(
    [
      ["James Cook", "Out", "Ankle", "Did Not Participate In Practice"],
      ["Chris Godwin", "Out", "Fibula", "Did Not Participate In Practice"],
      ["Rashee Rice", "Questionable", "Knee", "Limited Participation in Practice"],
    ].map(([name, status, injury, practice]) => ({
      gsisId: `00-${byName[name].id}`, name, team: byName[name].team, week: WEEK, status, injury, practice,
    })),
    null,
    2
  )
);

// Id crosswalk (DynastyProcess db_playerids shape): a few players are left
// out of each map to exercise the name fallback.
const crosswalk = { fp: dpIds, gsis: {}, pfr: {}, espn: {} };
allPlayers.forEach((p, i) => {
  if (i % 23 !== 7) crosswalk.gsis[`00-${p.id}`] = p.id;
  if (i % 19 !== 3) crosswalk.pfr[`PFR${p.id}`] = p.id;
  crosswalk.espn[`e${p.id}`] = p.id;
});
writeFileSync(path.join(ROOT, "id-crosswalk.json"), JSON.stringify(crosswalk, null, 2));

// FantasyPros weekly ECR: positional ranks from this week's projections, jittered.
const projById = Object.fromEntries(weekProjections.map((r) => [r.player_id, r.stats.pts_ppr]));
const fpWeekly = [];
for (const pos of ["QB", "RB", "WR", "TE"]) {
  allPlayers
    .filter((p) => p.pos === pos && !(p.injury === "IR" || p.injury === "Out"))
    .map((p) => ({ p, score: projById[p.id] * (0.85 + rand() * 0.3) }))
    .sort((a, b) => b.score - a.score)
    .forEach(({ p, score }, i) => {
      const sd = Math.round((0.5 + rand() * 4) * 100) / 100;
      const grades = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D", "F"];
      fpWeekly.push({
        fpId: `fp${p.id}`, name: p.name, position: pos, team: p.team, rank: i + 1,
        best: Math.max(1, i + 1 - Math.round(sd * 2)), worst: i + 1 + Math.round(sd * 2), sd,
        grade: grades[Math.min(grades.length - 1, Math.floor(i / 3))],
        projection: Math.round(score * 10) / 10, scrapeDate: "2025-11-04",
      });
    });
}
writeFileSync(path.join(ROOT, "fp-weekly.json"), JSON.stringify(fpWeekly, null, 2));

// Sleeper ownership / start rates.
const ownership = {};
for (const p of allPlayers) {
  const owned = Math.min(99.9, Math.round((p.red / 75 + rand() * 10) * 10) / 10);
  ownership[p.id] = { owned, started: Math.round(owned * (p.depth === 1 ? 0.8 : 0.3) * 10) / 10 };
}
ownership[byName["Rashid Shaheed"].id] = { owned: 17.5, started: 4.1 };
ownership[byName["Ray Davis"].id] = { owned: 31.2, started: 12.8 };
writeFileSync(path.join(ROOT, "ownership.json"), JSON.stringify(ownership, null, 2));

// ESPN news (parsed shape), published the day before the pinned "now".
writeFileSync(
  path.join(ROOT, "espn-news.json"),
  JSON.stringify(
    [
      ["James Cook", "Bills' James Cook ruled out with ankle sprain; Ray Davis in line for lead role"],
      ["Ray Davis", "Ray Davis set for bell-cow work with Cook sidelined"],
      ["Rashid Shaheed", "Shaheed's role growing: 20 targets over the last two weeks"],
      ["Rashee Rice", "Rashee Rice limited in practice with knee soreness"],
    ].map(([name, headline], i) => ({
      headline,
      description: headline,
      published: `2025-11-03T${String(14 + i).padStart(2, "0")}:00:00Z`,
      url: null,
      espnIds: [`e${byName[name].id}`],
    })),
    null,
    2
  )
);

// --- DynastyTradeValues (parsed shape; name-keyed, 1QB + superflex, picks).
// A couple of name variants exercise the name matching. ---
const DTV_NAME_VARIANTS = { "Kenneth Walker III": "Kenneth Walker", "Brian Robinson Jr.": "Brian Robinson" };
const dtvRows = allPlayers
  .filter((p) => p.dyn > 1400 || rand() > 0.4)
  .map((p) => ({
    p,
    oneQb: Math.min(10000, jitter(Math.round(p.pos === "QB" ? p.dyn * 0.6 : p.dyn * 0.93), 0.07)),
    sf: Math.min(10000, jitter(Math.round(p.dyn * 0.97), 0.07)),
  }));
for (const [format, key] of [["1qb", "oneQb"], ["sf", "sf"]]) {
  writeFileSync(
    path.join(ROOT, `dtv-${format}.json`),
    JSON.stringify(
      {
        players: dtvRows
          .map((r) => ({ name: DTV_NAME_VARIANTS[r.p.name] ?? r.p.name, position: r.p.pos, team: r.p.team, value: r[key] }))
          .sort((a, b) => b.value - a.value),
        format,
        generatedAt: "2025-11-01 12:00:00",
      },
      null,
      2
    )
  );
}
const dtvPicks = [];
for (const round of [1, 2, 3]) {
  for (let slot = 1; slot <= 12; slot++) {
    const bucket = slot <= 4 ? 0 : slot <= 8 ? 1 : 2;
    dtvPicks.push({
      name: `${String(parseInt(SEASON) + 1)} Pick ${round}.${String(slot).padStart(2, "0")}`,
      value: Math.round(PICK_CURVE[round][bucket] * (1.12 - slot * 0.02)),
    });
  }
}
writeFileSync(path.join(ROOT, "dtv-picks.json"), JSON.stringify(dtvPicks, null, 2));

console.log(`Generated fixtures for ${allPlayers.length} players (${faPlayers.length} free agents) in ${ROOT}`);
