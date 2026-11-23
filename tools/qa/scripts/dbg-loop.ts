/**
 * Civilisations: when Greece may throw the dice again and somebody holds an Indulgence, do the two
 * "hold the dice" steps hand the same roll back and forth for as long as both say "keep"?
 */
import { library, buildConfig, cleanSettings, DEFAULT_SETTINGS, DEFAULT_OPTIONS, chooseAction, newMemory, timeoutAction, timedSeats } from './sim-core.ts';
const modes = ['citiesKnights', 'greedWealthPower', 'civilisations'];
let found = 0;
for (let g = 0; g < 14 && found < 2; g++) {
  const settings = cleanSettings({ ...DEFAULT_SETTINGS, map: { kind: 'random', mode: 'classic' }, options: { ...DEFAULT_OPTIONS }, maxPlayers: 4, ...Object.fromEntries(modes.map((m) => [m, true])) });
  const names = ['A', 'B', 'C', 'D'];
  let state = library.createGame(buildConfig(settings, names, `loop-${g}`)).state;
  const mem = names.map(() => newMemory());
  let rs = 4242 + g;
  const rand = () => ((rs = (rs * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  let clock = 0;
  const t0 = Date.now();
  let hit = false;
  for (let n = 0; n < 30000 && state.winner === null && Date.now() - t0 < 60000; n++) {
    clock += 1000;
    if (state.phase.id === 'indulgence' && (state.phase.returnTo as any)?.id !== undefined || state.phase.id === 'indulgence') {
      // Try the loop from here: everybody lets the roll stand, Greece keeps the dice.
      let s = state;
      const trail: string[] = [];
      let loops = 0;
      for (let i = 0; i < 40; i++) {
        const w = library.waitingOn(s);
        if (!w.length) { trail.push('nobody can act'); break; }
        const seat = w[0]!;
        const legal = library.legalActions(s, seat);
        const a = legal.find((x: any) => x.type === 'passIndulgence') ?? legal.find((x: any) => x.type === 'civDemocracy' && x.dice === 'keep');
        if (!a) { trail.push(`-> ${s.phase.id} (other moves: ${[...new Set(legal.map((x: any) => x.type))].slice(0, 4).join(',')})`); break; }
        trail.push(`${a.type}${a.dice ? ':' + a.dice : ''}(${seat})`);
        if (a.type === 'civDemocracy') loops++;
        s = library.apply(s, a).state;
      }
      if (loops >= 2) {
        found++;
        hit = true;
        console.log(`game ${g}, move ${n}, turn ${state.turn.number}: dice ${JSON.stringify((state.data.base as any).lastRoll)}`);
        console.log('   ' + trail.join(' '));
        console.log(`   Greece was asked ${loops} times about the same roll in 40 moves`);
        // What would the turn timer do for these two seats?
        const greeceState = library.apply(state, library.legalActions(state, library.waitingOn(state)[0]!).find((x: any) => x.type === 'passIndulgence')!).state;
        console.log('   after everyone passes: phase', greeceState.phase.id, '| timer watches', JSON.stringify(timedSeats(greeceState)), '| timer move', JSON.stringify(timedSeats(greeceState).map((s2: number) => timeoutAction(greeceState, s2, rand))));
        break;
      }
    }
    const waiting = library.waitingOn(state);
    if (!waiting.length) break;
    let acted = false;
    for (const seat of waiting) {
      const a = chooseAction(library, state, seat, { level: 'medium', style: 'balanced' } as any, mem[seat], { rand, now: clock, budgetMs: 40 });
      if (!a) continue;
      try { state = library.apply(state, a).state; } catch { continue; }
      acted = true; break;
    }
    if (!acted) break;
  }
  if (!hit) console.log(`game ${g}: no Greece + Indulgence moment in ${state.turn.number} turns (civs: ${JSON.stringify(Object.values((state.data.civilisations as any)?.civ ?? (state.data.civilisations as any)?.civs ?? {})).slice(0, 80)})`);
}
