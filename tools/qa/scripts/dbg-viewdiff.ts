/**
 * Which moves does the server allow that a player's own browser (and a bot, which plans on the
 * same hidden-hands view) cannot see? Plays bot games and, before every move, compares the legal
 * moves from the full state with the legal moves from the acting seat's view.
 * Usage: tsx dbg-viewdiff.ts <specs.json> <out.json> [maxSpecs] [maxRounds]
 */
import { writeFileSync } from 'node:fs';
import { library, buildConfig, chooseAction, newMemory, DEFAULT_SETTINGS, DEFAULT_OPTIONS, cleanSettings } from './sim-core.ts';
const engine = await import(`${process.env.REPO ?? '../../..'}/packages/engine/src/index.ts`);
const [specFile, outFile, maxSpecsArg, maxRoundsArg] = process.argv.slice(2);
const all = (await import(`./${specFile}`, { with: { type: 'json' } })).default as any[];
// One spec per set of modules and board family, to cover every rule set once.
const seenKey = new Set<string>();
const specs: any[] = [];
for (const s of all) {
  const k = s.name.replace(/\|\dp.*$/, '');
  if (seenKey.has(k)) continue;
  seenKey.add(k);
  specs.push(s);
}
const maxSpecs = Number(maxSpecsArg ?? 60);
const maxRounds = Number(maxRoundsArg ?? 40);
const STYLES = ['balanced', 'builder', 'city', 'army', 'trader'];
const hash = (s: string) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const rng = (seed: number) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const key = (a: any) => JSON.stringify(a, Object.keys(a).sort());
const out: any = { games: 0, steps: 0, missingInView: {}, extraInView: {}, examples: {}, perGame: [] };
const t0 = Date.now();
for (const spec of specs.slice(0, maxSpecs)) {
  const names = Array.from({ length: spec.players }, (_, i) => `P${i + 1}`);
  const settings = cleanSettings({ ...DEFAULT_SETTINGS, ...spec.settings, options: { ...DEFAULT_OPTIONS, ...(spec.settings.options ?? {}) }, maxPlayers: spec.players });
  let state: any;
  try {
    state = library.createGame(buildConfig(settings, names, spec.seed)).state;
  } catch (e) {
    out.perGame.push({ name: spec.name, error: String((e as Error).message) });
    continue;
  }
  const rand = rng(hash(spec.seed) || 1);
  const memory = names.map(() => newMemory());
  const bots = names.map((_, i) => ({ level: 'medium', style: STYLES[(i * 3 + spec.players) % STYLES.length]! }));
  let clock = 0;
  const g: any = { name: spec.name, modules: state.modules, steps: 0, missing: {}, extra: {} };
  const tg = Date.now();
  for (let n = 0; n < 20000 && state.winner === null && state.turn.round < maxRounds && Date.now() - tg < 90_000; n++) {
    clock += 1000;
    const waiting: number[] = library.waitingOn(state);
    if (!waiting.length) break;
    let moved = false;
    for (const seat of [...waiting].sort(() => rand() - 0.5)) {
      // Compare what this seat may do with what its own view says it may do.
      try {
        const full = library.legalActions(state, seat);
        const view = library.legalActions(engine.stateFromView(library.view(state, seat)), seat);
        const fk = new Set(full.map(key));
        const vk = new Set(view.map(key));
        for (const a of full) if (!vk.has(key(a))) {
          g.missing[a.type] = (g.missing[a.type] ?? 0) + 1;
          out.missingInView[a.type] = (out.missingInView[a.type] ?? 0) + 1;
          (out.examples[`missing:${a.type}`] ??= []).length < 3 && out.examples[`missing:${a.type}`].push({ game: spec.name, phase: state.phase.id, action: a, reasonInView: library.check(engine.stateFromView(library.view(state, seat)), a) });
        }
        for (const a of view) if (!fk.has(key(a))) {
          g.extra[a.type] = (g.extra[a.type] ?? 0) + 1;
          out.extraInView[a.type] = (out.extraInView[a.type] ?? 0) + 1;
          (out.examples[`extra:${a.type}`] ??= []).length < 3 && out.examples[`extra:${a.type}`].push({ game: spec.name, phase: state.phase.id, action: a, reasonInFull: library.check(state, a) });
        }
      } catch (e) {
        g.error = String((e as Error).message);
      }
      g.steps++;
      const a = chooseAction(library, state, seat, bots[seat], memory[seat], { rand, now: clock, budgetMs: 300 });
      if (!a) continue;
      try { state = library.apply(state, a).state; } catch { continue; }
      moved = true;
      break;
    }
    if (!moved) break;
  }
  out.games++;
  out.steps += g.steps;
  g.rounds = state.turn.round;
  out.perGame.push(g);
  writeFileSync(outFile, JSON.stringify(out, null, 1));
  console.log(`${((Date.now() - t0) / 1000).toFixed(0)}s ${spec.name} steps ${g.steps} missing ${JSON.stringify(g.missing)} extra ${JSON.stringify(g.extra)}${g.error ? ' ERROR ' + g.error : ''}`);
}
console.log('TOTAL games', out.games, 'steps', out.steps, '\n missing in the view:', JSON.stringify(out.missingInView), '\n extra in the view:', JSON.stringify(out.extraInView));
