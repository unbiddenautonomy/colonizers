// Usage: node analyze.cjs out/boards.jsonl [groupRegex]
const fs = require('fs');
const file = process.argv[2];
const rows = fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const groupOf = (r) => r.name.replace(/\|\d+p$/, '');
const groups = {};
for (const r of rows) (groups[groupOf(r)] ??= []).push(r);
const out = [];
let tot = { n: 0, won: 0 };
const allProblems = {}, allUndesc = {}, allBad = {}, outcomes = {};
for (const [g, list] of Object.entries(groups)) {
  const won = list.filter((r) => r.outcome === 'won');
  const bad = list.filter((r) => r.outcome !== 'won');
  tot.n += list.length; tot.won += won.length;
  for (const r of list) {
    outcomes[r.outcome] = (outcomes[r.outcome] || 0) + 1;
    for (const p of r.problems || []) allProblems[p.replace(/\d+/g, '#')] = (allProblems[p.replace(/\d+/g, '#')] || 0) + 1;
    for (const p of r.undescribed || []) allUndesc[p] = (allUndesc[p] || 0) + 1;
    for (const p of r.badText || []) allBad[p.slice(0, 120)] = (allBad[p.slice(0, 120)] || 0) + 1;
  }
  out.push({ g, n: list.length, won: won.length, bad: bad.map((r) => `${r.players}p:${r.outcome}${r.timedOut ? '(time)' : ''}@r${r.rounds}`).join(' '), medRounds: med(won.map((r) => r.rounds)), maxRounds: Math.max(0, ...won.map((r) => r.rounds)), medActions: med(won.map((r) => r.actions)), maxChoose: Math.round(Math.max(...list.map((r) => r.maxChooseMs || 0))), refusals: list.reduce((s, r) => s + (r.refusals || 0), 0), replayBad: list.filter((r) => r.replayOk === false).length });
}
console.log(`${file}: ${tot.n} games, ${tot.won} finished`, JSON.stringify(outcomes));
const filt = process.argv[3] ? new RegExp(process.argv[3]) : null;
for (const o of out.sort((a, b) => (b.n - b.won) / b.n - (a.n - a.won) / a.n || b.medRounds - a.medRounds)) {
  if (filt && !filt.test(o.g)) continue;
  console.log(`${o.g.padEnd(58)} n=${String(o.n).padStart(3)} won=${String(o.won).padStart(3)} rounds med ${String(o.medRounds).padStart(3)} max ${String(o.maxRounds).padStart(3)} | acts ${String(o.medActions).padStart(5)} | think ${String(o.maxChoose).padStart(4)}ms | refused ${o.refusals}${o.replayBad ? ' REPLAY-BAD ' + o.replayBad : ''}${o.bad ? ' | ' + o.bad : ''}`);
}
console.log('problems:', JSON.stringify(allProblems, null, 1));
console.log('events with no log text:', JSON.stringify(allUndesc));
console.log('bad log text:', JSON.stringify(allBad, null, 1));
