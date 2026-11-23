/** On which boards can a Papua player not place a starting settlement at all? */
import { library, buildConfig, DEFAULT_SETTINGS, DEFAULT_OPTIONS, cleanSettings } from './sim-core.ts';
const boards = (await import('./specs/boards.json', { with: { type: 'json' } })).default as any[];
const seen = new Set<string>();
for (const b of boards) {
  const key = b.name.replace(/\|\dp.*$/, '');
  if (seen.has(key) || b.players !== 4) continue;
  seen.add(key);
  for (const papuaSeat of [0, 3]) {
    const names = ['P1', 'P2', 'P3', 'P4'];
    let line = `${key.padEnd(28)} Papua in seat ${papuaSeat + 1}: `;
    try {
      const settings = cleanSettings({ ...DEFAULT_SETTINGS, ...b.settings, citiesKnights: true, greedWealthPower: true, civilisations: true, options: { ...DEFAULT_OPTIONS, ...(b.settings.options ?? {}) }, maxPlayers: 4 });
      let state: any = library.createGame(buildConfig(settings, names, `papua-${key}`)).state;
      if (!state.modules.includes('civilisations')) { console.log(line + 'Civilisations not available on this board'); break; }
      // Everyone picks a civilisation; one seat takes Papua.
      let guard = 0;
      while (state.phase.id !== 'setup' && guard++ < 40) {
        const waiting: number[] = library.waitingOn(state);
        if (!waiting.length) break;
        const seat = waiting[0]!;
        const legal = library.legalActions(state, seat);
        const picks = legal.filter((a: any) => a.type === 'pickCiv');
        const want = picks.find((a: any) => (seat === papuaSeat ? a.civ === 'papua' : a.civ !== 'papua')) ?? picks[0] ?? legal[0];
        state = library.apply(state, want).state;
      }
      const civs = JSON.stringify((state.data as any).civilisations?.civ ?? {});
      // Play the setup with first legal moves until the Papua seat must place, or somebody is stuck.
      let stuck: string | null = null;
      let placed = 0;
      guard = 0;
      while (state.phase.id === 'setup' && guard++ < 60) {
        const waiting: number[] = library.waitingOn(state);
        if (!waiting.length) { stuck = `nobody can act; seat ${state.turn.player + 1} is to place (${state.phase.step})`; break; }
        const seat = waiting[0]!;
        const legal = library.legalActions(state, seat);
        if (seat === papuaSeat && legal.some((a: any) => a.type === 'placeSetupSettlement')) placed++;
        state = library.apply(state, legal[Math.floor(legal.length / 2)]).state;
      }
      console.log(line + (stuck ? `FREEZE: ${stuck}` : `ok (Papua placed ${placed} settlements)`) + (civs.includes('papua') ? '' : ' [nobody could pick Papua]'));
    } catch (e) {
      console.log(line + 'error: ' + String((e as Error).message).slice(0, 100));
    }
  }
}
