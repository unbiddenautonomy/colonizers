/** Plays whole bot games and compares the live end state with a replay, ignoring empty containers. */
import { library, buildConfig, cleanSettings, DEFAULT_SETTINGS, DEFAULT_OPTIONS, chooseAction, newMemory } from './sim-core.ts';
const strip = (x: any): any => {
  if (Array.isArray(x)) return x.map(strip);
  if (x && typeof x === 'object') {
    const o: any = {};
    for (const k of Object.keys(x).sort()) {
      const v = strip(x[k]);
      if (v === undefined) continue;
      if (Array.isArray(v) && v.length === 0) continue;
      if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0) continue;
      o[k] = v;
    }
    return o;
  }
  return x;
};
const diff = (a: any, b: any, path: string, out: string[]) => {
  if (out.length > 10) return;
  if (JSON.stringify(a) === JSON.stringify(b)) return;
  if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diff(a[k], b[k], `${path}.${k}`, out);
  } else out.push(`${path}: live ${JSON.stringify(a)?.slice(0, 120)} | replay ${JSON.stringify(b)?.slice(0, 120)}`);
};
for (const [modesStr, seed, players] of [['citiesKnights,greedWealthPower', 'r1', 4], ['citiesKnights,greedWealthPower,civilisations', 'r2', 4], ['citiesKnights,greedWealthPower', 'r3', 5], ['citiesKnights,greedWealthPower,civilisations', 'r4', 3]] as [string, string, number][]) {
  const modes = modesStr.split(',');
  const settings = cleanSettings({ ...DEFAULT_SETTINGS, map: { kind: 'random', mode: 'classic' }, options: { ...DEFAULT_OPTIONS }, maxPlayers: players, ...Object.fromEntries(modes.map((m) => [m, true])) });
  const names = ['A', 'B', 'C', 'D', 'E', 'F'].slice(0, players);
  const config = buildConfig(settings, names, seed);
  let rs = 777;
  const rand = () => ((rs = (rs * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  let state = library.createGame(config).state;
  const actions: any[] = [];
  const mem = names.map(() => newMemory());
  let clock = 0;
  const t0 = Date.now();
  for (let n = 0; n < 20000 && state.winner === null && Date.now() - t0 < 100000; n++) {
    clock += 1000;
    const waiting = library.waitingOn(state);
    if (!waiting.length) break;
    let acted = false;
    for (const seat of waiting) {
      const a = chooseAction(library, state, seat, { level: 'medium', style: 'balanced' } as any, mem[seat], { rand, now: clock, budgetMs: 60 });
      if (!a) continue;
      try { state = library.apply(state, a).state; } catch { continue; }
      actions.push(a); acted = true; break;
    }
    if (!acted) break;
  }
  const rep = library.replay(config, actions);
  const exact = JSON.stringify(rep) === JSON.stringify(state);
  const loose = JSON.stringify(strip(rep)) === JSON.stringify(strip(state));
  const out: string[] = [];
  if (!loose) diff(strip(state), strip(rep), 'state', out);
  console.log(`${modesStr} ${players}p: ${actions.length} moves, winner ${state.winner}, round ${state.turn.round} | exact match ${exact} | match ignoring empty containers ${loose}${out.length ? '\n   ' + out.join('\n   ') : ''}`);
}
