import { buildSeaBoard, type SeaScenario } from './seafarers.ts';
import type { SpecialBoard } from './special.ts';

/**
 * Explorers & Pirates scenarios on our own generated boards: a home island
 * in the middle and fog over everything past the water around it.
 */
export interface EpScenarioInfo {
  id: 'land-ho';
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
};

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
