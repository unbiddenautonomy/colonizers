import { hexId, hexNeighbours, Rng, type HexId } from '@colonizers/engine';
import { buildSeaBoard, type SeaScenario } from './seafarers.ts';
import type { SpecialBoard } from './special.ts';

/**
 * Explorers & Pirates scenarios on our own generated boards: a home island
 * in the middle and fog over everything past the water around it.
 */
export interface EpScenarioInfo {
  id: 'land-ho' | 'pirate-lairs' | 'fishing-grounds' | 'spice-islands' | 'full-voyage';
  name: string;
  description: string;
  players: { min: number; max: number };
}

export const EP_SCENARIOS: EpScenarioInfo[] = [
  {
    id: 'land-ho',
    name: 'Land Ho!',
    description:
      'Fog covers the sea around your island. Load a settler onto a ship, sail into the unknown and found settlements on the islands you find. Gold buys what you lack. First to 8 points.',
    players: { min: 2, max: 4 },
  },
  {
    id: 'pirate-lairs',
    name: 'Pirate Lairs',
    description:
      'Pirates hold the gold fields out in the fog. Ship crews out to storm their lairs for gold and points, then mine the gold. A pirate ship roams the sea on a 7. First to 12 points.',
    players: { min: 2, max: 4 },
  },
  {
    id: 'fishing-grounds',
    name: 'Fishing Grounds',
    description:
      'Rich fishing grounds lie hidden in the fog. Park your ships beside them, fill the holds when their number comes up and bring the catch home: every 2 fish are a point. First to 10 points.',
    players: { min: 2, max: 4 },
  },
  {
    id: 'spice-islands',
    name: 'Spice Islands',
    description:
      'Villages on far islands sell spice for gold. Find them, fill your holds and sail home: every 2 sacks of spice are a point. First to 10 points.',
    players: { min: 2, max: 4 },
  },
  {
    id: 'full-voyage',
    name: 'The Full Voyage',
    description:
      'Everything at once: pirate lairs and the pirate ship, fishing grounds and spice villages. Pick your missions. First to 13 points.',
    players: { min: 2, max: 4 },
  },
];

export function epScenarioById(id: string): EpScenarioInfo | undefined {
  return EP_SCENARIOS.find((s) => s.id === id);
}

const SEA: Record<EpScenarioInfo['id'], Omit<SeaScenario, 'id' | 'name' | 'description'>> = {
  'land-ho': {
    layout: 'fogIslands',
    players: { min: 2, max: 4 },
    vpTarget: () => 8,
    islandBonus: 0,
    fog: true,
    gold: 0,
    // A small home island, so the settlers have to sail out.
    homeSize: (n) => (n <= 2 ? 10 : n === 3 ? 11 : 12),
    outerSizes: (n) => (n <= 2 ? [4, 3, 3, 3, 2] : [5, 4, 3, 3, 3, 2]),
  },
  'pirate-lairs': {
    layout: 'fogIslands',
    players: { min: 2, max: 4 },
    vpTarget: () => 12,
    islandBonus: 0,
    fog: true,
    // A lair on one gold field per player, plus one.
    gold: 0,
    homeSize: (n) => (n <= 2 ? 10 : n === 3 ? 11 : 12),
    outerSizes: (n) => (n <= 2 ? [4, 4, 3, 3, 3] : [5, 4, 4, 3, 3, 3]),
  },
  'fishing-grounds': {
    layout: 'fogIslands',
    players: { min: 2, max: 4 },
    vpTarget: () => 10,
    islandBonus: 0,
    fog: true,
    gold: 0,
    homeSize: (n) => (n <= 2 ? 10 : n === 3 ? 11 : 12),
    outerSizes: (n) => (n <= 2 ? [4, 3, 3, 3, 2] : [5, 4, 3, 3, 3, 2]),
  },
  'spice-islands': {
    layout: 'fogIslands',
    players: { min: 2, max: 4 },
    vpTarget: () => 10,
    islandBonus: 0,
    fog: true,
    gold: 0,
    homeSize: (n) => (n <= 2 ? 10 : n === 3 ? 11 : 12),
    outerSizes: (n) => (n <= 2 ? [4, 3, 3, 3, 3] : [5, 4, 3, 3, 3, 3]),
  },
  'full-voyage': {
    layout: 'fogIslands',
    players: { min: 2, max: 4 },
    vpTarget: () => 13,
    islandBonus: 0,
    fog: true,
    gold: 0,
    homeSize: (n) => (n <= 2 ? 10 : n === 3 ? 11 : 12),
    outerSizes: (n) => (n <= 2 ? [4, 4, 3, 3, 3] : [5, 4, 4, 3, 3, 3]),
  },
};

