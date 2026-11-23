import { library, buildConfig, Ctx, DEFAULT_SETTINGS, DEFAULT_OPTIONS, cleanSettings } from './sim-core.ts';
const boards = (await import('./specs/boards.json', { with: { type: 'json' } })).default as any[];
const which = process.argv[2] ?? 'scenario:new-shores';
const b = boards.find((x) => x.name.startsWith(which) && x.players === 4);
const names = ['P1', 'P2', 'P3', 'P4'];
for (let trial = 0; trial < Number(process.argv[3] ?? 12); trial++) {
  const settings = cleanSettings({ ...DEFAULT_SETTINGS, ...b.settings, citiesKnights: true, greedWealthPower: true, civilisations: true, options: { ...DEFAULT_OPTIONS, ...(b.settings.options ?? {}) }, maxPlayers: 4 });
  let state: any = library.createGame(buildConfig(settings, names, `papua2-${which}-${trial}`)).state;
  let guard = 0;
  const offered: string[] = [];
  while (state.phase.id !== 'setup' && guard++ < 40) {
    const waiting: number[] = library.waitingOn(state);
    if (!waiting.length) break;
    const seat = waiting[0]!;
    const legal = library.legalActions(state, seat);
    const picks = legal.filter((a: any) => a.type === 'pickCiv');
    if (picks.length) offered.push(`${seat + 1}:${picks.map((a: any) => a.civ).join('/')}`);
    const want = picks.find((a: any) => a.civ === 'papua') ?? picks[0] ?? legal[0];
    state = library.apply(state, want).state;
  }
  const civ = (state.data as any).civilisations?.civ ?? {};
  let stuck = '';
  guard = 0;
  while (state.phase.id === 'setup' && guard++ < 60) {
    const waiting: number[] = library.waitingOn(state);
    if (!waiting.length) {
      const seat = state.turn.player;
      const ctx: any = new Ctx(state, library.registry(state.modules));
      const reasons: Record<string, number> = {};
      for (const c of ctx.geometry.corners) { const r = String(library.check(state, { type: 'placeSetupSettlement', player: seat, corner: c })); reasons[r] = (reasons[r] ?? 0) + 1; }
      stuck = `FREEZE at seat ${seat + 1} (${civ[seat]}), step ${state.phase.step}, index ${state.phase.index}: ${JSON.stringify(reasons)}`;
      break;
    }
    const seat = waiting[0]!;
    const legal = library.legalActions(state, seat);
    state = library.apply(state, legal[(trial * 7 + guard * 3) % legal.length]).state;
  }
  console.log(`${which} trial ${trial}: civs ${JSON.stringify(civ)} ${stuck || 'setup completed'}${trial === 0 ? ' | offered ' + offered.join(' ') : ''}`);
}
