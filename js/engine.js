// Standings + bracket engine. Pure functions; used by the page and by tests.
// Ranking within a conference, in order:
//   1) conference record (2004 map in "old" mode, current map in "now" mode)
//   2) head-to-head among tied teams
//   3) current-conference record (old mode only; a no-op in now mode)
//   4) overall record
//   5) point differential in conference games

export const CUR_NAMES = {
  "1": "ACC", "4": "Big 12", "5": "Big Ten", "8": "SEC",
  "151": "American", "12": "C-USA", "15": "MAC", "17": "Mountain West", "9": "Pac-12", "37": "Sun Belt",
  "18": "Independents",
};
export const POWER_CUR = ["1", "4", "5", "8"];

const pct = (w, l) => (w + l ? w / (w + l) : 0.5);

export function curConfOf(teamsFile, gameData, name) {
  const t = teamsFile.teams.find((x) => x.name === name);
  return (t && t.curOverride) || gameData.teams?.[name]?.curConf || "";
}

export function computeRecords(teamsFile, gameData, week, mode = "old") {
  const cur = {};
  for (const t of teamsFile.teams) cur[t.name] = t.curOverride || gameData.teams?.[t.name]?.curConf || "";
  const rawCur = {};
  for (const [n, m] of Object.entries(gameData.teams || {})) rawCur[n] = m.curConf;

  const R = {};
  for (const t of teamsFile.teams) {
    R[t.name] = {
      name: t.name, conf: t.conf, cur: cur[t.name], grp: mode === "old" ? t.conf : cur[t.name],
      helmet: t.helmet, slotted: t.slotted && (mode === "old" || !!t.curOverride),
      ow: 0, ol: 0, cw: 0, cl: 0, tw: 0, tl: 0, pd: 0, h2h: {},
    };
  }
  for (const g of gameData.games) {
    if (!g.final || g.week > week) continue;
    const a = R[g.home], b = R[g.away];
    if (!a && !b) continue;
    if (!a || !b) { // one side is an FCS school: counts toward overall record only
      const mine = a ? g.hs - g.as : g.as - g.hs;
      const t = a || b;
      if (mine > 0) t.tw++; else if (mine < 0) t.tl++;
      continue;
    }
    const diff = g.hs - g.as;
    if (diff === 0) continue;
    const [win, lose] = diff > 0 ? [a, b] : [b, a];
    win.tw++; lose.tl++;
    // Secondary record: real current-conference games (old mode tiebreaker #3).
    if (mode === "old" && rawCur[a.name] && rawCur[a.name] === rawCur[b.name] && rawCur[a.name] !== "18") { win.cw++; lose.cl++; }
    if (a.grp && a.grp === b.grp) {
      win.ow++; lose.ol++;
      a.pd += diff; b.pd -= diff;
      win.h2h[lose.name] = (win.h2h[lose.name] || 0) + 1;
      lose.h2h[win.name] = (lose.h2h[win.name] || 0) - 1;
    }
  }
  return R;
}

const keys = [
  (t) => pct(t.ow, t.ol),
  null, // head-to-head, computed within the tied group
  (t) => pct(t.cw, t.cl),
  (t) => pct(t.tw, t.tl),
  (t) => t.pd,
];

function groupBy(sorted, keyFn) {
  const groups = [];
  for (const t of sorted) {
    const k = keyFn(t);
    const last = groups[groups.length - 1];
    if (last && Math.abs(last.k - k) < 1e-9) last.items.push(t);
    else groups.push({ k, items: [t] });
  }
  return groups.map((g) => g.items);
}

function rank(teams, stage = 0) {
  if (teams.length <= 1 || stage >= keys.length) return teams;
  let keyFn = keys[stage];
  if (stage === 1) {
    const names = new Set(teams.map((t) => t.name));
    const h = {};
    for (const t of teams) {
      let w = 0, l = 0;
      for (const [opp, net] of Object.entries(t.h2h)) {
        if (!names.has(opp)) continue;
        if (net > 0) w += net; else if (net < 0) l += -net;
      }
      h[t.name] = pct(w, l);
    }
    keyFn = (t) => h[t.name];
  }
  const sorted = [...teams].sort((a, b) => keyFn(b) - keyFn(a));
  return groupBy(sorted, keyFn).flatMap((g) => rank(g, stage + 1));
}

// Returns { tier1: [{key,label,teams}], tier2: [...] } with each list ranked.
export function standings(teamsFile, gameData, week, mode = "old") {
  const R = computeRecords(teamsFile, gameData, week, mode);
  const all = Object.values(R);
  const build = (key, label) => ({
    key, label,
    teams: rank(all.filter((t) => t.grp === key).sort((a, b) => a.name.localeCompare(b.name))),
  });
  if (mode === "old") {
    return {
      tier1: teamsFile.tier1.map((c) => build(c, c)),
      tier2: teamsFile.tier2.map((c) => build(c, c)),
    };
  }
  const ids = [...new Set(all.map((t) => t.cur).filter(Boolean))];
  const others = ids.filter((id) => !POWER_CUR.includes(id)).sort((a, b) => (CUR_NAMES[a] || a).localeCompare(CUR_NAMES[b] || b));
  return {
    tier1: POWER_CUR.filter((id) => ids.includes(id)).map((id) => build(id, CUR_NAMES[id] || id)),
    tier2: others.map((id) => build(id, CUR_NAMES[id] || id)),
  };
}

// Bracket with no seeding. Conferences are taken in a fixed order (not by record).
// Round 1: each conference champion plays the runner-up of the NEXT conference in that order.
// Later rounds pair adjacent winners in slot order; if a round has an odd number of
// survivors, the last slot gets a bye. Nothing here compares teams across conferences.
export function buildBracket(groups) {
  const k = groups.length;
  const pick = (g, i) => ({ ...g.teams[i], label: g.label, confRank: i + 1 });
  let num = 0;
  let cur = groups.map((g, i) => {
    const n = { id: "r1-" + i, num: ++num, a: pick(g, 0), b: pick(groups[(i + 1) % k], 1), start: i, end: i + 1 };
    n.wl = `Winner of Game ${n.num}`;
    return n;
  });
  const rounds = [cur];
  while (cur.length > 1) {
    const next = [];
    for (let i = 0; i < cur.length; i += 2) {
      const r = rounds.length;
      if (i + 1 < cur.length) {
        const n = { id: `r${r + 1}-${i / 2}`, num: ++num, from: [cur[i], cur[i + 1]], start: cur[i].start, end: cur[i + 1].end };
        n.wl = `Winner of Game ${n.num}`;
        next.push(n);
      } else {
        next.push({ id: `r${r + 1}-${i / 2}`, bye: true, from: [cur[i]], start: cur[i].start, end: cur[i].end, wl: cur[i].wl });
      }
    }
    rounds.push(next);
    cur = next;
  }
  return { rounds, hasBye: rounds.flat().some((n) => n.bye) };
}
