/** Loads a dump and prints the end state in short: targets, points, pieces left, what each seat can still do. */
import { readFileSync } from 'node:fs';
import { library, Ctx } from './sim-core.ts';
const { config, actions } = JSON.parse(readFileSync(process.argv[2]!, 'utf8'));
let { state } = library.createGame(config);
const types: Record<string, number> = {};
const lastBuild: Record<number, number> = {};
let i = 0;
for (const a of actions) {
  const out = library.apply(state, a);
  state = out.state;
  for (const e of out.events) if (e.type === 'built' || e.type === 'vpChanged') lastBuild[(e as any).player] = state.turn.round;
  if (state.turn.round > 100) types[a.type] = (types[a.type] ?? 0) + 1;
  i++;
}
const registry = library.registry(state.modules);
const ctx = new Ctx(state, registry);
console.log('modules', state.modules.join(','), 'settings vp', JSON.stringify((state as any).settings?.vpTarget ?? (config as any).settings?.vpTarget), 'round', state.turn.round);
for (const p of state.players as any[]) {
  const legal = library.legalActions({ ...state, turn: { ...state.turn, player: p.seat }, phase: { id: 'main' } } as any, p.seat);
  const kinds: Record<string, number> = {};
  for (const a of legal) kinds[a.type] = (kinds[a.type] ?? 0) + 1;
  console.log(`seat ${p.seat}: vp ${ctx.vp(p.seat)} hand ${JSON.stringify(p.hand)} supply ${JSON.stringify(Object.fromEntries(Object.keys(registry.pieceTypes).filter((t) => registry.pieceTypes[t].perPlayer).map((t) => [t, ctx.supplyLeft(p.seat, t)])))} last build round ${lastBuild[p.seat]} could do in main: ${JSON.stringify(kinds)}`);
}
console.log('actions after round 100:', JSON.stringify(types));
console.log('ext keys', Object.keys((state as any).ext ?? {}));
