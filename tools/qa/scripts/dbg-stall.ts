/** Rebuilds the online game just before its last move and asks the bot what it would do there. */
import { readFileSync } from 'node:fs';
import { library, Ctx, chooseAction, newMemory } from './sim-core.ts';
const { config, actions } = JSON.parse(readFileSync(process.argv[2]!, 'utf8'));
const upto = Number(process.argv[3] ?? actions.length - 1);
let { state } = library.createGame(config);
for (const a of actions.slice(0, upto)) state = library.apply(state, a).state;
const registry = library.registry(state.modules);
const ctx = new Ctx(state, registry);
console.log('after', upto, 'moves: phase', JSON.stringify(state.phase), 'turn', JSON.stringify(state.turn), 'trade', JSON.stringify((state.data.base as any)?.trade ?? null));
console.log('waitingOn', library.waitingOn(state), 'vp', state.players.map((p: any) => ctx.vp(p.seat)), 'target', ctx.vpTarget());
const legal = library.legalActions(state, 0);
console.log('legal for seat 0:', legal.length, JSON.stringify(legal.slice(0, 6)));
for (const level of ['hard', 'medium', 'easy']) {
  for (let i = 0; i < 3; i++) {
    const t0 = Date.now();
    let out: unknown;
    try {
      out = chooseAction(library, state, 0, { level, style: 'trader' } as any, newMemory(), { budgetMs: 2500 });
    } catch (e) {
      out = 'THREW ' + (e as Error).stack?.split('\n').slice(0, 4).join(' | ');
    }
    console.log(level, 'try', i, '->', JSON.stringify(out), `${Date.now() - t0} ms`);
  }
}
