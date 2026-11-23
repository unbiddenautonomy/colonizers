import { library, buildConfig, DEFAULT_SETTINGS, DEFAULT_OPTIONS, cleanSettings, chooseAction, newMemory } from './sim-core.ts';
for (const openTrading of [false, true]) {
  const settings = cleanSettings({ ...DEFAULT_SETTINGS, options: { ...DEFAULT_OPTIONS, openTrading }, maxPlayers: 4 });
  const config = buildConfig(settings, ['A', 'B', 'C', 'D'], 'open-1');
  let { state } = library.createGame(config);
  const mem = [0, 1, 2, 3].map(() => newMemory());
  let clock = 0;
  // Play until round 3 main phase, then look at who the room thinks is "waiting".
  for (let i = 0; i < 2000 && state.winner === null; i++) {
    clock += 1000;
    if (state.turn.round >= 3 && state.phase.id === 'main') break;
    const w = library.waitingOn(state);
    let done = false;
    for (const s of w) {
      const a = chooseAction(library, state, s, { level: 'medium', style: 'balanced' }, mem[s], { now: clock, budgetMs: 100 });
      if (a) { state = library.apply(state, a).state; done = true; break; }
    }
    if (!done) clock += 20000;
  }
  const w = library.waitingOn(state);
  console.log(`openTrading=${openTrading}: phase ${state.phase.id}, turn player ${state.turn.player}, waitingOn = [${w}]`);
  // How often do the others have something to do, and what does the bot answer?
  for (const s of w) {
    const a = chooseAction(library, state, s, { level: 'medium', style: 'balanced' }, mem[s], { now: clock, budgetMs: 100 });
    console.log(`   seat ${s}: legal ${library.legalActions(state, s).length} actions, bot picks ${a ? a.type : null}`);
  }
}
