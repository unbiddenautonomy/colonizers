import {
  buildGeometry,
  hexDistance,
  hexId,
  Rng,
  type CornerId,
  type EdgeId,
  type HexId,
  type MapSpec,
} from '@colonizers/engine';
import { generateBoard } from './generate.ts';
import type { SpecialBoard } from './special.ts';

/**
 * Traders & Barbarians scenarios, on our own generated boards. Each one is
 * the base game's board with the scenario's pieces added, so every seed
 * gives a new layout.
 */
export interface TbScenarioInfo {
  id: 'fishermen' | 'rivers';
  name: string;
  description: string;
  players: { min: number; max: number };
}

export const TB_SCENARIOS: TbScenarioInfo[] = [
  {
    id: 'fishermen',
    name: 'Fishermen',
    description:
      'Fishing grounds off the coast and a lake in the middle pay fish. Spend fish on small favours, and watch out for the old boot.',
    players: { min: 3, max: 8 },
  },
  {
    id: 'rivers',
    name: 'Rivers',
    description:
      'Rivers cross the island. Bridges and building by the water pay gold: the richest player gains a point, the poorest lose two.',
    players: { min: 3, max: 8 },
  },
];

export function tbScenarioById(id: string): TbScenarioInfo | undefined {
  return TB_SCENARIOS.find((s) => s.id === id);
}

const SHOAL_NUMBERS = [4, 10, 5, 9, 6, 8, 4, 10, 5, 9];
const LAKE_NUMBERS = [
  [2, 3, 11, 12],
  [2, 12],
  [3, 11],
];

function fishermen(map: MapSpec, players: number, rng: Rng): void {
  const deserts = map.hexes.filter((h) => h.type === 'desert');
  const lakeNumbers = deserts.length === 1 ? [LAKE_NUMBERS[0]!] : LAKE_NUMBERS.slice(1);
  deserts.forEach((h, i) => {
    h.type = 'fishingLake';
    delete h.token;
    h.props = { tokens: lakeNumbers[i % lakeNumbers.length] };
  });
  // The robber waits beside the board until the first 7.
  map.pieces = [];

  const land = new Set(map.hexes.filter((h) => h.type !== 'sea').map((h) => hexId(h.q, h.r)));
  const g = buildGeometry(map.hexes.map((h) => hexId(h.q, h.r)));
  const harborHexes = new Set<HexId>();
  for (const hb of map.harbors ?? [])
    for (const h of g.edgeHexes.get(hb.edge) ?? []) if (!land.has(h)) harborHexes.add(h);
  const landAround = (id: HexId) => (g.hexNeighbours.get(id) ?? []).filter((n) => land.has(n));
  const sea = map.hexes.filter((h) => h.type === 'sea');
  // Best spots first: touching two or more land hexes, away from harbors.
  const ranked = rng
    .shuffle(sea)
    .map((h) => {
      const id = hexId(h.q, h.r);
      return { h, score: Math.min(landAround(id).length, 2) * 2 - (harborHexes.has(id) ? 1 : 0) };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  const want = players >= 7 ? 10 : players >= 5 ? 8 : 6;
  const picked: typeof sea = [];
  for (const gap of [3, 2]) {
    for (const { h } of ranked) {
      if (picked.length >= want) break;
      if (picked.includes(h) || picked.some((p) => hexDistance(p, h) < gap)) continue;
      picked.push(h);
    }
  }
  picked.forEach((h, i) => {
    h.type = 'shoal';
    h.token = SHOAL_NUMBERS[i % SHOAL_NUMBERS.length]!;
  });
}

function rivers(map: MapSpec, players: number, rng: Rng): void {
  for (const h of map.hexes) if (h.type === 'desert') h.type = 'swamp';
  // A second swamp on a 2 or 12, so the marsh is where little grows anyway.
  const rare = rng.shuffle(map.hexes.filter((h) => h.token === 2 || h.token === 12))[0];
  if (rare) {
    rare.type = 'swamp';
    delete rare.token;
  }
  const ids = map.hexes.map((h) => hexId(h.q, h.r));
  const land = new Set(map.hexes.filter((h) => h.type !== 'sea').map((h) => hexId(h.q, h.r)));
  const g = buildGeometry(ids);
  const coastal = (c: CornerId) => {
    const hs = g.cornerHexes.get(c) ?? [];
    return hs.length < 3 || hs.some((h) => !land.has(h));
  };
  const inland = (e: EdgeId) => (g.edgeHexes.get(e) ?? []).filter((h) => land.has(h)).length === 2;
  const used = new Set<CornerId>();
  const lengths = players >= 5 ? [4, 5, 5] : [4, 5];
  const edges: EdgeId[] = [];
  for (const length of lengths) {
    for (let attempt = 0; attempt < 300; attempt++) {
      const starts = g.corners.filter(
        (c) => coastal(c) && !used.has(c) && (g.cornerEdges.get(c) ?? []).some((e) => inland(e)),
      );
      if (!starts.length) break;
      const first = starts[rng.int(0, starts.length - 1)]!;
      let at: CornerId = first;
      const path: EdgeId[] = [];
      const seen = new Set<CornerId>([at]);
      while (path.length < length) {
        const options: EdgeId[] = (g.cornerEdges.get(at) ?? []).filter((e) => {
          if (!inland(e) || path.includes(e)) return false;
          const [a, b] = g.edgeCorners.get(e)!;
          const next = a === at ? b : a;
          // Stay inland, never touch another river, never loop back.
          return (
            !coastal(next) &&
            !used.has(next) &&
            !seen.has(next) &&
            !(g.cornerNeighbours.get(next) ?? []).some((n) => used.has(n))
          );
        });
        if (!options.length) break;
        const e = options[rng.int(0, options.length - 1)]!;
        const [a, b]: readonly [CornerId, CornerId] = g.edgeCorners.get(e)!;
        at = a === at ? b : a;
        seen.add(at);
        path.push(e);
      }
      if (path.length < length) continue;
      for (const c of seen) used.add(c);
      edges.push(...path);
      break;
    }
  }
  map.pieces = [
    ...(map.pieces ?? []),
    ...edges.map((id) => ({ type: 'river', at: { kind: 'edge' as const, id } })),
  ];
}

/** Generates a Traders & Barbarians board. The same options always give the same board. */
export function generateTbBoard(opts: {
  seed: string;
  players: number;
  scenario: string;
}): SpecialBoard {
  const spec = tbScenarioById(opts.scenario);
  if (!spec) throw new Error(`Unknown Traders & Barbarians scenario "${opts.scenario}"`);
  const rng = Rng.fromSeed(`tb:${spec.id}:${opts.players}:${opts.seed}`);
  const map = generateBoard({ seed: opts.seed, players: opts.players, mode: 'classic' }).map;
  if (spec.id === 'fishermen') fishermen(map, opts.players, rng);
  else rivers(map, opts.players, rng);
  return {
    map,
    modules: ['base', 'traders-barbarians'],
    settings: { tbScenario: spec.id },
  };
}
