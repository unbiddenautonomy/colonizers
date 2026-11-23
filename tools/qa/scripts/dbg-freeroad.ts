import { readFileSync } from 'node:fs';
import { library, Ctx } from './sim-core.ts';
const sea = await import('../../../packages/modules/seafarers/src/rules.ts').catch(() => null);
const seaA = await import('../../../packages/modules/seafarers/src/actions.ts');
const { config, actions } = JSON.parse(readFileSync(process.argv[2]!, 'utf8'));
let { state } = library.createGame(config);
for (const a of actions) state = library.apply(state, a).state;
const registry = library.registry(state.modules);
const ctx = new Ctx(state, registry);
const seat = state.turn.player;
console.log('phase', JSON.stringify(state.phase), 'seat', seat, 'supply road', ctx.supplyLeft(seat, 'road'), 'ship', ctx.supplyLeft(seat, 'ship'));
console.log('freeSpots says', seaA.freeSpots(ctx, seat));
const reasons: Record<string, number> = {};
let ok = 0;
for (const e of ctx.geometry.edges) {
  for (const type of ['placeFreeShip', 'placeFreeRoad']) {
    const why = library.check(state, { type, player: seat, edge: e });
    if (why === null) ok++;
    else reasons[type + ': ' + why] = (reasons[type + ': ' + why] ?? 0) + 1;
  }
}
console.log('legal free placements', ok, reasons);