/** What each scenario hides in the fog, per player count. */
const EXTRAS: Record<EpScenarioInfo['id'], { lairs: number; shoals: number; villages: number }> = {
  'land-ho': { lairs: 0, shoals: 0, villages: 0 },
  'pirate-lairs': { lairs: 1, shoals: 0, villages: 0 },
  'fishing-grounds': { lairs: 0, shoals: 2, villages: 0 },
  'spice-islands': { lairs: 0, shoals: 0, villages: 1 },
  'full-voyage': { lairs: 1, shoals: 1, villages: 1 },
};

/** Numbers for the fishing grounds: never a 6 or 8, so a catch is a treat. */
const SHOAL_TOKENS = [3, 4, 5, 9, 10, 11, 4, 5, 9, 10];

/** Builds an Explorers & Pirates board. Same seed, same board. */
export function generateEpBoard(opts: {
  seed: string;
  players: number;
  scenario: string;
}): SpecialBoard {
  const spec = epScenarioById(opts.scenario);
  if (!spec) throw new Error(`Unknown Explorers & Pirates scenario "${opts.scenario}"`);
  const sea = buildSeaBoard(
    { id: `ep-${spec.id}`, name: spec.name, description: spec.description, ...SEA[spec.id] },
    { seed: opts.seed, players: opts.players, scenario: `ep-${spec.id}` },
  );
  const rng = Rng.fromSeed(`ep-extras:${spec.id}:${opts.players}:${opts.seed}`);
  const home = new Set(sea.settings.setupHexes as HexId[]);
  const extra = EXTRAS[spec.id];
  const id = (h: { q: number; r: number }) => hexId(h.q, h.r);
  const nearHome = (h: { q: number; r: number }) =>
    home.has(id(h)) || hexNeighbours(id(h)).some((n) => home.has(n));
  // Land out in the fog, never a desert and never on a 6 or 8.
  const farLand = () =>
    rng.shuffle(
      sea.map.hexes.filter(
        (h) =>
          h.hidden &&
          h.type !== 'sea' &&
          h.type !== 'desert' &&
          h.type !== 'gold' &&
          !h.props?.village &&
          h.token !== 6 &&
          h.token !== 8 &&
          !home.has(id(h)),
      ),
    );
  // Pirate lairs: gold fields, one per player plus one.
  if (extra.lairs) for (const h of farLand().slice(0, opts.players + extra.lairs)) h.type = 'gold';
  // Spice villages, one per player plus one.
  if (extra.villages)
    for (const h of farLand().slice(0, opts.players + extra.villages))
      h.props = { ...h.props, village: true };
  // Fishing grounds: sea in the fog, next to an island but away from home.
  if (extra.shoals) {
    const land = new Set(sea.map.hexes.filter((h) => h.type !== 'sea').map(id));
    const water = rng.shuffle(
      sea.map.hexes.filter(
        (h) =>
          h.hidden &&
          h.type === 'sea' &&
          !nearHome(h) &&
          hexNeighbours(id(h)).some((n) => land.has(n)),
      ),
    );
    const tokens = rng.shuffle([...SHOAL_TOKENS]);
    water.slice(0, opts.players + extra.shoals).forEach((h, i) => {
      h.type = 'shoal';
      h.token = tokens[i % tokens.length]!;
    });
  }
  const map = sea.map;
  // Harbor settlements are the harbors here, and there is no robber.
  map.harbors = [];
  map.pieces = (map.pieces ?? []).filter((p) => p.type !== 'pirate' && p.type !== 'robber');
  return {
    map,
    modules: ['base', 'explorers-pirates'],
    settings: { epScenario: spec.id, setupHexes: sea.settings.setupHexes },
  };
}
