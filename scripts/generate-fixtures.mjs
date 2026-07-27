/**
 * Deterministic fixture generator for offline/demo mode.
 *
 * Produces an internally consistent demo world: 120 players (synthetic
 * Sleeper ids) shared by both leagues, distributed across 10 rosters per
 * league, with FantasyCalc-shaped and KTC-shaped value files that reference
 * the same players. Run `node scripts/generate-fixtures.mjs` to regenerate.
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
      matchups.push({
        roster_id: rosterId,
        matchup_id: m,
        points: Math.round((95 + rand() * 65) * 100) / 100,
        starters: r.starters,
        players: r.players,
      });
    }
  }

  const dir = path.join(ROOT, "leagues", leagueId);
  mkdirSync(dir, { recursive: true });
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
for (const p of players) {
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
  const sorted = [...players].sort((a, b) => b[key] - a[key]);
  const posCounts = {};
  return sorted.map((p, i) => {
    posCounts[p.pos] = (posCounts[p.pos] ?? 0) + 1;
    return {
      player: {
        id: 20000 + players.indexOf(p),
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

// --- KTC-shaped fixture (name-keyed; includes deliberate name variants to
// exercise the normalization/alias matching) ---
const KTC_NAME_VARIANTS = {
  "Hollywood Brown": "Marquise Brown",
  "Kenneth Walker III": "Kenneth Walker",
  "Michael Penix Jr.": "Michael Penix",
  "Cam Ward": "Cameron Ward",
  "Brian Robinson Jr.": "Brian Robinson",
};
const ktc = players
  .filter((p) => p.dyn > 1200 || rand() > 0.5) // ~85% coverage
  .map((p) => ({
    playerName: KTC_NAME_VARIANTS[p.name] ?? p.name,
    position: p.pos,
    team: p.team,
    age: p.age,
    oneQBValues: { value: Math.min(9999, jitter(Math.round(p.pos === "QB" ? p.dyn * 0.55 : p.dyn * 0.92), 0.06)) },
    superflexValues: { value: Math.min(9999, jitter(Math.round((p.dyn / 10500) * 9700), 0.05)) },
  }));
writeFileSync(path.join(ROOT, "ktc-playersArray.json"), JSON.stringify(ktc, null, 2));

// --- Trending ---
const byTrend = [...players].sort((a, b) => (b.exp === 0 ? b.dyn : b.dyn * 0.4) - (a.exp === 0 ? a.dyn : a.dyn * 0.4));
writeFileSync(
  path.join(ROOT, "trending-add.json"),
  JSON.stringify(byTrend.slice(0, 15).map((p, i) => ({ player_id: p.id, count: 5200 - i * 300 })), null, 2)
);
const olds = [...players].sort((a, b) => b.age - a.age);
writeFileSync(
  path.join(ROOT, "trending-drop.json"),
  JSON.stringify(olds.slice(0, 15).map((p, i) => ({ player_id: p.id, count: 2100 - i * 120 })), null, 2)
);

// --- Projections (best-effort endpoint fixture) ---
writeFileSync(
  path.join(ROOT, "projections-week.json"),
  JSON.stringify(players.map((p) => ({ player_id: p.id, stats: { pts_ppr: Math.round(p.red / 400 + rand() * 8) } })), null, 2)
);

console.log(`Generated fixtures for ${players.length} players in ${ROOT}`);
