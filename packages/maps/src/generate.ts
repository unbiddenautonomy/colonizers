import { Rng, type EdgeId, type Harbor, type MapSpec } from '@colonizers/engine';
import {
  componentsFor,
  expandTerrain,
  expandTokens,
  RESOURCE_OF,
  type ComponentSet,
} from './components.ts';
import { shapeInfo, type Layout, type ShapeInfo } from './layout.ts';
import { reportFor, ALL_RULES, type FairnessReport } from './report.ts';
import { brokenRules, terrainOk, tokenConflicts, type RuleSet } from './rules.ts';
import { DEFAULT_WEIGHTS, scoreParts, totalScore, type ScoreWeights } from './score.ts';
import { seaFrame, shapeFor, SHAPES, type Coord, type ShapeName } from './shapes.ts';

export type Mode = 'classic' | 'balanced' | 'wild' | 'custom';

export const MODES: Record<Mode, { name: string; description: string }> = {
  classic: {
    name: 'Classic',
    description: 'Random terrain and numbers; 6s and 8s never touch, like the official rules.',
  },
  balanced: {
    name: 'Balanced',
    description: 'Classic plus fairness rules and a search for even starting spots.',
  },
  wild: { name: 'Wild', description: 'Fully random. Even red numbers may touch.' },
  custom: { name: 'Custom', description: 'Pick the rules and resource mix yourself.' },
};

export interface CustomOptions {
  /** Which hard rules to enforce. */
  rules?: RuleSet;
  /** Terrain counts, e.g. more mountains for "more ore". Must fill the board exactly. */
  terrain?: Record<string, number>;
  /** Run the fairness search like Balanced does. */
  optimize?: boolean;
  weights?: Partial<ScoreWeights>;
}

export interface GenerateOptions {
  seed: string;
  players: number;
  mode?: Mode;
  shape?: ShapeName | Coord[];
  components?: ComponentSet;
  custom?: CustomOptions;
  /** Swaps tried by the fairness search. */
  iterations?: number;
}

export interface GeneratedBoard {
  map: MapSpec;
  mode: Mode;
  seed: string;
  rules: RuleSet;
  report: FairnessReport;
}

export function rulesFor(mode: Mode, custom?: CustomOptions): RuleSet {
  switch (mode) {
    case 'classic':
      return { redApart: true };
    case 'wild':
      return {};
    case 'balanced':
      return { ...ALL_RULES };
    case 'custom':
      return { ...custom?.rules };
  }
}

function placeTerrain(
  info: ShapeInfo,
  terrain: string[],
  rules: RuleSet,
  rng: Rng,
): string[] | null {
  for (let attempt = 0; attempt < 50; attempt++) {
    const t = rng.shuffle(terrain);
    const layout: Layout = { terrain: t, tokens: [] };
    for (let k = 0; k < 400 && !terrainOk(info, layout, rules); k++) {
      const i = rng.int(0, t.length - 1);
      const j = rng.int(0, t.length - 1);
      [t[i], t[j]] = [t[j] as string, t[i] as string];
      if (!terrainOk(info, layout, rules) && rng.nextFloat() < 0.7) {
        // Mostly keep swaps that help; undo the rest.
        [t[i], t[j]] = [t[j] as string, t[i] as string];
      }
    }
    if (terrainOk(info, layout, rules)) return t;
  }
  return null;
}

function totalConflicts(info: ShapeInfo, layout: Layout, rules: RuleSet): number {
  let n = 0;
  for (let i = 0; i < layout.tokens.length; i++) n += tokenConflicts(info, layout, rules, i);
  return n;
}

function placeTokens(
  info: ShapeInfo,
  terrain: string[],
  tokens: number[],
  rules: RuleSet,
  rng: Rng,
): Layout | null {
  const slots = terrain.flatMap((t, i) => (RESOURCE_OF[t] ? [i] : []));
  if (slots.length !== tokens.length)
    throw new Error(`${slots.length} producing hexes but ${tokens.length} tokens`);
  const shuffled = rng.shuffle(tokens);
  const layout: Layout = { terrain, tokens: terrain.map(() => null) };
  slots.forEach((s, k) => (layout.tokens[s] = shuffled[k] as number));

  let conflicts = totalConflicts(info, layout, rules);
  for (let k = 0; k < 2000 && conflicts > 0; k++) {
    const bad = slots.filter((s) => tokenConflicts(info, layout, rules, s) > 0);
    const i = bad[rng.int(0, bad.length - 1)] as number;
    const j = slots[rng.int(0, slots.length - 1)] as number;
    [layout.tokens[i], layout.tokens[j]] = [layout.tokens[j] ?? null, layout.tokens[i] ?? null];
    const after = totalConflicts(info, layout, rules);
    if (after <= conflicts || rng.nextFloat() < 0.05) conflicts = after;
    else
      [layout.tokens[i], layout.tokens[j]] = [layout.tokens[j] ?? null, layout.tokens[i] ?? null];
  }
  return brokenRules(info, layout, rules).length === 0 ? layout : null;
}

function placeHarbors(info: ShapeInfo, kinds: string[], rng: Rng): Harbor[] {
  const coast = info.coast;
  const n = kinds.length;
  const offset = rng.int(0, coast.length - 1);
  const types = rng.shuffle(kinds);
  return types.map((resource, i) => ({
    edge: (coast[(offset + Math.floor((i * coast.length) / n)) % coast.length] as { edge: EdgeId })
      .edge,
    resource,
    ratio: resource === 'any' ? 3 : 2,
  }));
}

