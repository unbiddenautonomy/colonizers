/** Rebuilds a room's game from its saved moves and asks the bot in each waiting seat what it would do, the way the room does. */
import { readFileSync } from 'node:fs';
import { library, Ctx, chooseAction, newMemory } from './sim-core.ts';
const engine: any = await import('../../../packages/engine/src/index.ts');
const { config, actions, members } = JSON.parse(readFileSync(process.argv[2]!, 'utf8'));
const upto = Number(process.argv[3] ?? actions.length);
let { state } = library.createGame(config);
for (const a of actions.slice(0, upto)) state = library.apply(state, a).state;
const registry = library.registry(state.modules);
console.log('modules', state.modules.join(','), '| players', state.players.map((p: any) => p.name).join(','));
console.log('last moves:', actions.slice(Math.max(0, upto - 8), upto).map((a: any) => `${a.type}(${a.player})`).join(' '));
console.log('after', upto, 'moves: phase', JSON.stringify(state.phase), 'turn', JSON.stringify(state.turn));
console.log('trade', JSON.stringify((state.data.base as any)?.trade ?? null));
console.log('waitingOn (full state):', library.waitingOn(state));
for (const p of state.players as any[]) {
  const full = library.legalActions(state, p.seat);
  const view = engine.stateFromView(library.view(state, p.seat));
  let red: any[] = [];
  let err = '';
  try { red = library.legalActions(view, p.seat); } catch (e) { err = String((e as Error).message); }
  const types = (l: any[]) => { const m: Record<string, number> = {}; for (const a of l) m[a.type] = (m[a.type] ?? 0) + 1; return JSON.stringify(m); };
  console.log(`seat ${p.seat} ${p.name}: hand ${JSON.stringify(p.hand)} | legal on full state ${types(full)} | legal in own view ${err || types(red)}`);
}
const bots = (members as any[]).filter((m) => m.bot && m.seat !== null);
for (const m of bots) {
  const mem = newMemory();
  const cfg = JSON.parse(m.bot);
  for (let i = 0; i < 5; i++) {
    const t0 = Date.now();
    let out: unknown;
    try {
      out = chooseAction(library, state, m.seat, cfg, mem, { budgetMs: 2500, now: Date.now() + i * 4000 });
    } catch (e) {
      out = 'THREW ' + (e as Error).stack?.split('\n').slice(0, 4).join(' | ');
    }
    console.log(`bot seat ${m.seat} (${m.name}, ${m.bot}) poll ${i} (+${i * 4}s) ->`, JSON.stringify(out), `${Date.now() - t0} ms`, '| memory', JSON.stringify(mem).slice(0, 200));
  }
}
