# League HQ — Sleeper Fantasy Manager

A web app for managing two Sleeper fantasy football leagues:

- **The Real Deal** — 10-team Keeper, PPR + TE Premium (league `1377306985065619456`)
- **Dynasty League** — 10-team Dynasty Superflex, PPR + TEP (league `1315718697288990720`)

Rosters sync live from the Sleeper API. Player values are a consensus of
several independent sources — FantasyCalc, DynastyProcess, Dynasty Dealer,
DynastyTradeValues and Sleeper projections. No API keys are needed — every data
source is free, public and read-only.

## Features

- **Edge** — the "leg up" feed. Blends every source below into ranked,
  league-specific edges, each showing the evidence and which sources back it:
  - *Waiver gems*: players unrostered in your league with rising snap share or
    target/carry share, a hurt starter ahead of them on the depth chart
    ("next man up"), accelerating Sleeper adds, low ownership ("sneaky add"),
    soft upcoming or fantasy-playoff schedules, and fit with your thin spots —
    with a drop candidate.
  - *Buy low / sell high*: opportunity-based expected points vs actual points
    (volume without production = buy; touchdown-driven overperformance = sell),
    30-day market moves, dynasty age cliffs, and players the value sources
    disagree on.
  - *Lineup & injury*: starters who are out, doubtful, questionable (with
    practice participation) or on bye, the best bench or waiver replacement,
    and consensus-backed start/sit swaps — only for games not yet kicked off.
  - *Rival intel*: your opponent's injured starters (plus "block" pickups of
    their handcuffs), rivals who just lost a starter at a position where you
    have surplus, and rebuilders holding productive veterans.
  - *Stashes*: free-agent handcuffs for your starting RBs.
- **Roster dashboard** — starters/bench/taxi/IR with market values, positional
  strength vs the league, value-weighted age profile, injury/trending/bye badges,
  and bye-week cluster warnings. View any of the 10 teams.
- **Trade analyzer** — build a trade from players *and* draft picks, with
  format-appropriate values, a consolidation adjustment (2-for-1s favor the
  star side), a value-source toggle (Consensus or any single source), a
  per-source verdict breakdown that shows whether the sources agree, and
  roster-fit notes: positional holes, age shift, contend/rebuild alignment.
- **Strategy page** — all 10 teams ranked by total value (players + pick capital),
  a win-now vs future scatter, contender/push/retool/rebuild posture scores,
  full draft-pick inventory grid (traded picks tracked), and a rookie watchlist
  with free agents highlighted.
- **Trade finder** — scans every opponent for mutually beneficial deals:
  fair value (consolidation-adjusted gap under 12%), complementary positional
  needs, and matching contend/rebuild timelines. One click opens a suggestion
  in the analyzer, pre-filled, for tweaking.
- **Cutdown planner** — recommends who to keep, taxi, and cut before the
  roster deadline. Rules (keeper count, taxi slots, taxi eligibility by years
  of experience, deadline) are editable in-app and persist per league; IR
  players count against keeper slots; manual Keep/Taxi/Cut pins re-optimize
  around your choices. A league cut watch runs the same optimizer on every
  rival roster to surface their likely cuts — flagging the ones that fill
  your needs.
- **Rookie draft board** — the rookie class ranked by market value with
  position ranks and 30-day trends, your pick slots overlaid (official
  Sleeper draft order when set, otherwise estimated from standings), drafted
  players grayed out during live drafts, and your thinnest positions called
  out for BPA-vs-need decisions.
