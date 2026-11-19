import { hexDistance, hexEdges, hexId, Rng, type MapSpec } from '@colonizers/engine';
import { componentsFor } from './components.ts';
import { generateBoard } from './generate.ts';
import { hexagon, shapeFor, SHAPES, type Coord } from './shapes.ts';
import { generateTbBoard, TB_SCENARIOS } from './traders.ts';
import { generateTdaBoard, TDA_SCENARIOS } from './treasures.ts';
import { EP_SCENARIOS, generateEpBoard } from './explorers.ts';
import { buildSeaBoard, WORLD_MAP } from './seafarers.ts';

/**
 * Special maps: our own layouts that change how a game plays. Each one is a
 * generator, so every seed gives a new board with the same character.
 */
export interface SpecialMap {
  id: string;
  name: string;
  description: string;
  players: { min: number; max: number };
  /** Modules the map needs on top of the base game. */
  modules: string[];
  /** Expansion scenarios are listed under their own heading. */
  group?: 'traders' | 'treasures' | 'explorers';
  /** The map's module can't be played with Cities & Knights. */
  noCitiesKnights?: boolean;
  /** The map is only played with Cities & Knights. */
  needsCitiesKnights?: boolean;
}

export const SPECIAL_MAPS: SpecialMap[] = [
  {
    id: 'gold-rush',
    name: 'Gold Rush',
    description:
      'Gold fields fill the middle of the board: each pays any resource you like. Fewer ordinary hexes, so games are fast and swingy.',
    players: { min: 3, max: 8 },
    modules: ['seafarers'],
  },
  {
    id: 'volcano',
    name: 'Volcano',
    description:
      'Volcanoes replace the desert. They pay like gold fields, but when their number comes up a die picks one corner: a settlement there is destroyed and a city drops to a settlement.',
    players: { min: 3, max: 8 },
    modules: ['seafarers', 'special-maps'],
  },
  {
    id: 'deep-forest',
    name: 'Deep Forest',
    description: 'A forest-heavy board with clearings. Lumber is everywhere and brick is rare.',
    players: { min: 3, max: 8 },
    modules: [],
  },
  {
    id: 'lakes',
    name: 'Lakes',
    description: 'Inland lakes split the board into regions. Every lake has a harbor on its shore.',
    players: { min: 3, max: 8 },
    modules: ['special-maps'],
  },
  {
    id: 'diamond',
    name: 'Diamond',
    description: 'A long diamond. The tips are far apart, so the middle is fought over.',
    players: { min: 3, max: 4 },
    modules: [],
  },
  {
    id: 'twirl',
    name: 'Twirl',
    description: 'A pinwheel with six arms. Arm tips are quiet spots with few neighbours.',
    players: { min: 3, max: 4 },
    modules: [],
  },
  {
    id: 'ring',
    name: 'Ring',
    description:
      'A ring of land around an inner sea. No middle to fight over, and harbors inside too.',
    players: { min: 3, max: 6 },
    modules: [],
  },
  {
    id: WORLD_MAP.id,
    name: WORLD_MAP.name,
    description: WORLD_MAP.description,
    players: WORLD_MAP.players,
    modules: ['seafarers'],
  },
  {
    id: 'mini',
    name: 'Mini',
    description: 'A small board for 2 or 3 players. Space runs out fast.',
    players: { min: 2, max: 3 },
    modules: [],
  },
  ...TB_SCENARIOS.map((t): SpecialMap => ({
    ...t,
    modules: ['traders-barbarians'],
    group: 'traders',
    noCitiesKnights: true,
  })),
  ...TDA_SCENARIOS.map(({ citiesKnights, ...t }): SpecialMap => ({
    ...t,
    // The Great Canal's mountain lake is the special maps' lake hex.
    modules:
      t.id === 'great-canal'
        ? ['seafarers', 'special-maps', 'treasures-dragons']
        : ['seafarers', 'treasures-dragons'],
    group: 'treasures',
    ...(citiesKnights === 'needs'
      ? { needsCitiesKnights: true }
      : citiesKnights === 'optional'
        ? {}
        : { noCitiesKnights: true }),
  })),
  ...EP_SCENARIOS.map((t): SpecialMap => ({
    ...t,
    modules: ['explorers-pirates'],
    group: 'explorers',
    noCitiesKnights: true,
  })),
];

export function specialMapById(id: string): SpecialMap | undefined {
  return SPECIAL_MAPS.find((m) => m.id === id);
}

export interface SpecialBoard {
  map: MapSpec;
  /** Modules for the game: base plus what the map needs. */
  modules: string[];
  settings: Record<string, unknown>;
}

const BASE_MIX: Record<string, number> = {
  forest: 4,
  pasture: 4,
  fields: 4,
  hills: 3,
  mountains: 3,
};

/** The base game's resource mix stretched to fill `n` hexes, with 1 or 2 deserts. */
export function scaledTerrain(
  n: number,
  mix = BASE_MIX,
  deserts = n >= 24 ? 2 : 1,
): Record<string, number> {
  const land = n - deserts;
  const total = Object.values(mix).reduce((s, v) => s + v, 0);
  const exact = Object.entries(mix).map(([t, v]) => [t, (v * land) / total] as const);
  const out: Record<string, number> = { desert: deserts };
  for (const [t, v] of exact) out[t] = Math.floor(v);
  let left = land - exact.reduce((s, [, v]) => s + Math.floor(v), 0);
  for (const [t] of [...exact].sort((a, b) => (b[1] % 1) - (a[1] % 1))) {
    if (left <= 0) break;
    out[t] = (out[t] ?? 0) + 1;
    left--;
  }
  return out;
}

