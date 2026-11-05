// Pulls the current season's FBS results from ESPN's public scoreboard feed
// and writes data/games.json. Runs in GitHub Actions (Node 20+, global fetch).
import { readFileSync, writeFileSync } from "node:fs";

const SEASON = Number(process.env.SEASON || 2026);
const BASE = "https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard";

const teamsFile = JSON.parse(readFileSync(new URL("../data/teams.json", import.meta.url)));
const norm = (s) =>
  String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

// ESPN name variants -> our display name
const ALIASES = {
  "miami": "Miami", "miamifl": "Miami", "miamihurricanes": "Miami",
  "miamioh": "Miami (OH)", "miamiohio": "Miami (OH)", "miamiredhawks": "Miami (OH)",
  "pitt": "Pittsburgh", "uconn": "UConn", "connecticut": "UConn",
  "umass": "UMass", "massachusetts": "UMass",
  "olemiss": "Ole Miss", "mississippi": "Ole Miss",
  "ulmonroe": "UL Monroe", "louisianamonroe": "UL Monroe", "ulm": "UL Monroe",
  "louisianalafayette": "Louisiana", "ullafayette": "Louisiana",
  "appstate": "App State", "appalachianstate": "App State",
  "fiu": "FIU", "floridainternational": "FIU",
  "southernmiss": "Southern Miss", "southernmississippi": "Southern Miss",
  "hawaii": "Hawai'i", "sanjosestate": "San José State",
  "nc state": "NC State", "ncstate": "NC State", "northcarolinastate": "NC State",
  "usc": "USC", "southerncalifornia": "USC", "southernmethodist": "SMU",
  "texaschristian": "TCU", "centralflorida": "UCF", "alabamabirmingham": "UAB",
  "westernkentucky": "Western Kentucky", "sacramentostate": "Sacramento State",
  "sacstate": "Sacramento State", "jamesmadison": "James Madison",
  "sanjose": "San José State", "texasam": "Texas A&M", "texasaandm": "Texas A&M",
};
const byNorm = new Map();
for (const t of teamsFile.teams) byNorm.set(norm(t.name), t.name);
for (const [k, v] of Object.entries(ALIASES)) byNorm.set(norm(k), v);

function match(team) {
  // Exact school-name matches only. Never strip words: "Texas Southern" or
  // "Alabama A&M" would otherwise collapse onto "Texas" or "Alabama".
  for (const c of [team.location, team.shortDisplayName]) {
    const hit = byNorm.get(norm(c));
    if (hit) return hit;
  }
  return null;
}

async function getWeek(week) {
  const url = `${BASE}?groups=80&limit=400&seasontype=2&week=${week}&dates=${SEASON}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "cfb-conference-nostalgia" } });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } catch (e) {
      if (attempt === 3) throw new Error(`week ${week}: ${e.message}`);
      await new Promise((res) => setTimeout(res, 1500 * attempt));
    }
  }
}

const games = new Map();
const teamMeta = {};
const unmatched = new Map(); // ESPN name -> count (FBS-tagged teams we don't know)
let weeksSeen = [];

for (let w = 0; w <= 16; w++) {
  let data;
  try { data = await getWeek(w); } catch (e) { console.warn(e.message); continue; }
  const events = data.events || [];
  if (events.length) weeksSeen.push(w);
  for (const ev of events) {
    const comp = (ev.competitions || [])[0];
    if (!comp || !comp.competitors || comp.competitors.length !== 2) continue;
    const completed = !!(comp.status || ev.status)?.type?.completed;
    const sides = {};
    let ok = true;
    for (const c of comp.competitors) {
      const name = match(c.team || {});
      if (!name) {
        unmatched.set(c.team?.displayName || "?", (unmatched.get(c.team?.displayName || "?") || 0) + 1);
        ok = false; continue;
      }
      if (teamMeta[name] && teamMeta[name].espnId !== c.team.id) {
        console.warn(`COLLISION: "${c.team.displayName}" (id ${c.team.id}) also maps to ${name} (id ${teamMeta[name].espnId}); skipping`);
        unmatched.set(c.team.displayName, (unmatched.get(c.team.displayName) || 0) + 1);
        ok = false; continue;
      }
      sides[c.homeAway] = { name, score: Number(c.score ?? 0) };
      teamMeta[name] = {
        espnId: c.team.id,
        curConf: String(c.team.conferenceId ?? ""),
        color: c.team.color ? "#" + c.team.color : null,
        alt: c.team.alternateColor ? "#" + c.team.alternateColor : null,
      };
    }
    if (!ok || !sides.home || !sides.away) continue; // FCS opponent or unknown team
    games.set(ev.id, {
      id: ev.id,
      week: ev.week?.number ?? w,
      date: ev.date,
      home: sides.home.name, away: sides.away.name,
      hs: sides.home.score, as: sides.away.score,
      final: completed,
      neutral: !!comp.neutralSite,
    });
  }
}

const list = [...games.values()].sort((a, b) => a.date.localeCompare(b.date));
const out = {
  season: SEASON,
  updated: new Date().toISOString(),
  weeks: [...new Set(list.filter((g) => g.final).map((g) => g.week))].sort((a, b) => a - b),
  teams: teamMeta,
  games: list,
};
writeFileSync(new URL("../data/games.json", import.meta.url), JSON.stringify(out));
writeFileSync(
  new URL("../data/unmatched.json", import.meta.url),
  JSON.stringify([...unmatched.entries()].sort((a, b) => b[1] - a[1]), null, 1)
);
console.log(`games: ${list.length}, final: ${list.filter((g) => g.final).length}, weeks with results: ${out.weeks.join(",")}`);
console.log(`teams matched: ${Object.keys(teamMeta).length}/${teamsFile.teams.length}; unmatched names (mostly FCS): ${unmatched.size}`);
const missing = teamsFile.teams.map((t) => t.name).filter((n) => !teamMeta[n]);
if (missing.length) console.log("Teams in teams.json with no games found (check name aliases):", missing.join(", "));
if (!list.length) { console.error("No games parsed; keeping previous data."); process.exit(1); }
