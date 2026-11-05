// Standings + bracket engine. Pure functions; used by the page and by tests.
// Ranking within a 2004 conference, in order:
//   1) 2004-conference record  2) head-to-head among tied teams
//   3) current-conference record  4) overall record
//   5) point differential in 2004-conference games

const pct = (w, l) => (w + l ? w / (w + l) : 0.5);

export function computeRecords(teamsFile, gameData, week) {
  const confOf = {};
  for (const t of teamsFile.teams) confOf[t.name] = t.conf;
  const cur = {};
  for (const [n, m] of Object.entries(gameData.teams || {})) cur[n] = m.curConf;

  const R = {};
  for (const t of teamsFile.teams) {
    R[t.name] = {
      name: t.name, conf: t.conf, helmet: t.helmet, slotted: t.slotted,
      ow: 0, ol: 0, cw: 0, cl: 0, tw: 0, tl: 0, pd: 0, h2h: {},
    };
  }
  for (const g of gameData.games) {
    if (!g.final || g.week > week) continue;
    const a = R[g.home], b = R[g.away];
    if (!a || !b) continue;
    const diff = g.hs - g.as;
    if (diff === 0) continue;
    const [win, lose] = diff > 0 ? [a, b] : [b, a];
    win.tw++; lose.tl++;
    const sameCur = cur[a.name] && cur[a.name] === cur[b.name];
    if (sameCur) { win.cw++; lose.cl++; }
    if (a.conf === b.conf && a.conf !== "Independent") {
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
        // h2h stores net wins; count games from sign (approximation exact for single meetings)
        if (net > 0) w += net; else if (net < 0) l += -net;
      }
      h[t.name] = pct(w, l);
    }
    keyFn = (t) => h[t.name];
  }
  const sorted = [...teams].sort((a, b) => keyFn(b) - keyFn(a));
  return groupBy(sorted, keyFn).flatMap((g) => rank(g, stage + 1));
}

export function standings(teamsFile, gameData, week) {
  const R = computeRecords(teamsFile, gameData, week);
  const out = {};
  const confs = [...teamsFile.tier1, ...teamsFile.tier2, "Independent"];
  for (const c of confs) {
    const members = Object.values(R).filter((t) => t.conf === c);
    const ranked = c === "Independent"
      ? members.sort((a, b) => a.name.localeCompare(b.name))
      : rank(members.sort((a, b) => a.name.localeCompare(b.name)));
    out[c] = ranked;
  }
  return out;
}

const seedCmp = (a, b) =>
  pct(b.ow, b.ol) - pct(a.ow, a.ol) ||
  pct(b.cw, b.cl) - pct(a.cw, a.cl) ||
  pct(b.tw, b.tl) - pct(a.tw, a.tl) ||
  b.pd - a.pd ||
  a.name.localeCompare(b.name);

export function qualifiers(stand, confList) {
  const q = [];
  for (const c of confList) q.push(...stand[c].slice(0, 2).map((t) => ({ ...t, confRank: stand[c].indexOf(t) + 1 })));
  return q.sort(seedCmp).map((t, i) => ({ ...t, seed: i + 1 }));
}

// Bracket shape. Rows = 4 quarterfinal lanes. "s" = seed, "w" = winner of a match id.
export function bracketShape(n) {
  if (n === 12) {
    return {
      r1: [{ id: "A", row: 1, a: 8, b: 9 }, { id: "B", row: 2, a: 5, b: 12 }, { id: "C", row: 3, a: 6, b: 11 }, { id: "D", row: 4, a: 7, b: 10 }],
      qf: [{ id: "E", row: 1, a: 1, b: "A" }, { id: "F", row: 2, a: 4, b: "B" }, { id: "G", row: 3, a: 3, b: "C" }, { id: "H", row: 4, a: 2, b: "D" }],
    };
  }
  return { // 10 teams: seeds 1-6 receive byes
    r1: [{ id: "A", row: 1, a: 8, b: 9 }, { id: "D", row: 4, a: 7, b: 10 }],
    qf: [{ id: "E", row: 1, a: 1, b: "A" }, { id: "F", row: 2, a: 4, b: 5 }, { id: "G", row: 3, a: 3, b: 6 }, { id: "H", row: 4, a: 2, b: "D" }],
  };
}
