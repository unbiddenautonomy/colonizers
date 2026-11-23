import { readFileSync } from 'node:fs';
import { library, timeoutAction, timedSeats, Ctx } from './sim-core.ts';
const { config, actions } = JSON.parse(readFileSync(process.argv[2]!, 'utf8'));
const start = Number(process.argv[3]);
let state = library.createGame(config).state;
for (let i = 0; i < start; i++) state = library.apply(state, actions[i]).state;
const ctx = new Ctx(state, library.registry(state.modules));
console.log('at move', start, ': phase', JSON.stringify(state.phase).slice(0, 300));
console.log('turn', state.turn.number, 'round', state.turn.round, '| points', state.players.map((p: any) => ctx.vp(p.seat)).join('/'), 'of', ctx.vpTarget(), '| civs', JSON.stringify((state.data.civilisations as any).civ ?? Object.keys(state.data.civilisations as any)).slice(0, 200));
let s = state;
let asked = 0;
let i = 0;
const seen: string[] = [];
for (; i < 400; i++) {
  const w = library.waitingOn(s);
  if (!w.length) break;
  const legal = library.legalActions(s, w[0]!);
  const a = legal.find((x: any) => x.type === 'passIndulgence') ?? legal.find((x: any) => x.type === 'civDemocracy' && x.dice === 'keep');
  if (!a) break;
  if (i < 6) seen.push(`${s.phase.id}: seat ${w[0]} may ${[...new Set(legal.map((x: any) => x.type))].join(' or ')}`);
  if (a.type === 'civDemocracy') asked++;
  s = library.apply(s, a).state;
}
console.log(seen.join('\n'));
console.log(`keep + pass every time: after ${i} moves the phase is still ${s.phase.id}; Greece was asked ${asked} times about one roll`);
let t = state;
let k = 0;
const rand = () => 0.5;
for (; k < 400; k++) {
  const seat = timedSeats(t).find((x: number) => timeoutAction(t, x, rand));
  if (seat === undefined) break;
  const a = timeoutAction(t, seat, rand)!;
  if (a.type !== 'civDemocracy' && a.type !== 'passIndulgence') break;
  t = library.apply(t, a).state;
}
console.log(`turn timer's safe moves: ${k} moves later the phase is ${t.phase.id} (timer watches ${JSON.stringify(timedSeats(t))}, its move ${JSON.stringify(timedSeats(t).map((x: number) => timeoutAction(t, x, rand)))})`);