function diamond(): Coord[] {
  const out: Coord[] = [];
  for (let q = 0; q < 4; q++) for (let r = 0; r < 5; r++) out.push({ q: q - 1, r: r - 2 });
  return out;
}

const DIRS: Coord[] = [
  { q: 1, r: -1 },
  { q: 1, r: 0 },
  { q: 0, r: 1 },
  { q: -1, r: 1 },
  { q: -1, r: 0 },
  { q: 0, r: -1 },
];

function twirl(): Coord[] {
  const out = hexagon(1);
  DIRS.forEach((d, i) => {
    const next = DIRS[(i + 1) % 6]!;
    out.push({ q: 2 * d.q, r: 2 * d.r });
    out.push({ q: 2 * d.q + next.q, r: 2 * d.r + next.r });
  });
  return out;
}

function ring(players: number): Coord[] {
  const [outer, inner] = players >= 5 ? [3, 1] : [2, 0];
  return hexagon(outer).filter((c) => hexDistance({ q: 0, r: 0 }, c) > inner);
}

function mini(): Coord[] {
  return hexagon(2).filter(
    (c) => !(hexDistance({ q: 0, r: 0 }, c) === 2 && (c.q === 0 || c.r === 0 || c.q + c.r === 0)),
  );
}

/** Generates a special map. The same options always give the same board. */
export function generateSpecialBoard(opts: {
  seed: string;
  players: number;
  map: string;
}): SpecialBoard {
  const spec = specialMapById(opts.map);
  if (!spec) throw new Error(`Unknown special map "${opts.map}"`);
  if (spec.group === 'traders') return generateTbBoard({ ...opts, scenario: spec.id });
  if (spec.group === 'treasures') return generateTdaBoard({ ...opts, scenario: spec.id });
  if (spec.group === 'explorers') return generateEpBoard({ ...opts, scenario: spec.id });
  const { seed, players } = opts;
  const modules = ['base', ...spec.modules];
  if (spec.id === WORLD_MAP.id) {
    // Starts anywhere; the pirate and robber come with the sea board.
    const { map, settings } = buildSeaBoard(WORLD_MAP, { seed, players, scenario: 'world' });
    const { setupHexes: _anywhere, ...rest } = settings;
    return { map, modules, settings: rest };
  }
  const rng = Rng.fromSeed(`special:${opts.map}:${players}:${seed}`);
  const settings: Record<string, unknown> = {};
  const shaped = (shape: Coord[]) =>
    generateBoard({
      seed,
      players,
      mode: 'classic',
      shape,
      components: { ...componentsFor(players), terrain: scaledTerrain(shape.length) },
    }).map;

  let map: MapSpec;
  switch (spec.id) {
    case 'gold-rush': {
      map = generateBoard({ seed, players, mode: 'classic' }).map;
      const count = players >= 7 ? 5 : players >= 5 ? 4 : 3;
      const land = rng
        .shuffle(map.hexes.filter((h) => h.type !== 'sea' && h.type !== 'desert'))
        .sort((a, b) => hexDistance({ q: 0, r: 0 }, a) - hexDistance({ q: 0, r: 0 }, b));
      for (const h of land.slice(0, count)) h.type = 'gold';
      break;
    }
    case 'volcano': {
      map = generateBoard({ seed, players, mode: 'classic' }).map;
      for (const h of map.hexes)
        if (h.type === 'desert') {
          h.type = 'volcano';
          h.token = [4, 5, 9, 10][rng.int(0, 3)]!;
        }
      break;
    }
    case 'deep-forest': {
      const n = SHAPES[shapeFor(players)]().length;
      const terrain = scaledTerrain(
        n,
        { forest: 9, pasture: 4, fields: 5, hills: 1.5, mountains: 4 },
        n >= 24 ? 3 : 2,
      );
      map = generateBoard({ seed, players, mode: 'classic', custom: { terrain } }).map;
      break;
    }
    case 'lakes': {
      map = generateBoard({ seed, players, mode: 'classic' }).map;
      const land = new Set(map.hexes.filter((h) => h.type !== 'sea').map((h) => `${h.q},${h.r}`));
      const inner = map.hexes.filter(
        (h) =>
          h.type !== 'sea' &&
          h.type !== 'desert' &&
          DIRS.every((d) => land.has(`${h.q + d.q},${h.r + d.r}`)),
      );
      const want = players >= 5 ? 2 : 1;
      const lakes: typeof inner = [];
      for (const h of rng.shuffle(inner)) {
        if (lakes.length >= want) break;
        if (lakes.some((l) => hexDistance(l, h) < 2)) continue;
        lakes.push(h);
      }
      const kinds = ['brick', 'lumber', 'wool', 'grain', 'ore'];
      map.harbors ??= [];
      for (const h of lakes) {
        h.type = 'lake';
        delete h.token;
        const edges = hexEdges(h.q, h.r);
        const a = rng.int(0, 5);
        map.harbors.push({ edge: edges[a]!, resource: 'any', ratio: 3 });
        map.harbors.push({ edge: edges[(a + 3) % 6]!, resource: kinds[rng.int(0, 4)]!, ratio: 2 });
      }
      break;
    }
    case 'diamond':
      map = shaped(diamond());
      break;
    case 'twirl':
      map = shaped(twirl());
      break;
    case 'ring':
      map = shaped(ring(players));
      break;
    default:
      map = shaped(mini());
  }
  // Every board starts with the robber on a desert or volcano, if it has one.
  const start = map.hexes.find((h) => h.type === 'desert' || h.type === 'volcano');
  map.pieces = start ? [{ type: 'robber', at: { kind: 'hex', id: hexId(start.q, start.r) } }] : [];
  return { map, modules, settings };
}
