/**
 * Why does seat 1 win so rarely when bot styles are mixed? Plays arena games and counts, per seat:
 * times robbed (robber put on their hex), times stolen from, cards lost to steals, points of the
 * two starting settlements (production dots), and who wins.
 * Usage: tsx dbg-seatbias.ts <styles|seats> [games]
 */
import { library, buildConfig, chooseAction, newMemory, Ctx, DEFAULT_SETTINGS, DEFAULT_OPTIONS, cleanSettings } from './sim-core.ts';
const group = process.argv[2] === 'seats' ? 'arena:seats' : 'arena:styles';
const N = Number(process.argv[3] ?? 40);
const specs = (await import('./specs/arena-lite.json', { with: { type: 'json' } })).default.filter((s: any) => s.name === group).slice(0, N);
const hash = (s: string) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const rng = (seed: number) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const tot = { wins: [0, 0, 0, 0], stolenFrom: [0, 0, 0, 0], thief: [0, 0, 0, 0], dots: [0, 0, 0, 0], firstRoll: [0, 0, 0, 0], games: 0, events: {} as Record<string, number> };
const DOTS: Record<number, number> = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };
for (const spec of specs as any[]) {
  const names = Array.from({ length: spec.players }, (_, i) => `P${i + 1}`);
  const settings = cleanSettings({ ...DEFAULT_SETTINGS, ...spec.settings, options: { ...DEFAULT_OPTIONS, ...(spec.settings.options ?? {}) }, maxPlayers: spec.players });
  const config = buildConfig(settings, names, spec.seed);
  let state: any = library.createGame(config).state;
  const rand = rng(hash(spec.seed) || 1);
  const memory = names.map(() => newMemory());
  let clock = 0;
  let dotsDone = false;
  for (let n = 0; n < 20000 && state.winner === null && state.turn.round < 150; n++) {
    clock += 1000;
    const waiting: number[] = library.waitingOn(state);
    if (!waiting.length) break;
    if (!dotsDone && state.phase.id !== 'setup') {
      dotsDone = true;
      tot.firstRoll[state.turn.player]++;
      const ctx = new Ctx(state, library.registry(state.modules));
      for (const p of Object.values(state.pieces) as any[]) {
        if (p.type !== 'settlement' || p.owner === null || p.owner === undefined) continue;
        for (const h of ctx.geometry.cornerHexes.get(p.at.id) ?? []) tot.dots[p.owner] += DOTS[state.hexes[h]?.token] ?? 0;
      }
    }
    for (const seat of [...waiting].sort(() => rand() - 0.5)) {
      const a = chooseAction(library, state, seat, spec.bots[seat], memory[seat], { rand, now: clock, budgetMs: 300 });
      if (!a) continue;
      let r: any;
      try { r = library.apply(state, a); } catch { continue; }
      state = r.state;
      for (const e of r.events) {
        tot.events[e.type] = (tot.events[e.type] ?? 0) + 1;
        if (e.type === 'stole') { tot.stolenFrom[e.victim]++; tot.thief[e.thief]++; }
      }
      break;
    }
  }
  if (state.winner !== null) tot.wins[state.winner]++;
  tot.games++;
}
const per = (a: number[]) => a.map((x) => (x / tot.games).toFixed(1)).join(' / ');
console.log(group, 'games', tot.games);
console.log(' wins by seat          ', tot.wins.join(' / '));
console.log(' starts the first turn ', tot.firstRoll.join(' / '));
console.log(' starting dots per game', per(tot.dots));
console.log(' stolen from, per game ', per(tot.stolenFrom));
console.log(' steals made, per game ', per(tot.thief));