- **Start/Sit & matchups** — weekly lineup optimizer scored with your league's
  actual scoring settings (TE premium included) and driven by a **consensus
  start/sit**: FantasyPros expert rankings (40%), Sleeper projections (35%) and
  the crowd — the share of Sleeper leagues starting each player (25%) — mapped
  onto your league's scoring, with a "split" flag when they disagree; start/sit recommendations vs
  your current lineup (ruled-out players are never started and are flagged if
  they're in your lineup), this week's matchup preview with projected totals,
  and a waiver watch of trending unrostered players. Projections come from
  Sleeper's best-effort feed and degrade gracefully out of season.
- **Players & stats explorer** — every fantasy-relevant player (free agents
  included) with season points and PPG scored under your league's settings,
  this week's projection, market value and positional rank, trend, age, and
  owner. Sortable columns, position/availability filters, and search.
- **Weekly Review** — turns a week's results into a ready-to-paste ChatGPT
  image prompt for a savage-roast recap poster: every matchup with exact
  scores and captions, plus awards (blowout, nail-biter, top dog, basement,
  bench blunder, coaching malpractice, MVP, dud). Attach your team mascot
  images in the listed order and paste the prompt. A matching text recap comes
  in two formats: a short league-chat post and a full newsletter write-up.

Every page has a **Sync** button (sidebar on desktop, top bar on mobile) that
pulls the latest rosters and transactions from Sleeper on demand.

## Running it

```bash
npm install
npm run dev        # live mode — real Sleeper and value-source data
```

Open http://localhost:3000, enter your Sleeper username once, and the app finds
your teams in both leagues (stored in localStorage only).

Deploy: push to GitHub and import into [Vercel](https://vercel.com) — no
environment variables required.

### New season: league renewals

Sleeper gives each league a **new league ID every season** when it renews.
When that happens, set these in Vercel (Project → Settings → Environment
Variables) and redeploy — no code change needed:

| Variable | League |
|---|---|
| `NEXT_PUBLIC_LEAGUE_ID_KEEPER` | The Real Deal |
| `NEXT_PUBLIC_LEAGUE_ID_DYNASTY` | Dynasty League |

### Demo / offline mode

```bash
SLEEPER_FIXTURES=1 npm run dev
```

Serves a committed 132-player sample world (including free agents) instead of
live APIs (an amber banner marks demo data). Useful for development without network access and for the
Playwright suite. Regenerate the sample data with `npm run fixtures`. Without
the env var the app is always live — `.env` files are gitignored, so a fresh
clone starts in live mode.

If a live source fails at runtime, the app never substitutes demo data for your
real league: Sleeper failures fall back to the last cached copy (with a banner)
or an error page with a retry button; value-source failures are silent — the
consensus uses whichever sources responded, and a note appears only if all of
them fail. `/api/health` checks every upstream request live and reports which
one (if any) is failing, with the error and timing.

## Data sources

| Source | What | How |
|---|---|---|
| [Sleeper API](https://docs.sleeper.com) | leagues, rosters, users, traded picks, trending, player db | public JSON API, no key |
| [FantasyCalc](https://fantasycalc.com) | market trade values from real trades (dynasty SF, dynasty 1QB, redraft), draft pick values | public JSON API, joined via `sleeperId` |
| [DynastyProcess](https://github.com/dynastyprocess/data) | dynasty values (1QB + SF) derived from FantasyPros expert rankings, pick values | open CSVs on GitHub, joined via their FantasyPros→Sleeper id crosswalk |
| Sleeper projections | season stats + rest-of-season projections, scored with your league's settings | points per game over replacement at each position |
| [Dynasty Dealer](https://www.dynastydealer.com) | dynasty values from 670k+ real Sleeper trades plus community votes; pick values | free public JSON API, joined via Sleeper id. One (superflex-leaning) value set, so it's used for the superflex Dynasty League only |
| [DynastyTradeValues](https://dynastytradevalues.com) | algorithmic dynasty values from ADP/market data, 1QB and superflex; pick values | free public JSON API, name-matched |
| [FantasyPros](https://www.fantasypros.com) via DynastyProcess | weekly expert consensus rankings (~100 experts: rank, best/worst, grade) | daily CSV mirror on GitHub |
| [nflverse](https://github.com/nflverse) | weekly usage (targets, target share, air yards, WOPR, carries), snap counts, official injury reports with practice status | CSV releases on GitHub, nightly in season |
| [nfldata](https://github.com/nflverse/nfldata) | schedule, spreads and totals (→ implied team totals, byes, kickoffs) | `games.csv` on GitHub |
| Sleeper research | % of Sleeper leagues rostering / starting each player | public JSON (best-effort) |
| ESPN | NFL news headlines tagged with players | public JSON (best-effort) |

Providers' player ids are joined to Sleeper's through DynastyProcess's id
crosswalk (FantasyPros, GSIS, PFR, ESPN) with a name fallback. Every source
beyond Sleeper's league data is optional: if one is down, edges simply use the
others. Open `/api/health` to see each one's status.

*Why not KeepTradeCut?* It has no public API, blocks cloud servers, and its
terms prohibit scraping or reusing its values in other tools, so it was
replaced with Dynasty Dealer and DynastyTradeValues, which publish free APIs.

*Why not Reddit?* Reddit's API requires a registered app since 2023, blocks
most cloud servers (Vercel, GitHub Actions), and its start/sit threads are
free-form comments. The expert consensus plus Sleeper's start rates give the
same "what is everyone doing" signal from structured data.

**Value horizons.** Each source is normalized to 0–10,000 (share of its top
player) so they're comparable; *Consensus* averages whichever sources list the
player.

| League | Horizon | Sources |
|---|---|---|
| Dynasty League | Dynasty (superflex) | FantasyCalc SF, DynastyProcess SF, Dynasty Dealer, DynastyTradeValues SF |
| The Real Deal | This season (default) | FantasyCalc redraft, Sleeper projections |
| The Real Deal | Keeper (Cutdown planner, "keep" column) | FantasyCalc 1QB dynasty, DynastyProcess 1QB, DynastyTradeValues 1QB |

The Real Deal's two horizons are never blended — the trade tools have a
This season / Keeper toggle. TEs get a small TE-premium multiplier (both leagues
are TEP); see `src/lib/config.ts`.

## Phone alerts (ntfy)

The Edge feed is pushed to your phone by a scheduled GitHub Action
(`.github/workflows/alerts.yml`) using [ntfy](https://ntfy.sh) — free, no account.

1. Install the **ntfy** app (iOS / Android) and subscribe to a topic with a
   hard-to-guess name, e.g. `lhq-7f3k9q2m` (anyone who knows the name can read it).
2. In GitHub: **Settings → Secrets and variables → Actions → New repository
   secret**: `NTFY_TOPIC` = that topic name.
3. Optional repository *variables*: `SLEEPER_USERNAME` (default
   `LubeyGolfGloves`), `APP_URL` (default the Vercel URL), and the two
   `NEXT_PUBLIC_LEAGUE_ID_*` ids after your leagues renew.
4. Test it: **Actions → Fantasy alerts → Run workflow** (tick *dry run* to
   print instead of sending).

| When (US Eastern) | Run | What you get |
|---|---|---|
| Tue 9:10pm | waivers | one digest per league: waiver gems, stashes, buy-lows, sell-highs, rival intel |
| Daily 10:05am | daily | any new strong edge, plus lineup emergencies |
| Thu 6:45pm, Sun 12:35pm / 3:50pm / 7:10pm, Mon 6:15pm | gameday | injured, doubtful, questionable or bye starters and consensus lineup swaps for games not yet started |

Each edge is sent once (the sent list lives in the Actions cache), and a
worsening status (Questionable → Out) alerts again. Locally:
`NTFY_TOPIC=… npm run alerts -- --run=daily` (or `--dry-run`). GitHub pauses
scheduled workflows after 60 days without repository activity; re-enable it
from the Actions tab if that happens.

## Seasonal maintenance

- **Bye weeks**: update `BYE_WEEKS` (currently the 2026 schedule) in
  `src/lib/config.ts` when the NFL schedule drops each May.
- **League IDs**: set the two `NEXT_PUBLIC_LEAGUE_ID_*` variables after your
  leagues renew (see above).
- **Name aliases**: DynastyTradeValues (and fallbacks for other sources) match
  players by name; add any nickname mismatches to `src/lib/players/normalize.ts`.
- **Source check**: *Actions → Source check → Run workflow* fetches every value
  source live, joins it to Sleeper exactly like the app, and prints match
  counts and each source's top players.

## Development

```bash
npm test           # vitest unit tests (values, picks, trades, lineups, stats, weekly review…)
npm run e2e        # Playwright smoke suite (runs the app in fixture mode)
npm run build      # production build + typecheck
```

Architecture notes: all external HTTP happens server-side (`src/lib/*`) behind
`fetchWithFixture()` (fixture mode → memory cache → live → stale → fixture);
client components receive one serializable `LeagueBundle` per page. The
in-memory cache (`src/lib/cache.ts`) is the seam for adding Redis/KV or a
database later.
