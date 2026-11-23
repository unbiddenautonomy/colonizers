/**
 * Why do bots play so few progress cards? In Cities & Knights bot games, each time a bot holds
 * progress cards on its own turn: which cards are in hand, which plays are legal in its view,
 * and which of those can be tried out (applied) on that view, the way the bot scores a move.
 * Usage: tsx dbg-progress.ts [games]
 */
import { library, buildConfig, chooseAction, newMemory, DEFAULT_SETTINGS, DEFAULT_OPTIONS, cleanSettings } from './sim-core.ts';
const engine = await import(`${process.env.REPO ?? '../../..'}/packages/engine/src/index.ts`);
const N = Number(process.argv[2] ?? 6);
const STYLES = ['balanced', 'builder', 'city', 'army', 'trader'];
const hash = (s: string) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const rng = (seed: number) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const card: Record<string, { held: number; legal: number; tryOk: number; tryFail: number; fail: Record<string, number>; chosen: number }> = {};
const c = (k: string) => (card[k] ??= { held: 0, legal: 0, tryOk: 0, tryFail: 0, fail: {}, chosen: 0 });
let turnsWithCards = 0, turnsWithLegalPlay = 0, turnsWithTryable = 0, played = 0, returned = 0;
for (let g = 0; g < N; g++) {
  const names = ['P1', 'P2', 'P3', 'P4'];
  const settings = cleanSettings({ ...DEFAULT_SETTINGS, map: { kind: 'random', mode: 'classic' }, citiesKnights: true, options: { ...DEFAULT_OPTIONS }, maxPlayers: 4 });
  let state: any = library.createGame(buildConfig(settings, names, `progress-${g}`)).state;
  const rand = rng(hash(`progress-${g}`) || 1);
  const memory = names.map(() => newMemory());
  const bots = names.map((_, i) => ({ level: 'medium', style: STYLES[(i * 3 + 4) % 5]! }));
  let clock = 0;
  let lastTurnKey = '';
  for (let n = 0; n < 20000 && state.winner === null && state.turn.round < 60; n++) {
    clock += 1000;
    const waiting: number[] = library.waitingOn(state);
    if (!waiting.length) break;
    let moved = false;
    for (const seat of [...waiting].sort(() => rand() - 0.5)) {
      const vs = engine.stateFromView(library.view(state, seat));
      const held = Object.entries(vs.players[seat].held as Record<string, { card: string }[]>).filter(([d]) => d !== 'dev').flatMap(([, cs]) => cs.map((x) => x.card));
      const turnKey = `${g}:${state.turn.number}:${seat}`;
      if (state.phase.id === 'main' && seat === state.turn.player && held.length && turnKey !== lastTurnKey) {
        lastTurnKey = turnKey;
        turnsWithCards++;
        for (const k of new Set(held)) c(k).held++;
        const plays = library.legalActions(vs, seat).filter((a: any) => a.type === 'playProgress');
        const legalCards = new Set(plays.map((a: any) => a.card));
        if (legalCards.size) turnsWithLegalPlay++;
        const okCards = new Set<string>();
        const failCards = new Map<string, string>();
        for (const a of plays as any[]) {
          try { library.apply(vs, a); okCards.add(a.card); } catch (e) { failCards.set(a.card, String((e as Error).message).slice(0, 80)); }
        }
        if (okCards.size) turnsWithTryable++;
        for (const k of legalCards as Set<string>) {
          c(k).legal++;
          if (okCards.has(k)) c(k).tryOk++;
          else { c(k).tryFail++; const m = failCards.get(k) ?? '?'; c(k).fail[m] = (c(k).fail[m] ?? 0) + 1; }
        }
      }
      const a = chooseAction(library, state, seat, bots[seat], memory[seat], { rand, now: clock, budgetMs: 300 });
      if (!a) continue;
      try { state = library.apply(state, a).state; } catch { continue; }
      if (a.type === 'playProgress') { played++; c(a.card).chosen++; }
      if (a.type === 'returnProgress') returned++;
      moved = true;
      break;
    }
    if (!moved) break;
  }
  console.log(`game ${g}: rounds ${state.turn.round}, winner ${state.winner}`);
}
console.log(`bot turns holding progress cards: ${turnsWithCards}; with a legal play: ${turnsWithLegalPlay}; with a play that can be tried on the view: ${turnsWithTryable}; cards played ${played}, returned ${returned}`);
const rows = Object.entries(card).sort((a, b) => b[1].held - a[1].held);
for (const [k, v] of rows) console.log(`  ${k.padEnd(18)} held ${String(v.held).padStart(4)} | legal ${String(v.legal).padStart(4)} | try ok ${String(v.tryOk).padStart(4)} fail ${String(v.tryFail).padStart(4)} | played ${String(v.chosen).padStart(3)} ${Object.keys(v.fail).length ? '| ' + JSON.stringify(v.fail) : ''}`);
