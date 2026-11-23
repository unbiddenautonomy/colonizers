import { readFileSync } from 'node:fs';
import { library, Ctx } from './sim-core.ts';
const { config, actions } = JSON.parse(readFileSync(process.argv[2]!, 'utf8'));
let { state } = library.createGame(config);
for (const a of actions) state = library.apply(state, a).state;
const ctx: any = new Ctx(state, library.registry(state.modules));
console.log('modules', state.modules.join(','));
console.log('phase', JSON.stringify(state.phase), 'turn', JSON.stringify(state.turn));
console.log('civs', JSON.stringify((state.data as any).civilisations?.civ ?? (state.data as any).civilisations ?? null).slice(0, 600));
console.log('waitingOn', library.waitingOn(state));
const seat = state.turn.player;
const reasons: Record<string, number> = {};
let land = 0;
for (const c of ctx.geometry.corners) {
  if (ctx.isLandCorner(c)) land++;
  const r = library.check(state, { type: 'placeSetupSettlement', player: seat, corner: c });
  reasons[String(r)] = (reasons[String(r)] ?? 0) + 1;
}
console.log('corners', ctx.geometry.corners.length, 'land corners', land, '| placeSetupSettlement for seat', seat, JSON.stringify(reasons));
for (const t of Object.keys(library.registry(state.modules).actions)) {
  const def: any = library.registry(state.modules).actions[t];
  if (def.phases && !def.phases.includes(state.phase.id)) continue;
  let n = 0; try { n = (def.enumerate?.(ctx, seat) ?? []).length; } catch (e) { n = -1; }
  console.log('  action in this phase:', t, 'enumerated for seat', seat, ':', n);
}
const hidden = Object.values(state.hexes as any).filter((h: any) => h.hidden).length;
console.log('hexes', Object.keys(state.hexes).length, 'hidden', hidden);
