/**
 * Plays a bot game and, as it goes, replays the saved moves from the start to find the first
 * move after which a replay no longer matches the live game. Usage: tsx dbg-replay.ts <modes,comma> [seed] [players] [mapKind:id]
 */
import { library, buildConfig, cleanSettings, DEFAULT_SETTINGS, DEFAULT_OPTIONS, chooseAction, newMemory } from './sim-core.ts';
const modes = (process.argv[2] ?? 'citiesKnights,greedWealthPower').split(',').filter(Boolean);
const seed = process.argv[3] ?? 'replay-1';
const players = Number(process.argv[4] ?? 4);
const mapArg = process.argv[5] ?? 'random:classic';
const [kind, id] = mapArg.split(':');
const map = kind === 'random' ? { kind, mode: id } : { kind, id };
const settings = cleanSettings({ ...DEFAULT_SETTINGS, map, options: { ...DEFAULT_OPTIONS }, maxPlayers: players, ...Object.fromEntries(modes.map((m) => [m, true])) });
const names = ['A', 'B', 'C', 'D', 'E', 'F'].slice(0, players);
const config = buildConfig(settings, names, seed);
console.log('modules', config.modules.join(','));
let rs = 12345;
const rand = () => ((rs = (rs * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
let state = library.createGame(config).state;
const actions: any[] = [];
const mem = names.map(() => newMemory());
const replay = (upto: number) => { let s = library.createGame(config).state; for (const a of actions.slice(0, upto)) s = library.apply(s, a).state; return s; };
const diff = (a: any, b: any, path: string, out: string[]) => {
  if (out.length > 14) return;
  if (JSON.stringify(a) === JSON.stringify(b)) return;
  if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    const ka = Object.keys(a).join(','); const kb = Object.keys(b).join(',');
    if (ka !== kb && [...keys].every((k) => JSON.stringify(a[k]) === JSON.stringify(b[k]))) { out.push(`${path}: same content, different key order: live [${ka.slice(0, 120)}] replay [${kb.slice(0, 120)}]`); return; }
    for (const k of keys) diff(a[k], b[k], `${path}.${k}`, out);
  } else out.push(`${path}: live ${JSON.stringify(a)?.slice(0, 160)} | replay ${JSON.stringify(b)?.slice(0, 160)}`);
};
let clock = 0;
let found = false;
for (let n = 0; n < 4000 && state.winner === null; n++) {
  clock += 1000;
  const waiting = library.waitingOn(state);
  if (!waiting.length) { console.log('nobody can act'); break; }
  let acted = false;
  for (const seat of waiting) {
    const a = chooseAction(library, state, seat, { level: 'medium', style: 'balanced' } as any, mem[seat], { rand, now: clock, budgetMs: 100 });
    if (!a) continue;
    let r: any;
    try { r = library.apply(state, a); } catch { continue; }
    state = r.state; actions.push(a); acted = true;
    const rep = replay(actions.length);
    if (JSON.stringify(rep) !== JSON.stringify(state)) {
      const out: string[] = [];
      diff(state, rep, 'state', out);
      console.log(`first mismatch after move ${actions.length}: ${JSON.stringify(a).slice(0, 300)} (phase before -> now ${state.phase.id}, turn ${state.turn.number})`);
      console.log(out.join('\n'));
      // Does a second replay match the first replay?
      const rep2 = replay(actions.length);
      console.log('two replays agree with each other:', JSON.stringify(rep2) === JSON.stringify(rep));
      // Is it the last move alone? Apply it to a replay of the moves before it.
      const prev = replay(actions.length - 1);
      console.log('replay of the moves before it matches the live state before it: (checked each move, so yes)');
      const again = library.apply(prev, a).state;
      console.log('applying the move to that replay gives the replay state:', JSON.stringify(again) === JSON.stringify(rep), '| gives the live state:', JSON.stringify(again) === JSON.stringify(state));
      found = true;
      break;
    }
    break;
  }
  if (found) break;
  if (!acted) { console.log('no bot move'); break; }
}
if (!found) console.log('no mismatch in', actions.length, 'moves; winner', state.winner);
