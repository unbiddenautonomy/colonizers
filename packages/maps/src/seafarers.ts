/**
 * Seafarers boards (PLAN.md section 3.4): a home island, outer islands that
 * ships can reach, gold fields out at sea, optional fog, and island bonuses.
 * Every scenario here is a generator recipe plus rule settings, so each game
 * gets a fresh board that still passes the same checks.
 */
import {
  buildGeometry,
  hexDistance,
  hexId,
  parseHexId,
  Rng,
  type CornerId,
  type EdgeId,
  type Harbor,
  type HexId,
  type MapSpec,
} from '@colonizers/engine';

export type SeaLayout = 'newShores' | 'fourIslands' | 'fogIslands' | 'archipelago' | 'twoIslands';

export interface SeaScenario {
  id: string;
  name: string;
  description: string;
  layout: SeaLayout;
  players: { min: number; max: number };
  vpTarget: (players: number) => number;
  islandBonus: number;
  fog: boolean;
  /** Deserts on the home island, spread apart and inland where possible. */
  homeDeserts?: number;
  /** Deserts among the outer islands. */
  outerDeserts?: number;
  /** Outer island sizes, instead of the layout's own. */
  outerSizes?: (players: number) => number[];
  /** Gold fields, instead of the layout's own count. */
  gold?: number;
}

export const SEA_SCENARIOS: SeaScenario[] = [
  {
    id: 'new-shores',
    name: 'New Shores',
    description:
      'Start on one big island, then sail to the small islands around it. 2 points for your first settlement on each new island.',
    layout: 'newShores',
    players: { min: 2, max: 8 },
    vpTarget: (n) => (n <= 4 ? 13 : 12),
    islandBonus: 2,
    fog: false,
  },
  {
    id: 'four-islands',
    name: 'Four Islands',
    description:
      'Four medium islands and no mainland. Settle where you like; every other island you reach is worth 2 points.',
    layout: 'fourIslands',
    players: { min: 2, max: 6 },
    vpTarget: () => 12,
    islandBonus: 2,
    fog: false,
  },
  {
    id: 'fog-islands',
    name: 'Fog Islands',
    description:
      'The sea beyond your island is covered in fog. Sail or build next to it to turn it over and get a resource for each land hex you find.',
    layout: 'fogIslands',
    players: { min: 2, max: 8 },
    vpTarget: (n) => (n <= 4 ? 12 : 11),
    islandBonus: 0,
    fog: true,
  },
  {
    id: 'archipelago',
    name: 'Archipelago',
    description:
      'A small home island and many tiny islands close together. Lots of short hops, 1 point for each new island.',
    layout: 'archipelago',
    players: { min: 2, max: 6 },
    vpTarget: () => 13,
    islandBonus: 1,
    fog: false,
  },
];

export function seaScenarioById(id: string): SeaScenario | undefined {
  return SEA_SCENARIOS.find((s) => s.id === id);
}

export interface SeaBoardOptions {
  seed: string;
  players: number;
  scenario: string;
}

export interface SeaBoardInfo {
  /** Island hex lists, the home island first when there is one. */
  islands: HexId[][];
  home: HexId[] | null;
  gold: HexId[];
  /** Good starting corners available (greedy, keeping the distance rule). */
  startingSpots: number;
  attempts: number;
}

export interface SeaBoard {
  map: MapSpec;
  settings: Record<string, unknown>;
  info: SeaBoardInfo;
}

const RESOURCE_TERRAIN = ['forest', 'pasture', 'fields', 'hills', 'mountains'] as const;
const TOKENS = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];
const PIPS: Record<number, number> = {
  2: 1,
  3: 2,
  4: 3,
  5: 4,
  6: 5,
  8: 5,
  9: 4,
  10: 3,
  11: 2,
  12: 1,
};

interface Plan {
  radius: number;
  home: number;
  outer: number[];
  gold: number;
}