function optimize(
  info: ShapeInfo,
  start: Layout,
  harbors: Harbor[],
  players: number,
  rules: RuleSet,
  weights: ScoreWeights,
  iterations: number,
  rng: Rng,
): { layout: Layout; harbors: Harbor[] } {
  const layout: Layout = { terrain: [...start.terrain], tokens: [...start.tokens] };
  let hs = harbors.map((h) => ({ ...h }));
  let score = totalScore(scoreParts(info, layout, players, hs), weights);
  const slots = layout.terrain.flatMap((t, i) => (RESOURCE_OF[t] ? [i] : []));
  for (let k = 0; k < iterations; k++) {
    const roll = rng.nextFloat();
    const i = slots[rng.int(0, slots.length - 1)] as number;
    const j = slots[rng.int(0, slots.length - 1)] as number;
    if (i === j) continue;
    let undo: () => void;
    if (roll < 0.65) {
      [layout.tokens[i], layout.tokens[j]] = [layout.tokens[j] ?? null, layout.tokens[i] ?? null];
      undo = () =>
        ([layout.tokens[i], layout.tokens[j]] = [
          layout.tokens[j] ?? null,
          layout.tokens[i] ?? null,
        ]);
    } else if (roll < 0.9) {
      [layout.terrain[i], layout.terrain[j]] = [
        layout.terrain[j] as string,
        layout.terrain[i] as string,
      ];
      undo = () =>
        ([layout.terrain[i], layout.terrain[j]] = [
          layout.terrain[j] as string,
          layout.terrain[i] as string,
        ]);
    } else {
      const a = rng.int(0, hs.length - 1);
      const b = rng.int(0, hs.length - 1);
      const prev = hs.map((h) => ({ ...h }));
      const ra = (hs[a] as Harbor).resource;
      (hs[a] as Harbor).resource = (hs[b] as Harbor).resource;
      (hs[b] as Harbor).resource = ra;
      hs = hs.map((h) => ({ ...h, ratio: h.resource === 'any' ? 3 : 2 }));
      undo = () => (hs = prev);
    }
    if (brokenRules(info, layout, rules).length) {
      undo();
      continue;
    }
    const next = totalScore(scoreParts(info, layout, players, hs), weights);
    if (next <= score) score = next;
    else undo();
  }
  return { layout, harbors: hs };
}

/** Generates a board. The same options always give the same board. */
export function generateBoard(options: GenerateOptions): GeneratedBoard {
  const mode = options.mode ?? 'classic';
  const players = options.players;
  const coords =
    typeof options.shape === 'object'
      ? options.shape
      : SHAPES[options.shape ?? shapeFor(players)]();
  const info = shapeInfo(coords);
  const components = options.components ?? componentsFor(players);
  const rules = rulesFor(mode, options.custom);
  const terrainCounts = options.custom?.terrain ?? components.terrain;
  const terrain = expandTerrain(terrainCounts);
  if (terrain.length !== coords.length) {
    throw new Error(`Terrain has ${terrain.length} hexes but the board has ${coords.length}`);
  }
  const producing = terrain.filter((t) => RESOURCE_OF[t]).length;
  let tokens = expandTokens(components.tokens);
  if (tokens.length !== producing) {
    // Custom terrain with a different number of deserts: trim or repeat the token list evenly.
    const pool = expandTokens(components.tokens);
    tokens = Array.from(
      { length: producing },
      (_, k) => pool[Math.floor((k * pool.length) / producing)] as number,
    );
  }
  const harborKinds = expandTerrain(components.harbors);
  const rng = Rng.fromSeed(`board:${mode}:${options.seed}`);

  let layout: Layout | null = null;
  for (let attempt = 0; attempt < 200 && !layout; attempt++) {
    const t = placeTerrain(info, terrain, rules, rng);
    if (t) layout = placeTokens(info, t, tokens, rules, rng);
  }
  if (!layout) throw new Error(`Could not make a ${mode} board that passes its rules`);
  let harbors = placeHarbors(info, harborKinds, rng);

  if (mode === 'balanced' || (mode === 'custom' && options.custom?.optimize)) {
    const weights = { ...DEFAULT_WEIGHTS, ...options.custom?.weights };
    const best = optimize(
      info,
      layout,
      harbors,
      players,
      rules,
      weights,
      options.iterations ?? 1500,
      rng,
    );
    layout = best.layout;
    harbors = best.harbors;
  }

  const hexes: MapSpec['hexes'] = coords.map((c, i) => {
    const token = layout.tokens[i];
    return { q: c.q, r: c.r, type: layout.terrain[i] as string, ...(token ? { token } : {}) };
  });
  for (const c of seaFrame(coords)) hexes.push({ q: c.q, r: c.r, type: 'sea' });
  const desert = coords.find((_, i) => layout.terrain[i] === 'desert');
  const map: MapSpec = {
    hexes,
    harbors,
    pieces: desert
      ? [{ type: 'robber', at: { kind: 'hex', id: `h:${desert.q},${desert.r}` } }]
      : [],
  };
  return {
    map,
    mode,
    seed: options.seed,
    rules,
    report: reportFor(info, layout, players, harbors),
  };
}

export function layoutOf(map: MapSpec): { info: ShapeInfo; layout: Layout } {
  const land = map.hexes.filter((h) => RESOURCE_OF[h.type] || h.type === 'desert');
  return {
    info: shapeInfo(land.map((h) => ({ q: h.q, r: h.r }))),
    layout: { terrain: land.map((h) => h.type), tokens: land.map((h) => h.token ?? null) },
  };
}
