import { readFileSync } from 'node:fs';
import { library } from './sim-core.ts';
const { config, actions } = JSON.parse(readFileSync(process.argv[2]!, 'utf8'));
let { state } = library.createGame(config) as any;
const total = (s: any, c: string) => (s.bank[c] ?? 0) + s.players.reduce((n: number, p: any) => n + (p.hand[c] ?? 0), 0);
let prev = total(state, 'gold');
console.log('modules', state.modules.join(','), '| gold at start', prev, '| bank', state.bank.gold);
let shown = 0;
for (let i = 0; i < actions.length; i++) {
  const a = actions[i];
  const before = state;
  const r = library.apply(state, a);
  state = r.state;
  const t = total(state, 'gold');
  if (t !== prev && shown++ < 6) {
    console.log(`move ${i} ${JSON.stringify(a).slice(0, 200)} in phase ${JSON.stringify(before.phase).slice(0, 120)}: gold ${prev} -> ${t} | bank ${before.bank.gold} -> ${state.bank.gold} | hands ${before.players.map((p: any) => p.hand.gold ?? 0).join('/')} -> ${state.players.map((p: any) => p.hand.gold ?? 0).join('/')}`);
    console.log('   events:', JSON.stringify(r.events).slice(0, 700));
  }
  prev = t;
}
console.log('gold at end', prev, 'changes', shown);