/** Board size and island sizes for each layout and player count. */
function planFor(layout: SeaLayout, players: number, rng: Rng): Plan {
  const big = players > 4;
  const huge = players > 6;
  const radius = big ? 6 : 5;
  const pick = (min: number, max: number) => rng.int(min, max);
  switch (layout) {
    case 'newShores':
      return {
        radius,
        home: huge ? 28 : big ? 23 : 17,
        outer: Array.from({ length: big ? 5 : 4 }, () => pick(3, huge ? 6 : 5)),
        gold: big ? 3 : 2,
      };
    case 'fourIslands': {
      const size = big ? 10 : 8;
      return { radius, home: 0, outer: [size, size, size, size], gold: big ? 3 : 2 };
    }
    case 'fogIslands':
      return {
        radius,
        home: huge ? 26 : big ? 21 : 16,
        outer: Array.from({ length: big ? 6 : 5 }, () => pick(2, 5)),
        gold: big ? 3 : 2,
      };
    case 'archipelago':
      return {
        radius,
        home: big ? 16 : 12,
        outer: Array.from({ length: big ? 9 : 7 }, () => pick(2, 4)),
        gold: big ? 3 : 2,
      };
    case 'twoIslands':
      // One big home island and one neighbour across a strait.
      return {
        radius,
        home: huge ? 28 : big ? 24 : 19,
        outer: [big ? 10 : 8],
        gold: 1,
      };
  }
}

const key = (q: number, r: number) => hexId(q, r);

function neighbours(id: HexId): HexId[] {
  const { q, r } = parseHexId(id);
  return [
    key(q + 1, r),
    key(q - 1, r),
    key(q, r + 1),
    key(q, r - 1),
    key(q + 1, r - 1),
    key(q - 1, r + 1),
  ];
}

function dist(a: HexId, b: HexId): number {
  return hexDistance(parseHexId(a), parseHexId(b));
}

/** Grows a blob of `size` hexes from `start`, staying inside `allowed`. */
function grow(
  rng: Rng,
  start: HexId,
  size: number,
  allowed: (h: HexId) => boolean,
): HexId[] | null {
  const blob = new Set<HexId>([start]);
  let guard = 0;
  while (blob.size < size && guard++ < 500) {
    const frontier = [...blob].flatMap(neighbours).filter((h) => !blob.has(h) && allowed(h));
    if (!frontier.length) return null;
    // Prefer hexes touching the blob on several sides, so islands come out round.
    const scored = frontier.map((h) => ({
      h,
      w: neighbours(h).filter((n) => blob.has(n)).length ** 2 + rng.nextFloat(),
    }));
    scored.sort((a, b) => b.w - a.w);
    const choice = scored[Math.min(scored.length - 1, rng.int(0, Math.min(2, scored.length - 1)))]!;
    blob.add(choice.h);
  }
  return blob.size === size ? [...blob].sort() : null;
}

interface Layout {
  board: HexId[];
  interior: Set<HexId>;
  islands: HexId[][];
  home: HexId[] | null;
}

function layOut(rng: Rng, layout: SeaLayout, plan: Plan): Layout | null {
  const board: HexId[] = [];
  const interior = new Set<HexId>();
  for (let q = -plan.radius; q <= plan.radius; q++) {
    for (let r = -plan.radius; r <= plan.radius; r++) {
      const d = hexDistance({ q, r }, { q: 0, r: 0 });
      if (d > plan.radius) continue;
      board.push(key(q, r));
      if (d < plan.radius) interior.add(key(q, r));
    }
  }
  const land = new Set<HexId>();
  const islands: HexId[][] = [];
  const nearestLand = (h: HexId) => {
    let best = Infinity;
    for (const l of land) best = Math.min(best, dist(h, l));
    return best;
  };

  let home: HexId[] | null = null;
  if (plan.home > 0) {
    // The home island sits a little off centre so the outer islands have room.
    const inner = [...interior].filter((h) => dist(h, key(0, 0)) <= 1);
    const start = inner[rng.int(0, inner.length - 1)]!;
    home = grow(rng, start, plan.home, (h) => interior.has(h));
    if (!home) return null;
    home.forEach((h) => land.add(h));
    islands.push(home);
  }

  for (const size of plan.outer) {
    // A new island starts 2 to 4 hexes from existing land: never touching it,
    // and never more than 3 sea hexes away, so every island can be reached.
    const candidates = [...interior].filter((h) => {
      if (land.has(h)) return false;
      if (!land.size) return true;
      const d = nearestLand(h);
      return d >= 2 && d <= 4;
    });
    if (!candidates.length) return null;
    let placed: HexId[] | null = null;
    for (let tries = 0; tries < 12 && !placed; tries++) {
      const start = candidates[rng.int(0, candidates.length - 1)]!;
      const others = new Set(land);
      placed = grow(
        rng,
        start,
        size,
        (h) => interior.has(h) && !others.has(h) && neighbours(h).every((n) => !others.has(n)),
      );
      if (placed && land.size && placed.every((h) => nearestLand(h) > 4)) placed = null;
    }
    if (!placed) return null;
    placed.forEach((h) => land.add(h));
    islands.push(placed);
  }
  if (layout === 'fourIslands' && islands.length !== 4) return null;
  return { board, interior, islands, home };
}

