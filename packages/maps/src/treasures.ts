import {
  buildGeometry,
  hexDistance,
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
    | 'treasure-islands'
    | 'into-the-unknown'
    | 'greater-catan'
    | 'desert-dragons'
    | 'enchanted-land'
    | 'great-canal';
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
  {
    id: 'great-canal',
    name: 'The Great Canal',
    description:
      'With Cities & Knights. Drought has dried out the farmland in the west. Two active knights beside a marked hex dig the next stretch of canal from the mountain lake; once it is done the basin floods and the fields grow grain again. Knights on the small islands pan for gold or run a harbor.',
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
  'great-canal': {
    layout: 'newShores',
    players: { min: 3, max: 6 },
    vpTarget: () => 18,
    islandBonus: 0,
    fog: false,
    homeDeserts: 1,
    homeSize: (n) => (n > 4 ? 32 : 26),
    outerSizes: (n) => (n > 4 ? [3, 3, 3, 3, 2] : [3, 3, 3, 2]),
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

// ---- The Great Canal ----

interface CanalPlan {
  lake: HexId;
  basin: HexId;
  /** Canal hexes in order, from the lake to the basin. */
  path: HexId[];
}

const CANAL_MIN = 5;
const CANAL_MAX = 7;
const dist = (a: HexId, b: HexId) => hexDistance(parseHexId(a), parseHexId(b));
const east = (h: HexId) => {
  const { q, r } = parseHexId(h);
  return 2 * q + r;
};

/** A mountain lake in the east, a dry basin in the west, and a winding canal between. */
function planCanal(rng: Rng, homeList: HexId[]): CanalPlan | null {
  const home = new Set(homeList);
  const inland = homeList.filter((h) => neighbours(h).every((n) => home.has(n)));
  if (inland.length < 2) return null;
  const byEast = [...inland].sort((a, b) => east(a) - east(b) || (a < b ? -1 : 1));
  const wests = byEast.slice(0, 3);
  const easts = byEast.slice(-3).reverse();
  for (const lake of easts) {
    for (const basin of rng.shuffle(wests)) {
      if (lake === basin || dist(lake, basin) < 3) continue;
      const path = canalPath(rng, home, lake, basin);
      if (path) return { lake, basin, path };
    }
  }
  return null;
}

/** A random single-line path of canal hexes, never touching itself. */
function canalPath(rng: Rng, home: Set<HexId>, lake: HexId, basin: HexId): HexId[] | null {
  let budget = 4000;
  const path: HexId[] = [];
  const dfs = (cur: HexId): boolean => {
    if (budget-- <= 0) return false;
    // Once beside the basin, the canal runs straight into it.
    if (cur !== lake && neighbours(cur).includes(basin)) return path.length >= CANAL_MIN;
    for (const n of rng.shuffle(neighbours(cur))) {
      if (n === basin || !home.has(n) || n === lake || path.includes(n)) continue;
      if (path.length >= CANAL_MAX) continue;
      if (neighbours(n).some((m) => m !== cur && (m === lake || path.includes(m)))) continue;
      if (dist(n, basin) - 1 > CANAL_MAX - path.length - 1) continue;
      path.push(n);
      if (dfs(n)) return true;
      path.pop();
    }
    return false;
  };
  return dfs(lake) ? [...path] : null;
}

type MapHex = SpecialBoard['map']['hexes'][number];

function digCanal(
  rng: Rng,
  map: SpecialBoard['map'],
  homeList: HexId[],
  gold: HexId[],
  plan: CanalPlan,
): void {
  const byId = new Map<HexId, MapHex>(map.hexes.map((h) => [hexId(h.q, h.r), h]));
  const home = new Set(homeList);
  const at = (h: HexId) => byId.get(h)!;

  // The home desert moves to the basin, trading places with whatever was there.
  const basin = at(plan.basin);
  const desert = homeList.map(at).find((h) => h.type === 'desert' && h !== basin);
  if (desert) {
    desert.type = basin.type;
    if (basin.token !== undefined) desert.token = basin.token;
  }
  basin.type = 'desert';
  delete basin.token;
  basin.props = { ...basin.props, basin: true };

  const lake = at(plan.lake);
  lake.type = 'lake';
  delete lake.token;

  plan.path.forEach((h, i) => {
    const hex = at(h);
    hex.props = { ...hex.props, canal: 'dig', canalStep: i };
  });

  // The fields around the basin are the dry farmland; the home island grows no other grain.
  const canalSet = new Set(plan.path);
  const farmland = neighbours(plan.basin).filter(
    (h) => home.has(h) && h !== plan.lake && !canalSet.has(h),
  );
  const swap = ['forest', 'pasture', 'hills'];
  let k = rng.int(0, 2);
  for (const h of homeList) {
    const hex = at(h);
    if (farmland.includes(h)) {
      hex.type = 'fields';
      hex.props = { ...hex.props, farmland: true };
    } else if (hex.type === 'fields') hex.type = swap[k++ % 3]!;
  }

  // A mountain lake: at least two mountains on its shore.
  const shore = neighbours(plan.lake).filter(
    (h) => home.has(h) && !canalSet.has(h) && !farmland.includes(h) && h !== plan.basin,
  );
  let peaks = shore.filter((h) => at(h).type === 'mountains').length;
  for (const h of rng.shuffle(shore)) {
    if (peaks >= 2) break;
    if (at(h).type === 'mountains') continue;
    at(h).type = 'mountains';
    peaks++;
  }

  for (const h of gold) {
    const hex = byId.get(h);
    if (hex?.type === 'gold') hex.props = { ...hex.props, goldRiver: true };
  }

  map.pieces = (map.pieces ?? []).map((p) =>
    p.type === 'robber' ? { ...p, at: { kind: 'hex' as const, id: plan.basin } } : p,
  );
  if (!map.pieces.some((p) => p.type === 'robber'))
    map.pieces.push({ type: 'robber', at: { kind: 'hex', id: plan.basin } });
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
  // The Great Canal needs room on the home island for a long canal.
  let canal: CanalPlan | null = null;
  if (spec.id === 'great-canal') {
    const crng = Rng.fromSeed(`canal:${opts.players}:${opts.seed}`);
    for (let tries = 1; tries < 40; tries++) {
      canal = planCanal(crng, sea.info.home ?? []);
      if (canal) break;
      sea = build(`${opts.seed}~${tries}`);
    }
    if (!canal) throw new Error('Could not lay out The Great Canal');
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

  if (canal) digCanal(rng, map, sea.info.home ?? [], sea.info.gold, canal);

  // Into the Unknown, Desert Dragons, the Enchanted Land and the Great Canal have no pirate.
  if (spec.id !== 'treasure-islands' && spec.id !== 'greater-catan')
    map.pieces = (map.pieces ?? []).filter((p) => p.type !== 'pirate');

  // The host's points target applies; the module adds the scenario's extra points.
  const settings = { ...sea.settings };
  delete settings.vpTarget;
  return {
    map,
    // The canal's mountain lake is the special maps' lake hex.
    modules: ['base', 'seafarers', ...(canal ? ['special-maps'] : []), 'treasures-dragons'],
    settings: { ...settings, tdaScenario: spec.id, treasureStack: stack, tokenSupply },
  };
}
