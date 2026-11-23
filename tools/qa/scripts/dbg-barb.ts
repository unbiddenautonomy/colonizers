import { readFileSync } from 'node:fs';
import { library, Ctx } from './sim-core.ts';
const base = await import('../../../packages/modules/base/src/rules.ts');
const { config, actions } = JSON.parse(readFileSync(process.argv[2]!, 'utf8'));
let { state } = library.createGame(config);
for (const a of actions) state = library.apply(state, a).state;
const registry = library.registry(state.modules);
const ctx = new Ctx(state, registry);
const seat = state.turn.player;
const edges = base.legalRoadEdges(ctx, seat);
console.log('legalRoadEdges', edges.length, edges.slice(0, 10));
for (const e of edges.slice(0, 6)) {
  console.log(e, 'check:', library.check(state, { type: 'placeFreeRoad', player: seat, edge: e }));
}
console.log('legalActions', library.legalActions(state, seat).length);
console.log('supply road', ctx.supplyLeft(seat, 'road'));
console.log(Object.keys(state.ext ?? state.data ?? {}));
console.log(JSON.stringify(state.phase));