function scaledCounts(total: number, rng: Rng): string[] {
  // Base-game proportions: 4 forest, 4 pasture, 4 fields, 3 hills, 3 mountains.
  const weights = [4, 4, 4, 3, 3];
  const sum = weights.reduce((s, w) => s + w, 0);
  const counts = weights.map((w) => Math.max(1, Math.floor((w / sum) * total)));
  let left = total - counts.reduce((s, c) => s + c, 0);
  const order = rng.shuffle([0, 1, 2, 3, 4]);
  for (let i = 0; left > 0; i = (i + 1) % 5, left--) counts[order[i]!]! += 1;
  while (counts.reduce((s, c) => s + c, 0) > total) {
    const i = counts.indexOf(Math.max(...counts));
    counts[i]! -= 1;
  }
  return counts.flatMap((c, i) => Array<string>(c).fill(RESOURCE_TERRAIN[i]!));
}

/** Spread-out desert spots on an island: inland first, never side by side. */
function desertSpots(rng: Rng, island: HexId[], count: number): HexId[] | null {
  const set = new Set(island);
  const inland = (h: HexId) => neighbours(h).every((n) => set.has(n));
  const order = rng.shuffle(island).sort((a, b) => Number(inland(b)) - Number(inland(a)));
  const out: HexId[] = [];
  for (const h of order) {
    if (out.length >= count) break;
    if (out.some((d) => dist(d, h) < 2)) continue;
    out.push(h);
  }
  return out.length === count ? out : null;
}

function assignTerrain(
  rng: Rng,
  layout: Layout,
  plan: Plan,
  scenario: SeaScenario,
): { terrain: Map<HexId, string>; gold: HexId[] } | null {
  const terrain = new Map<HexId, string>();
  const outerIslands = layout.home ? layout.islands.slice(1) : layout.islands;

  if (layout.home && scenario.homeDeserts !== undefined) {
    const deserts = desertSpots(rng, layout.home, scenario.homeDeserts);
    if (!deserts) return null;
    deserts.forEach((h) => terrain.set(h, 'desert'));
    const rest = layout.home.filter((h) => !terrain.has(h));
    const types = rng.shuffle(scaledCounts(rest.length, rng));
    rest.forEach((h, i) => terrain.set(h, types[i]!));
  } else if (layout.home) {
    const deserts = layout.home.length >= 20 ? 1 : 0;
    const types = rng.shuffle([
      ...scaledCounts(layout.home.length - deserts, rng),
      ...Array<string>(deserts).fill('desert'),
    ]);
    layout.home.forEach((h, i) => terrain.set(h, types[i]!));
  }

  // Gold goes on outer islands only, never two side by side.
  const outerHexes = outerIslands.flat();
  const gold: HexId[] = [];
  for (const h of rng.shuffle(outerHexes)) {
    if (gold.length >= plan.gold) break;
    if (neighbours(h).some((n) => gold.includes(n))) continue;
    // Keep at least one normal hex on each island.
    const isle = outerIslands.find((i) => i.includes(h))!;
    if (isle.filter((x) => gold.includes(x)).length + 1 >= isle.length) continue;
    gold.push(h);
  }
  gold.forEach((h) => terrain.set(h, 'gold'));

  // Outer deserts: never the last ordinary hex of an island.
  let outerDeserts = scenario.outerDeserts ?? 0;
  for (const h of outerDeserts ? rng.shuffle(outerHexes) : []) {
    if (outerDeserts <= 0) break;
    if (terrain.has(h)) continue;
    const isle = outerIslands.find((i) => i.includes(h))!;
    if (isle.filter((x) => !terrain.has(x)).length <= 1) continue;
    terrain.set(h, 'desert');
    outerDeserts--;
  }

  if (layout.home) {
    // Outer islands lean toward one resource, which gives a reason to sail.
    for (const isle of outerIslands) {
      const main = RESOURCE_TERRAIN[rng.int(0, 4)]!;
      for (const h of isle) {
        if (terrain.has(h)) continue;
        terrain.set(h, rng.nextFloat() < 0.5 ? main : RESOURCE_TERRAIN[rng.int(0, 4)]!);
      }
    }
  } else {
    // No mainland: spread a full resource mix over all islands.
    const free = outerHexes.filter((h) => !terrain.has(h));
    const types = rng.shuffle(scaledCounts(free.length, rng));
    free.forEach((h, i) => terrain.set(h, types[i]!));
    // Every island needs at least three different resources.
    for (const isle of outerIslands) {
      const kinds = new Set(isle.map((h) => terrain.get(h)).filter((t) => t !== 'gold'));
      if (kinds.size < Math.min(3, isle.length - 1)) return null;
    }
  }
  return { terrain, gold };
}

