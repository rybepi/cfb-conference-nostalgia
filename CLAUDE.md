# CFB Conference Nostalgia: notes for AI agents

Single-page static site. Replays the current college football season through the 2004 conference map ("Nostalgia" mode) or today's conferences ("Current" mode), with a projected playoff bracket on top and conference standings below. Hosted on GitHub Pages at https://rybepi.github.io/cfb-conference-nostalgia/. Owner: Ryan Pickett.

## Working rules from the owner
- Non-trivial builds need a short PRD and explicit sign-off first. Small, reversible edits can proceed; say what changed.
- No em dashes and no emoji in anything written for the owner or the page copy.
- Test UI changes at phone width (about 390 to 412 px) and desktop before pushing. The owner checks on a Pixel in Brave.

## Layout
- `index.html`: the whole UI (inline CSS and JS). `__V__` placeholders are replaced with a timestamp at deploy time for cache busting; never remove them.
- `js/engine.js`: pure functions. `computeRecords`, `standings(teamsFile, gameData, week, mode)`, `buildBracket(groups)`, `curConfOf`, `POWER_CUR`, `CUR_NAMES`.
- `data/teams.json`: 138 teams with their 2004 conference (`conf`), helmet file, `slotted` flag for programs placed in the nearest conference, optional `curOverride` (ESPN conference id) for Notre Dame and UConn. Also `tier1` and `tier2`, the lists of 2004 conferences in each tier.
- `data/games.json`, `data/unmatched.json`: written by the bot. Do not hand-edit.
- `scripts/update.mjs`: pulls ESPN's public scoreboard for weeks 0 to 16. Season is derived from the date (July onward means this year, else last year; `SEASON` env overrides). Name matching uses only `location` and `shortDisplayName` plus an alias map, with a collision guard. Do not reintroduce word-stripping fallbacks: FCS names such as "Texas Southern" then collapse onto FBS teams.
- `.github/workflows/update.yml`: runs on cron Sundays 11:00 UTC, manual dispatch, and every push to main. It runs the script, commits data, stamps `__V__`, deploys to Pages.
- `helmets/*.gif`: from The Helmet Project (non-commercial use; credited in the footer).

## Rules the page implements
- Ranking inside a conference uses only conference games. Order: conference record, head-to-head among tied teams, current-conference record (Nostalgia mode only), overall record, point differential in conference games. The Overall column counts every game, including non-conference and FCS opponents.
- Playoff: top two per conference, no seeding. Each champion plays the runner-up from the next conference in a fixed order (node i: group i champion vs group i+1 runner-up, wrapping). Later rounds pair adjacent winners. If a round is odd, the last slot gets a bye (positional, flagged on the page).
- Nostalgia: Tier 1 = ACC, Big East, Big Ten, Big 12, Pac-10, SEC (12 teams). Tier 2 = C-USA, MAC, MWC, Sun Belt, WAC (10). Current: Tier 1 = ACC, Big 12, Big Ten, SEC (8). Tier 2 = American, C-USA, MAC, Mountain West, Pac-12, Sun Belt (12). Labels are "Tier 1" and "Tier 2" (the word "Power" was removed).

## UI behavior to preserve
- Header: title "CFB Conference <Nostalgia|Current>" with an info icon (`#whatbtn`) that opens the About dialog. The dialog has three generated sections: Nostalgia vs. Current, How standings work (text depends on mode), An unbiased playoff. It reads the season from `gameData.season`; never hardcode a year.
- Sticky controls bar, one row on phones: Nostalgia/Current switch, trophy and numbered-list icons that jump to `#playoff` and `#standings` (the one for the section in view is highlighted by the scroll spy), favorite-team button (star plus short code, native select overlaid), light/dark toggle at the far right. There is no week dropdown and no share button; the page always shows the current week. `#w=<week>` in the URL still loads a past week.
- Section headings: "Unbiased Playoff Bracket" and "Standings". Standings tables scroll horizontally on phones with the Team column pinned.
- Clicking a team opens a schedule dialog (home/away/neutral, scores). It uses dynamic viewport height (`dvh`) and hides the Wk column on phones; keep it fully visible on Android.
- URL hash: `#m=now` (omitted for Nostalgia), `#t=<favorite>`, `#s=<team schedule>`, optional `#w=<week>`. localStorage keys: `cfb.fav`, `cfb.mode`, `cfb.theme`; every access is wrapped in try/catch.
- Team short codes come from ESPN `abbreviation` (stored as `abbr` in games.json); until data refreshes a guess is derived from the name.

## Verify before shipping
`node --check scripts/update.mjs`, serve the folder locally and load with Playwright at 390 and 1100 px wide, check there are no page errors and no horizontal page scroll. Git pushes can fail transiently with a GitHub "commit_refs" error; retry after a few minutes.
