/** 5-player game: at the first Special Building Phase, who does the turn timer watch, and can it move them? */
import { library, buildConfig, cleanSettings, DEFAULT_SETTINGS, DEFAULT_OPTIONS, chooseAction, newMemory, timedSeats, timeoutAction } from './sim-core.ts';
const rules: any = await import('../../../apps/server/src/rules.ts');
for (const [label, players, modes, map] of [['5 players, base game', 5, [], { kind: 'random', mode: 'classic' }], ['4 players, Strategist', 4, ['citiesKnights', 'strategist'], { kind: 'random', mode: 'classic' }], ['4 players, Full Voyage', 4, [], { kind: 'special', id: 'full-voyage' }]] as [string, number, string[], any][]) {
  const settings = cleanSettings({ ...DEFAULT_SETTINGS, map, options: { ...DEFAULT_OPTIONS }, maxPlayers: players, ...Object.fromEntries(modes.map((m) => [m, true])) });
  const names = ['A', 'B', 'C', 'D', 'E', 'F'].slice(0, players);
  let state = library.createGame(buildConfig(settings, names, 'sbp-1')).state;
  const mem = names.map(() => newMemory());
  let rs = 99;
  const rand = () => ((rs = (rs * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  let clock = 0;
  const seen = new Set<string>();
  for (let n = 0; n < 6000 && state.winner === null; n++) {
    clock += 1000;
    const waiting = library.waitingOn(state);
    if (!waiting.length) break;
    // The timer's view of this moment.
    const timed = timedSeats(state);
    const uncovered = waiting.filter((s: number) => !(timed.includes(s) && timeoutAction(state, s, rand)));
    // Only moments where a waiting seat would never be moved by the timer, and nobody else can move either.
    const others = waiting.filter((s: number) => !uncovered.includes(s));
    const key = `${state.phase.id}`;
    if (uncovered.length && !others.length && !seen.has(key)) {
      seen.add(key);
      const legal = library.legalActions(state, uncovered[0]);
      const types: Record<string, number> = {};
      for (const a of legal) types[a.type] = (types[a.type] ?? 0) + 1;
      console.log(`${label}: phase ${JSON.stringify(state.phase).slice(0, 140)} | turn player ${state.turn.player} | waiting on ${JSON.stringify(waiting)} | timer watches ${JSON.stringify(timed)} | timer key ${rules.timerKey(state)} | that seat's legal moves ${JSON.stringify(types)} | timer's move for them: ${JSON.stringify(timeoutAction(state, uncovered[0], rand))}`);
    }
    let acted = false;
    for (const seat of waiting) {
      const a = chooseAction(library, state, seat, { level: 'medium', style: 'balanced' } as any, mem[seat], { rand, now: clock, budgetMs: 40 });
      if (!a) continue;
      try { state = library.apply(state, a).state; } catch { continue; }
      acted = true; break;
    }
    if (!acted) break;
  }
  console.log(`${label}: phases where the timer cannot move the only waiting seat: ${[...seen].join(', ') || 'none'}`);
}