function assignTokens(
  rng: Rng,
  terrain: Map<HexId, string>,
  islands: HexId[][],
): Map<HexId, number> | null {
  const producing = [...terrain.keys()].filter((h) => terrain.get(h) !== 'desert').sort();
  const pool: number[] = [];
  while (pool.length < producing.length) pool.push(...TOKENS);
  for (let attempt = 0; attempt < 400; attempt++) {
    const tokens = rng.shuffle(pool).slice(0, producing.length);
    const map = new Map<HexId, number>();
    producing.forEach((h, i) => map.set(h, tokens[i]!));
    const red = (h: HexId) => map.get(h) === 6 || map.get(h) === 8;
    let ok = true;
    for (const h of producing) {
      // No touching 6s and 8s, and gold never on a 6 or 8.
      if (red(h) && neighbours(h).some((n) => red(n))) ok = false;
      if (red(h) && terrain.get(h) === 'gold') ok = false;
      if (!ok) break;
    }
    // Every island has at least one decent number.
    if (ok) ok = islands.every((isle) => isle.some((h) => (PIPS[map.get(h) ?? 0] ?? 0) >= 3));
    if (ok) return map;
  }
  return null;
}

/** Greedy count of starting corners on the given hexes that keep the distance rule. */
function countStartingSpots(
  boardHexes: HexId[],
  area: Set<HexId>,
  tokens: Map<HexId, number>,
): number {
  const g = buildGeometry(boardHexes);
  const scored = g.corners
    .filter((c) => (g.cornerHexes.get(c) ?? []).some((h) => area.has(h)))
    .map((c) => ({
      c,
      pips: (g.cornerHexes.get(c) ?? []).reduce((s, h) => s + (PIPS[tokens.get(h) ?? 0] ?? 0), 0),
    }))
    .filter((x) => x.pips >= 4)
    .sort((a, b) => b.pips - a.pips);
  const taken = new Set<CornerId>();
  let n = 0;
  for (const { c } of scored) {
    if (taken.has(c) || (g.cornerNeighbours.get(c) ?? []).some((x) => taken.has(x))) continue;
    taken.add(c);
    n++;
  }
  return n;
}

function placeHarbors(
  rng: Rng,
  boardHexes: HexId[],
  land: Set<HexId>,
  islands: HexId[][],
  home: HexId[] | null,
): Harbor[] {
  const g = buildGeometry(boardHexes);
  const coastal = (isle: HexId[]) => {
    const set = new Set(isle);
    return g.edges.filter((e) => {
      const hs = g.edgeHexes.get(e) ?? [];
      return hs.length === 2 && hs.some((h) => set.has(h)) && hs.some((h) => !land.has(h));
    });
  };
  const wanted: [HexId[], number][] = [];
  if (home) wanted.push([home, Math.max(4, Math.round(home.length / 4))]);
  for (const isle of home ? islands.slice(1) : islands) {
    if (wanted.length >= (home ? 4 : 5)) break;
    wanted.push([isle, home ? 1 : 2]);
  }
  const used = new Set<CornerId>();
  const edges: EdgeId[] = [];
  for (const [isle, count] of wanted) {
    let placed = 0;
    for (const e of rng.shuffle(coastal(isle))) {
      if (placed >= count) break;
      const [a, b] = g.edgeCorners.get(e)!;
      const near = [
        a,
        b,
        ...(g.cornerNeighbours.get(a) ?? []),
        ...(g.cornerNeighbours.get(b) ?? []),
      ];
      if (near.some((c) => used.has(c))) continue;
      used.add(a);
      used.add(b);
      edges.push(e);
      placed++;
    }
  }
  const kinds = rng.shuffle([
    ...RESOURCE_TERRAIN.map((t) => TERRAIN_RESOURCE[t]!),
    ...Array<string>(Math.max(0, edges.length - 5)).fill('any'),
  ]);
  return edges.map((edge, i) => {
    const resource = kinds[i] ?? 'any';
    return { edge, resource, ratio: resource === 'any' ? 3 : 2 };
  });
}

