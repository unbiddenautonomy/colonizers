import {
  buildGeometry,
  hexId,
  parseHexId,
  Rng,
  type CornerId,
  type HexId,
} from '@colonizers/engine';
import { buildSeaBoard, type SeaScenario } from './seafarers.ts';
import type { SpecialBoard } from './special.ts';

/**
 * Treasures, Dragons & Adventurers scenarios on our own generated Seafarers
 * boards: treasure chests on the corners out at sea, fog to explore, and a
 * home island with three deserts where dragons gather.
 */
export interface TdaScenarioInfo {
  id:
    'treasure-islands' | 'into-the-unknown' | 'greater-catan' | 'desert-dragons' | 'enchanted-land';
  name: string;
  description: string;
  players: { min: number; max: number };
  /** Needs Cities & Knights. */
  citiesKnights?: boolean;
}

export const TDA_SCENARIOS: TdaScenarioInfo[] = [
  {
    id: 'treasure-islands',
    name: 'Treasure Islands',
    description:
      'Fog hides the islands around your home. Build next to a treasure chest to open it, and find a treasure in every empty sea or desert you uncover.',
    players: { min: 3, max: 6 },
  },
  {
    id: 'into-the-unknown',
    name: 'Into the Unknown',
    description:
      'A small home island and a sea of tiny islands under fog, with treasure chests scattered everywhere. Explore fast: there is no pirate.',
    players: { min: 3, max: 6 },
  },
  {
    id: 'greater-catan',
    name: 'Greater Catan',
    description:
      'The new islands have no numbers. Reach one and it takes a number from the pile; once the pile runs out, numbers move over from the home island. A long game to 18 points, with 4 extra cities each.',
    players: { min: 3, max: 6 },
  },
  {
    id: 'desert-dragons',
    name: 'Desert Dragons',
    description:
      'Every new building wakes more dragons in the three deserts. Once they are all awake they spread across the island, blocking hexes, roads and towns. Knight cards drive them out; the island across the water is safe.',
    players: { min: 3, max: 6 },
  },
  {
    id: 'enchanted-land',
    name: 'Enchanted Land',
    description:
      'With Cities & Knights. Dragons guard a strange island with no roads. Ship one knight across, roam the land and fight the dragons: some fall to any knight, some only to the mighty. Six dragons win the game.',
    players: { min: 3, max: 6 },
    citiesKnights: true,
  },
];

export function tdaScenarioById(id: string): TdaScenarioInfo | undefined {
  return TDA_SCENARIOS.find((s) => s.id === id);
}

const SEA: Record<TdaScenarioInfo['id'], Omit<SeaScenario, 'id' | 'name' | 'description'>> = {
  'treasure-islands': {
    layout: 'fogIslands',
    players: { min: 3, max: 6 },
    vpTarget: () => 14,
    islandBonus: 1,
    fog: true,
    homeDeserts: 1,
    outerDeserts: 2,
  },
  'into-the-unknown': {
    layout: 'archipelago',
    players: { min: 3, max: 6 },
    vpTarget: () => 12,
    islandBonus: 0,
    fog: true,
    outerDeserts: 2,
  },
  'greater-catan': {
    layout: 'newShores',
    players: { min: 3, max: 6 },
    vpTarget: () => 18,
    islandBonus: 0,
    fog: false,
    homeDeserts: 1,
  },
  'enchanted-land': {
    layout: 'twoIslands',
    players: { min: 3, max: 6 },
    vpTarget: () => 18,
    islandBonus: 0,
    fog: false,
    homeDeserts: 1,
    outerDeserts: 4,
    outerSizes: (n) => [n > 4 ? 18 : 15],
    gold: 2,
  },
  'desert-dragons': {
    layout: 'twoIslands',
    players: { min: 3, max: 6 },
    vpTarget: () => 13,
    islandBonus: 0,
    fog: false,
    homeDeserts: 3,
  },
};

/** Treasure chests on the board, and how many wait face down beside it. */
function treasureCounts(id: TdaScenarioInfo['id'], players: number): [number, number] {
  const big = players > 4;
  if (id === 'treasure-islands') return [big ? 18 : 15, big ? 6 : 5];
  if (id === 'into-the-unknown') return players <= 3 ? [17, 3] : big ? [24, 2] : [20, 0];
  return [0, 0];
}

function neighbours(id: HexId): HexId[] {
  const { q, r } = parseHexId(id);
  return [
    hexId(q + 1, r),
    hexId(q - 1, r),
    hexId(q, r + 1),
    hexId(q, r - 1),
    hexId(q + 1, r - 1),
    hexId(q - 1, r + 1),
  ];
}

/** Enough inland corners on the Enchanted Land for at least 8 dragons. */
const MIN_INLAND = 13;

