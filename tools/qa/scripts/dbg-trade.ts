import { library, buildConfig, DEFAULT_SETTINGS, DEFAULT_OPTIONS, cleanSettings, chooseAction, newMemory } from './sim-core.ts';
const REPO = process.env.REPO ?? '../../..';
let offers = 0, accepts = 0, declines = 0, confirms = 0, games = 0, noAcceptOption = 0;
const levels = (process.argv[2] ?? 'medium').split(',');
for (let g = 0; g < 12; g++) {
  const settings = cleanSettings({ ...DEFAULT_SETTINGS, options: { ...DEFAULT_OPTIONS }, maxPlayers: 4 });
  const config = buildConfig(settings, ['A', 'B', 'C', 'D'], `trade-${g}`);
  let { state } = library.createGame(config);
  const mem = [0, 1, 2, 3].map(() => newMemory());
  const styles = ['balanced', 'trader', 'builder', 'city'];
  let clock = 0;
  for (let i = 0; i < 6000 && state.winner === null; i++) {
    clock += 1000;
    const w = library.waitingOn(state);
    let done = false;
    for (const s of w) {
      const a = chooseAction(library, state, s, { level: levels[s % levels.length], style: styles[s] }, mem[s], { now: clock, budgetMs: 80 });
      if (!a) continue;
      if (a.type === 'offerTrade') offers++;
      if (a.type === 'respondTrade') {
        if (a.accept) accepts++; else declines++;
        if (!library.legalActions(state, s).some((x: any) => x.type === 'respondTrade' && x.accept === true)) noAcceptOption++;
      }
      if (a.type === 'confirmTrade') confirms++;
      state = library.apply(state, a).state; done = true; break;
    }
    if (!done) clock += 20000;
  }
  games++;
}
console.log(`levels ${levels}: ${games} games: offers ${offers}, accepts ${accepts}, declines ${declines} (of which the responder did not hold the card: ${noAcceptOption}), completed trades ${confirms}`);
