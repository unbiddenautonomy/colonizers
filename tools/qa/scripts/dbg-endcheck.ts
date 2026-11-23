import { readFileSync } from 'node:fs';
import { library, Ctx } from './sim-core.ts';
const { config, actions } = JSON.parse(readFileSync(process.argv[2]!, 'utf8'));
let { state } = library.createGame(config);
let i = 0;
for (const a of actions) {
  state = library.apply(state, a).state;
  i++;
  if (i >= actions.length - 3) {
    const ctx = new Ctx(state, library.registry(state.modules));
    console.log(`after move ${i} ${a.type}(${a.player}): phase ${JSON.stringify(state.phase)} turn player ${state.turn.player} winner ${state.winner} vp ${state.players.map((p: any) => ctx.vp(p.seat)).join('/')} of ${ctx.vpTarget()} waiting ${JSON.stringify(state.winner === null ? library.waitingOn(state) : [])}`);
  }
}
console.log('players', state.players.map((p: any) => p.name).join(','), '| total moves', actions.length);