function inlandCorners(hexes: { q: number; r: number }[], island: HexId[]): CornerId[] {
  const isle = new Set(island);
  const g = buildGeometry(hexes.map((h) => hexId(h.q, h.r)));
  return g.corners.filter((c) => {
    const hs = g.cornerHexes.get(c) ?? [];
    return hs.length === 3 && hs.every((h) => isle.has(h));
  });
}

export function generateTdaBoard(opts: {
  seed: string;
  players: number;
  scenario: string;
}): SpecialBoard {
  const spec = tdaScenarioById(opts.scenario);
  if (!spec)
    throw new Error(`Unknown Treasures, Dragons & Adventurers scenario "${opts.scenario}"`);
  const build = (seed: string) =>
    buildSeaBoard(
      { id: `tda-${spec.id}`, name: spec.name, description: spec.description, ...SEA[spec.id] },
      { seed, players: opts.players, scenario: spec.id },
    );
  let sea = build(opts.seed);
  // The Enchanted Land needs a round far island, with room inland for dragons and knights.
  for (let tries = 1; spec.id === 'enchanted-land' && tries < 30; tries++) {
    if (inlandCorners(sea.map.hexes, sea.info.islands[1] ?? []).length >= MIN_INLAND) break;
    sea = build(`${opts.seed}~${tries}`);
  }
  const map = sea.map;
  const rng = Rng.fromSeed(`tda:${spec.id}:${opts.players}:${opts.seed}`);
  const [onBoard, stack] = treasureCounts(spec.id, opts.players);

  if (onBoard > 0) {
    // Chests sit away from the home island, on corners next to fog or outer land.
    const ids = map.hexes.map((h) => hexId(h.q, h.r));
    const g = buildGeometry(ids);
    const byId = new Map(map.hexes.map((h) => [hexId(h.q, h.r), h]));
    const home = new Set(sea.info.home ?? []);
    const nearHome = new Set([...home].flatMap((h) => [h, ...neighbours(h)]));
    const interesting = (h: HexId) => {
      const hex = byId.get(h);
      return !!hex && !home.has(h) && (hex.hidden === true || hex.type !== 'sea');
    };
    const candidates = rng.shuffle(
      g.corners.filter((c) => {
        const hs = g.cornerHexes.get(c) ?? [];
        return hs.length === 3 && !hs.some((h) => nearHome.has(h)) && hs.some(interesting);
      }),
    );
    const taken = new Set<CornerId>();
    const chests: CornerId[] = [];
    for (const c of candidates) {
      if (chests.length >= onBoard) break;
      if (taken.has(c) || (g.cornerNeighbours.get(c) ?? []).some((n) => taken.has(n))) continue;
      taken.add(c);
      chests.push(c);
    }
    map.pieces = [
      ...(map.pieces ?? []),
      ...chests.map((id) => ({ type: 'treasure', at: { kind: 'corner' as const, id } })),
    ];
  }

  // Greater Catan: the new islands start bare, and a few of their numbers wait in a pile.
  let tokenSupply: number[] = [];
  if (spec.id === 'greater-catan') {
    const home = new Set(sea.info.home ?? []);
    const pool: number[] = [];
    for (const h of map.hexes) {
      if (home.has(hexId(h.q, h.r)) || h.token === undefined) continue;
      pool.push(h.token);
      delete h.token;
    }
    const size = opts.players <= 3 ? 4 : opts.players === 4 ? 5 : 6;
    tokenSupply = rng.shuffle(pool).slice(0, size);
  }

  // Enchanted Land: the far island is marked, and dragons wait on its inland corners.
  if (spec.id === 'enchanted-land') {
    const isle = new Set(sea.info.islands[1] ?? []);
    for (const h of map.hexes)
      if (isle.has(hexId(h.q, h.r))) h.props = { ...h.props, enchanted: true, noInventor: true };
    const inland = rng.shuffle(inlandCorners(map.hexes, [...isle]));
    // Leave about a third of the inland corners free for knights to stand on.
    const count = Math.min(19, Math.floor(inland.length * 0.65));
    const tiers = rng.shuffle([
      ...Array<number>(9).fill(1),
      ...Array<number>(6).fill(2),
      ...Array<number>(4).fill(3),
    ]);
    map.pieces = [
      ...(map.pieces ?? []),
      ...inland.slice(0, count).map((id, i) => ({
        type: 'dragon',
        at: { kind: 'corner' as const, id },
        props: { tier: tiers[i] ?? 1 },
      })),
    ];
  }

  // Into the Unknown, Desert Dragons and the Enchanted Land have no pirate.
  if (spec.id !== 'treasure-islands' && spec.id !== 'greater-catan')
    map.pieces = (map.pieces ?? []).filter((p) => p.type !== 'pirate');

  // The host's points target applies; the module adds the scenario's extra points.
  const settings = { ...sea.settings };
  delete settings.vpTarget;
  return {
    map,
    modules: ['base', 'seafarers', 'treasures-dragons'],
    settings: { ...settings, tdaScenario: spec.id, treasureStack: stack, tokenSupply },
  };
}
