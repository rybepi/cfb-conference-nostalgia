# CFB Conference Nostalgia

The current college football season through the 2004 conference map.

- `data/teams.json`: 2004 membership (programs not in FBS in 2004 are flagged `slotted`).
- `scripts/update.mjs`: pulls results from ESPN's public scoreboard feed into `data/games.json`.
- `js/engine.js`: standings, tiebreakers and bracket seeding.
- `.github/workflows/update.yml`: refreshes Sundays 11:00 UTC (6 a.m. EST) and deploys to GitHub Pages.

Playoff: no seeding. Each conference champion plays the runner-up from the next conference in a fixed order; later rounds pair adjacent winners, with a bye for the last slot when a round is odd.

Tiebreakers: 2004-conference record, head-to-head among tied teams, current-conference record, overall record, 2004-conference point differential.
Helmets: The Helmet Project (nationalchamps.net/Helmet_Project), non-commercial use.
