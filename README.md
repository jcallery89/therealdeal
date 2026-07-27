# League HQ — Sleeper Fantasy Manager

A web app for managing two Sleeper fantasy football leagues:

- **The Real Deal** — 10-team Keeper, PPR + TE Premium (league `1377306985065619456`)
- **Dynasty League** — 10-team Dynasty Superflex, PPR + TEP (league `1315718697288990720`)

Rosters sync live from the Sleeper API; market values come from FantasyCalc and
KeepTradeCut. No API keys are needed — every data source is free and read-only.

## Features

- **Roster dashboard** — starters/bench/taxi/IR with market values, positional
  strength vs the league, value-weighted age profile, injury/trending/bye badges,
  and bye-week cluster warnings. View any of the 10 teams.
- **Trade analyzer** — build a trade from players *and* draft picks, with
  format-appropriate values (dynasty SF vs redraft), a consolidation adjustment
  (2-for-1s favor the star side), value-source toggle (FantasyCalc / KeepTradeCut /
  blend), and roster-fit notes: positional holes, age shift, contend/rebuild
  alignment.
- **Strategy page** — all 10 teams ranked by total value (players + pick capital),
  a win-now vs future scatter, contender/push/retool/rebuild posture scores,
  full draft-pick inventory grid (traded picks tracked), and a rookie watchlist
  with free agents highlighted.
- **Cutdown planner** — recommends who to keep, taxi, and cut before the
  roster deadline. Rules (keeper count, taxi slots, taxi eligibility by years
  of experience, deadline) are editable in-app and persist per league; IR
  players count against keeper slots; manual Keep/Taxi/Cut pins re-optimize
  around your choices.
- **Start/Sit & matchups** — weekly lineup optimizer scored with your league's
  actual scoring settings (TE premium included), start/sit recommendations vs
  your current lineup, this week's matchup preview with projected totals, and
  a waiver watch of trending unrostered players. Projections come from
  Sleeper's best-effort feed and degrade gracefully out of season.

## Running it

```bash
npm install
npm run dev        # live mode — real Sleeper/FantasyCalc/KTC data
```

Open http://localhost:3000, enter your Sleeper username once, and the app finds
your teams in both leagues (stored in localStorage only).

Deploy: push to GitHub and import into [Vercel](https://vercel.com) — no
environment variables required.

### Demo / offline mode

```bash
SLEEPER_FIXTURES=1 npm run dev
```

Serves a committed 120-player sample world instead of live APIs (an amber banner
marks demo data). Useful for development without network access and for the
Playwright suite. Regenerate the sample data with `npm run fixtures`. Without
the env var the app is always live — `.env` files are gitignored, so a fresh
clone starts in live mode.

If a live source fails at runtime (e.g. the KeepTradeCut page changes), the app
degrades to cached data, then fixtures — with a visible banner, never a blank
page.

## Data sources

| Source | What | How |
|---|---|---|
| [Sleeper API](https://docs.sleeper.com) | leagues, rosters, users, traded picks, trending, player db | public JSON API, no key |
| [FantasyCalc](https://fantasycalc.com) | market trade values (dynasty SF + redraft), draft pick values | public JSON API, joined via `sleeperId` |
| [KeepTradeCut](https://keeptradecut.com) | crowdsourced dynasty values (1QB + SF) | server-side scrape of their rankings page, name-matched |

Values for TEs get a small TE-premium multiplier (both leagues are TEP);
see `src/lib/config.ts`.

## Seasonal maintenance

- **Bye weeks**: update `BYE_WEEKS` in `src/lib/config.ts` when the NFL schedule
  drops each spring.
- **KTC name aliases**: if `/api/values` reports `ktcUnmatched` players, add
  aliases to `src/lib/players/normalize.ts`.

## Development

```bash
npm test           # vitest unit tests (name matching, trade math, picks, KTC parser)
npm run e2e        # Playwright smoke suite (runs the app in fixture mode)
npm run build      # production build + typecheck
```

Architecture notes: all external HTTP happens server-side (`src/lib/*`) behind
`fetchWithFixture()` (fixture mode → memory cache → live → stale → fixture);
client components receive one serializable `LeagueBundle` per page. The
in-memory cache (`src/lib/cache.ts`) is the seam for adding Redis/KV or a
database later.
