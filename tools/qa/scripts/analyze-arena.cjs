const fs = require('fs');
const specs = require('./specs/arena-lite.json');
const bySeed = Object.fromEntries(specs.map((s) => [s.seed, s]));
const rows = fs.readFileSync(process.argv[2] || 'out/arena-lite.jsonl', 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const groups = {};
for (const r of rows) (groups[r.name] = groups[r.name] || []).push(r);
const pct = (a, b) => (b ? Math.round((100 * a) / b) + '%' : '-');
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
for (const [name, rs] of Object.entries(groups)) {
  const fin = rs.filter((r) => r.outcome === 'finished' || r.winner !== null && r.winner !== undefined);
  console.log(`== ${name}: ${rs.length} games, ${fin.length} finished, outcomes ${JSON.stringify(rs.reduce((m, r) => ((m[r.outcome] = (m[r.outcome] || 0) + 1), m), {}))}, median rounds ${med(fin.map((r) => r.rounds))}, median ms ${med(rs.map((r) => r.ms))}, max choose ms ${Math.max(...rs.map((r) => r.maxChooseMs || 0))}`);
  const key = name === 'arena:levels' || name === 'arena:hard-only' ? 'level' : name === 'arena:styles' ? 'style' : null;
  const stat = {};
  const seat = [0, 0, 0, 0];
  const seatVp = [0, 0, 0, 0];
  for (const r of fin) {
    const spec = bySeed[r.seed];
    if (typeof r.winner === 'number') seat[r.winner]++;
    (r.vp || []).forEach((v, i) => (seatVp[i] += v));
    if (!key || !spec) continue;
    spec.bots.forEach((b, i) => {
      const k = b[key];
      const s = (stat[k] = stat[k] || { seats: 0, wins: 0, vp: 0 });
      s.seats++;
      s.vp += (r.vp || [])[i] || 0;
      if (r.winner === i) s.wins++;
    });
  }
  if (key) for (const [k, s] of Object.entries(stat)) console.log(`   ${k}: ${s.wins} wins in ${s.seats} seats (${pct(s.wins, s.seats)}), average points ${(s.vp / s.seats).toFixed(1)}`);
  console.log(`   wins by seat: ${seat.map((n, i) => `seat ${i + 1}: ${n} (${pct(n, fin.length)})`).join(', ')} | average points by seat ${seatVp.map((v) => (v / Math.max(1, fin.length)).toFixed(1)).join(' / ')}`);
}
