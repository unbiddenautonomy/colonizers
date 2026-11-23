/** From a saved game: find where Greece and an Indulgence holder trade the same roll back and forth, and show it. */
import { readFileSync } from 'node:fs';
import { library, timeoutAction, timedSeats } from './sim-core.ts';
const { config, actions } = JSON.parse(readFileSync(process.argv[2]!, 'utf8'));
let state = library.createGame(config).state;
let run = 0;
let best = { start: -1, len: 0 };
let start = -1;
const counts: number[] = [];
actions.forEach((a: any, i: number) => {
  if (a.type === 'civDemocracy' || a.type === 'passIndulgence') { if (run === 0) start = i; run++; }
  else { if (run > 6) counts.push(run); if (run > best.len) best = { start, len: run }; run = 0; }
});
console.log('players', config.players.map((p: any) => p.name ?? p).join(','), '| moves', actions.length, '| back-and-forth runs longer than 6 moves:', counts.length, '| longest', best.len, 'moves starting at move', best.start, '| run lengths', JSON.stringify(counts.slice(0, 30)));
if (best.len > 6) {
  for (let i = 0; i < best.start; i++) state = library.apply(state, actions[i]).state;
  console.log('at move', best.start, ': phase', JSON.stringify(state.phase).slice(0, 260), '| turn', state.turn.number, 'round', state.turn.round);
  console.log('the first 14 moves of that run:', actions.slice(best.start, best.start + 14).map((a: any) => `${a.type}${a.dice ? ':' + a.dice : ''}(${a.player})`).join(' '));
  console.log('how it ended:', actions.slice(best.start + best.len - 3, best.start + best.len + 2).map((a: any) => `${a.type}${a.dice ? ':' + a.dice : ''}(${a.player})`).join(' '));
  // Both players choose the quiet option every time: does it ever end?
  let s = state;
  let asked = 0;
  let i = 0;
  for (; i < 200; i++) {
    const w = library.waitingOn(s);
    if (!w.length) break;
    const legal = library.legalActions(s, w[0]!);
    const a = legal.find((x: any) => x.type === 'passIndulgence') ?? legal.find((x: any) => x.type === 'civDemocracy' && x.dice === 'keep');
    if (!a) break;
    if (a.type === 'civDemocracy') asked++;
    s = library.apply(s, a).state;
  }
  console.log(`if Greece always keeps the dice and the card holder always passes: after ${i} moves the phase is ${s.phase.id}; Greece was asked ${asked} times about one roll`);
  // The turn timer on that loop.
  let t = state;
  let k = 0;
  const rand = () => 0.5;
  for (; k < 200; k++) {
    const seat = timedSeats(t).find((x: number) => timeoutAction(t, x, rand));
    if (seat === undefined) break;
    const a = timeoutAction(t, seat, rand)!;
    if (a.type !== 'civDemocracy' && a.type !== 'passIndulgence') break;
    t = library.apply(t, a).state;
  }
  console.log(`the turn timer's safe moves for both seats: ${k} moves later the phase is ${t.phase.id}`);
}
