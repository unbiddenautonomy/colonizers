/**
 * Re-runs single specs by name+seed from a spec file with dumps on, then prints the tail of the game.
 * Usage: SIM_DUMP=dumps tsx rerun.ts specs/boards.json "<name>" "<seed>" [tail]
 */
import { readFileSync } from 'node:fs';
import { runSim, library, describe, Ctx, type SimSpec } from './sim-core.ts';

const [specFile, name, seed, tailArg] = process.argv.slice(2);
const specs = JSON.parse(readFileSync(specFile!, 'utf8')) as SimSpec[];
const spec = specs.find((s) => s.name === name && (!seed || s.seed === seed));
if (!spec) throw new Error('no such spec');
process.env.SIM_DUMP ??= 'dumps';
process.env.SIM_DUMP_ALL = '1';
const r = runSim(spec);
console.log(JSON.stringify({ ...r, actionTypes: undefined, eventTypes: undefined, stuckInfo: undefined }, null, 1));
if (r.dump) {
  const { config, actions } = JSON.parse(readFileSync(r.dump, 'utf8'));
  const names = config.players.map((p: { name: string }) => p.name);
  let { state } = library.createGame(config);
  const tail = Number(tailArg ?? 25);
  actions.forEach((a: Record<string, unknown>, i: number) => {
    const out = library.apply(state, a);
    state = out.state;
    if (i >= actions.length - tail) {
      console.log(`#${i} r${state.turn.round} seat${a.player} ${JSON.stringify(a)}`);
      for (const e of out.events) console.log(`     · ${e.type}: ${describe(e, names) ?? JSON.stringify(e)}`);
    }
  });
  console.log('phase', JSON.stringify(state.phase), 'active', state.turn.active ?? state.turn, 'waiting', library.waitingOn(state));
  const registry = library.registry(state.modules);
  const ctx = new Ctx(state, registry);
  console.log('vp', state.players.map((p: { seat: number }) => ctx.vp(p.seat)));
}