const TERRAIN_RESOURCE: Record<string, string> = {
  forest: 'lumber',
  pasture: 'wool',
  fields: 'grain',
  hills: 'brick',
  mountains: 'ore',
};

/** Builds a Seafarers board for a scenario. Same seed, same board. */
export function generateSeaBoard(opts: SeaBoardOptions): SeaBoard {
  const scenario = seaScenarioById(opts.scenario);
  if (!scenario) throw new Error(`Unknown Seafarers scenario "${opts.scenario}"`);
  return buildSeaBoard(scenario, opts);
}

/** Builds a board from a scenario recipe that need not be in SEA_SCENARIOS (expansions use this). */
export function buildSeaBoard(scenario: SeaScenario, opts: SeaBoardOptions): SeaBoard {
  const rng = Rng.fromSeed(`sea:${opts.scenario}:${opts.players}:${opts.seed}`);

  for (let attempt = 1; attempt <= 300; attempt++) {
    const plan = planFor(scenario.layout, opts.players, rng);
    if (scenario.outerSizes) plan.outer = scenario.outerSizes(opts.players);
    if (scenario.gold !== undefined) plan.gold = scenario.gold;
    const layout = layOut(rng, scenario.layout, plan);
    if (!layout) continue;
    const t = assignTerrain(rng, layout, plan, scenario);
    if (!t) continue;
    const tokens = assignTokens(rng, t.terrain, layout.islands);
    if (!tokens) continue;

    // The home island must hold every resource and enough starting spots.
    const startArea = new Set(layout.home ?? layout.islands.flat());
    if (layout.home) {
      const kinds = new Set(layout.home.map((h) => t.terrain.get(h)));
      if (!RESOURCE_TERRAIN.every((r) => kinds.has(r))) continue;
    }
    const spots = countStartingSpots(layout.board, startArea, tokens);
    if (spots < 2 * opts.players) continue;

    const land = new Set(layout.islands.flat());
    const harbors = placeHarbors(rng, layout.board, land, layout.islands, layout.home);

    // Fog covers everything not on or right next to the home island.
    const hidden = new Set<HexId>();
    if (scenario.fog && layout.home) {
      const homeSet = new Set(layout.home);
      for (const h of layout.interior) {
        if (homeSet.has(h) || neighbours(h).some((n) => homeSet.has(n))) continue;
        hidden.add(h);
      }
    }
    // Harbors on hidden coasts would give the layout away.
    const visibleHarbors = harbors.filter((hb) => {
      const g = buildGeometry(layout.board);
      return (g.edgeHexes.get(hb.edge) ?? []).every((h) => !hidden.has(h));
    });

    // The pirate starts out at sea, as far from the home island as possible.
    const ref = layout.home ?? layout.islands.flat();
    // It stays next to some island and inside the land's bounding box, so it is
    // on screen (the board view crops to the land).
    const px = (h: HexId) => {
      const { q, r } = parseHexId(h);
      return { x: 2 * q + r, y: r };
    };
    const lx = [...land].map((h) => px(h).x);
    const ly = [...land].map((h) => px(h).y);
    const inBox = (h: HexId) => {
      const { x, y } = px(h);
      return (
        x > Math.min(...lx) && x < Math.max(...lx) && y > Math.min(...ly) && y < Math.max(...ly)
      );
    };
    const near = layout.board.filter(
      (h) =>
        !land.has(h) &&
        !hidden.has(h) &&
        layout.interior.has(h) &&
        neighbours(h).some((n) => land.has(n)),
    );
    const boxed = near.filter(inBox);
    const seaHexes = boxed.length ? boxed : near;
    const pirateHex = seaHexes
      .map((h) => ({ h, d: Math.min(...ref.map((x) => dist(h, x))) }))
      .sort((a, b) => b.d - a.d || (a.h < b.h ? -1 : 1))[0]!.h;
    const desert = layout.board.find((h) => t.terrain.get(h) === 'desert' && !hidden.has(h));

    const map: MapSpec = {
      hexes: layout.board.map((h) => {
        const { q, r } = parseHexId(h);
        const type = t.terrain.get(h) ?? 'sea';
        const token = tokens.get(h);
        return {
          q,
          r,
          type,
          ...(token !== undefined && { token }),
          ...(hidden.has(h) && { hidden: true }),
        };
      }),
      harbors: visibleHarbors,
      pieces: [
        { type: 'pirate', at: { kind: 'hex', id: pirateHex } },
        ...(desert ? [{ type: 'robber', at: { kind: 'hex' as const, id: desert } }] : []),
      ],
    };
    return {
      map,
      settings: {
        vpTarget: scenario.vpTarget(opts.players),
        islandBonus: scenario.islandBonus,
        discoveryReward: scenario.fog,
        setupHexes: layout.home,
      },
      info: {
        islands: layout.islands,
        home: layout.home,
        gold: t.gold,
        startingSpots: spots,
        attempts: attempt,
      },
    };
  }
  throw new Error(`Could not build a ${scenario.name} board for ${opts.players} players`);
}

