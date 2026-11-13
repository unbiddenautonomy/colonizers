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
  id: 'treasure-islands' | 'into-the-unknown' | 'desert-dragons';
  name: string;
  description: string;
  players: { min: number; max: number };
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
    id: 'desert-dragons',
    name: 'Desert Dragons',
    description:
      'Every new building wakes more dragons in the three deserts. Once they are all awake they spread across the island, blocking hexes, roads and towns. Knight cards drive them out; the island across the water is safe.',
    players: { min: 3, max: 6 },
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

export function generateTdaBoard(opts: {
  seed: string;
  players: number;
  scenario: string;
}): SpecialBoard {
  const spec = tdaScenarioById(opts.scenario);
  if (!spec)
    throw new Error(`Unknown Treasures, Dragons & Adventurers scenario "${opts.scenario}"`);
  const sea = buildSeaBoard(
    { id: `tda-${spec.id}`, name: spec.name, description: spec.description, ...SEA[spec.id] },
    { seed: opts.seed, players: opts.players, scenario: spec.id },
  );
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

  // Into the Unknown and Desert Dragons have no pirate.
  if (spec.id !== 'treasure-islands')
    map.pieces = (map.pieces ?? []).filter((p) => p.type !== 'pirate');

  // The host's points target applies; the module adds the scenario's extra points.
  const settings = { ...sea.settings };
  delete settings.vpTarget;
  return {
    map,
    modules: ['base', 'seafarers', 'treasures-dragons'],
    settings: { ...settings, tdaScenario: spec.id, treasureStack: stack },
  };
}