/** Checks the structural promises of a Seafarers board (used by tests and the soak script). */
export function checkSeaBoard(board: SeaBoard, players: number): string[] {
  const problems: string[] = [];
  const { islands, home, gold } = board.info;
  const land = islands.flat();
  // Every island is 2 to 4 hexes from another (1 to 3 sea hexes between).
  for (const [i, isle] of islands.entries()) {
    if (islands.length < 2) break;
    const gap = Math.min(
      ...islands
        .filter((_, j) => j !== i)
        .flatMap((other) => isle.flatMap((a) => other.map((b) => dist(a, b)))),
    );
    if (gap < 2) problems.push(`island ${i} touches another island`);
    if (gap > 4) problems.push(`island ${i} is ${gap - 1} sea hexes from the nearest island`);
  }
  // Islands are connected as a group by short hops.
  const reached = new Set([0]);
  let grew = true;
  while (grew) {
    grew = false;
    islands.forEach((isle, i) => {
      if (reached.has(i)) return;
      for (const j of reached) {
        const near = isle.some((a) => islands[j]!.some((b) => dist(a, b) <= 4));
        if (near) {
          reached.add(i);
          grew = true;
          return;
        }
      }
    });
  }
  if (reached.size !== islands.length)
    problems.push('some islands can not be reached by short hops');
  const types = new Map(board.map.hexes.map((h) => [hexId(h.q, h.r), h]));
  if (home) {
    const kinds = new Set(home.map((h) => types.get(h)?.type));
    for (const r of RESOURCE_TERRAIN) if (!kinds.has(r)) problems.push(`home island lacks ${r}`);
    if (gold.some((h) => home.includes(h))) problems.push('gold on the home island');
  }
  for (const h of gold) {
    if (neighbours(h).some((n) => gold.includes(n))) problems.push('gold fields touch');
    const tok = types.get(h)?.token;
    if (tok === 6 || tok === 8) problems.push('gold on a 6 or 8');
  }
  for (const h of land) {
    const tok = types.get(h)?.token;
    if (tok !== 6 && tok !== 8) continue;
    if (neighbours(h).some((n) => [6, 8].includes(types.get(n)?.token ?? 0)))
      problems.push('red numbers touch');
  }
  for (const [i, isle] of islands.entries()) {
    if (!isle.some((h) => (PIPS[types.get(h)?.token ?? 0] ?? 0) >= 3))
      problems.push(`island ${i} has no decent number`);
  }
  if (board.info.startingSpots < 2 * players) problems.push('not enough starting spots');
  const pirate = board.map.pieces?.find((p) => p.type === 'pirate');
  if (!pirate || pirate.at.kind !== 'hex' || types.get(pirate.at.id)?.type !== 'sea')
    problems.push('the pirate is not at sea');
  return problems;
}
