/**
 * Game modes and how they combine, for the new-game screens and the server.
 *
 * Three maps, from the combination research:
 *
 * 1. **Pairs**: modes that go well together (official advice, the fan
 *    authors, player habit). The screen highlights them.
 * 2. **Compatibility**: what can be played together at all. `resolve` is the
 *    one rule the server builds games by; `modeStatus` explains, for each
 *    mode not yet picked, whether it can join and why not.
 * 3. **Weight**: how much rules and length each mode adds. The total warns
 *    when a mix gets long, then chaotic.
 */

export const MODES = [
  'citiesKnights',
  'greedWealthPower',
  'civilisations',
  'church',
  'witches',
  'worldWonders',
  'princes',
  'soldiers',
  'investors',
  'kingdoms',
  'landWater',
  'strategist',
] as const;

export type ModeId = (typeof MODES)[number];

/** The board picked in step 1: what it is, and what it allows. */
export interface BoardInfo {
  /** Random, preset and custom maps are "usual"; Seafarers scenarios are "seafarers". */
  kind: 'usual' | 'seafarers' | 'special';
  /** The special map's family, if any. */
  group?: 'traders' | 'treasures' | 'explorers' | null;
  /** A Seafarers scenario with fog to explore. */
  fog?: boolean;
  /** The map always plays with Cities & Knights. */
  needsCk?: boolean;
  /** The map never plays with Cities & Knights. */
  noCk?: boolean;
}

export interface ModeInfo {
  id: ModeId;
  name: string;
  /** Fan-made (not an official expansion). */
  fan: boolean;
  /** Rules weight: 1 light, 2 medium, 3 heavy. */
  weight: number;
  /** One line on what it adds. */
  blurb: string;
}

export const MODE_INFO: Record<ModeId, ModeInfo> = {
  citiesKnights: {
    id: 'citiesKnights',
    name: 'Cities & Knights',
    fan: false,
    weight: 3,
    blurb: 'Commodities, city improvements, knights and the barbarians.',
  },
  greedWealthPower: {
    id: 'greedWealthPower',
    name: 'Greed, Wealth & Power',
    fan: true,
    weight: 3,
    blurb: 'Two more tracks, new buildings, Beer, neutral pieces and a river.',
  },
  civilisations: {
    id: 'civilisations',
    name: 'Civilisations',
    fan: true,
    weight: 2,
    blurb: 'Each player leads a civilisation with its own abilities.',
  },
  church: {
    id: 'church',
    name: 'Church, Faith & Reformation',
    fan: true,
    weight: 2,
    blurb: 'A Religion track, Dioceses, Bread, Beer and festivals.',
  },
  witches: {
    id: 'witches',
    name: 'Witches, Wizards & Dragons',
    fan: true,
    weight: 2,
    blurb: 'A Magic track, Citadels, Crystal, the Wizard and dragons.',
  },
  worldWonders: {
    id: 'worldWonders',
    name: 'World Wonders',
    fan: true,
    weight: 2,
    blurb: 'Fourteen wonders in four stages. A finished one is needed to win.',
  },
  princes: {
    id: 'princes',
    name: 'Princes & Explorers',
    fan: true,
    weight: 2,
    blurb: 'Princes make buildings worth more; the robber takes points.',
  },
  soldiers: {
    id: 'soldiers',
    name: 'Soldiers & Armies',
    fan: true,
    weight: 3,
    blurb: 'Muster armies and fight for rivals’ settlements and cities.',
  },
  investors: {
    id: 'investors',
    name: 'Investors & Speculators',
    fan: true,
    weight: 2,
    blurb: 'An exchange market, savings and loans.',
  },
  kingdoms: {
    id: 'kingdoms',
    name: 'Kingdoms & Warriors',
    fan: true,
    weight: 2,
    blurb: 'Kingdoms spread from your cities and are fought over.',
  },
  landWater: {
    id: 'landWater',
    name: 'Land & Water',
    fan: true,
    weight: 3,
    blurb: 'No roads: trains, ships and planes travel the island.',
  },
  strategist: {
    id: 'strategist',
    name: 'Strategist & Commander',
    fan: true,
    weight: 1,
    blurb: 'The Junker freezes a field; the Duke and the Scholar join.',
  },
};

/** What the board itself adds to the weight. */
export function boardWeight(board: BoardInfo): number {
  if (board.kind === 'seafarers') return 1;
  if (board.group === 'explorers') return 3;
  if (board.group === 'treasures') return 2;
  if (board.group === 'traders') return 1;
  return 0;
}

export type Picked = ReadonlySet<ModeId> | readonly ModeId[];
const asSet = (p: Picked): Set<ModeId> => new Set(p);

/**
 * The modes a game is built with, from what was asked for. Earlier modes win
 * a conflict: Greed, Wealth & Power over Church and Witches, those over the
 * SiedlerInsel expansions, and so on. This is the server's rule.
 */
export function resolve(board: BoardInfo, wanted: Picked): Set<ModeId> {
  const w = asSet(wanted);
  const special = board.kind === 'special';
  const group = board.group ?? null;
  const ck = (w.has('citiesKnights') || board.needsCk === true) && board.noCk !== true;
  const gwp = ck && w.has('greedWealthPower') && !special;
  const civs = gwp && w.has('civilisations');
  const church = ck && !gwp && w.has('church') && !special;
  const witches = ck && !gwp && w.has('witches') && !special;
  const wonders = w.has('worldWonders') && !special;
  const bigFan = gwp || church || witches || wonders;
  const princes = w.has('princes') && !bigFan && !special;
  const soldiers = w.has('soldiers') && !bigFan && (!special || group === 'explorers');
  const investors =
    w.has('investors') && (!special || group === 'explorers' || group === 'traders');
  const kingdoms = w.has('kingdoms') && !bigFan && !princes && !soldiers && !special;
  const landWater =
    w.has('landWater') &&
    !bigFan &&
    !princes &&
    !soldiers &&
    !investors &&
    !kingdoms &&
    !special &&
    board.fog !== true;
  const strategist = w.has('strategist') && ck && !gwp && !landWater;
  const on: Record<ModeId, boolean> = {
    citiesKnights: ck,
    greedWealthPower: gwp,
    civilisations: civs,
    church,
    witches,
    worldWonders: wonders,
    princes,
    soldiers,
    investors,
    kingdoms,
    landWater,
    strategist,
  };
  return new Set(MODES.filter((m) => on[m]));
}

// ---- Why a mode can't join ----

type Clash = { kind: 'conflict' | 'notYet'; reason: string };

const NOT_YET = (a: string, b: string): Clash => ({
  kind: 'notYet',
  reason: `${a} doesn’t combine with ${b} yet.`,
});

/** Pairs that can't be played together, with why. Symmetric. */
const CLASHES: [ModeId, ModeId, Clash][] = [
  [
    'greedWealthPower',
    'church',
    { kind: 'conflict', reason: 'Greed, Wealth & Power has its own Religion track.' },
  ],
  [
    'greedWealthPower',
    'witches',
    { kind: 'conflict', reason: 'Greed, Wealth & Power has its own Magic track.' },
  ],
  [
    'greedWealthPower',
    'strategist',
    { kind: 'conflict', reason: 'Greed, Wealth & Power has its own Duke and Scholar.' },
  ],
  [
    'landWater',
    'strategist',
    { kind: 'conflict', reason: 'Land & Water has no knight pieces for the Duke.' },
  ],
  [
    'kingdoms',
    'soldiers',
    { kind: 'conflict', reason: 'Two army systems would fight over the same buildings.' },
  ],
];
for (const big of ['greedWealthPower', 'church', 'witches', 'worldWonders'] as const)
  for (const si of ['princes', 'soldiers', 'kingdoms', 'landWater'] as const)
    CLASHES.push([big, si, NOT_YET(MODE_INFO[si].name, MODE_INFO[big].name)]);
CLASHES.push(['princes', 'kingdoms', NOT_YET('Kingdoms & Warriors', 'Princes & Explorers')]);
for (const si of ['princes', 'soldiers', 'investors', 'kingdoms'] as const)
  CLASHES.push(['landWater', si, NOT_YET('Land & Water', MODE_INFO[si].name)]);

function clash(a: ModeId, b: ModeId): Clash | null {
  for (const [x, y, c] of CLASHES) if ((x === a && y === b) || (x === b && y === a)) return c;
  return null;
}

/** Why the board rules a mode out, if it does. */
function boardBlock(board: BoardInfo, m: ModeId): string | null {
  const special = board.kind === 'special';
  const group = board.group ?? null;
  if (m === 'citiesKnights') return board.noCk ? 'This map plays without Cities & Knights.' : null;
  if (m === 'investors')
    return special && group !== 'explorers' && group !== 'traders' ? 'Not on this map yet.' : null;
  if (m === 'soldiers') return special && group !== 'explorers' ? 'Not on this map yet.' : null;
  if (m === 'strategist') return null;
  if (m === 'landWater' && board.fog) return 'Its vehicles don’t explore fog.';
  return special ? 'Not on the special maps yet.' : null;
}

const REQUIRES: Partial<Record<ModeId, ModeId>> = {
  greedWealthPower: 'citiesKnights',
  civilisations: 'greedWealthPower',
  church: 'citiesKnights',
  witches: 'citiesKnights',
  strategist: 'citiesKnights',
};

// ---- Going well together ----

/** Why a mode suits what's picked, if it does. The first match is shown. */
function pairReason(board: BoardInfo, picked: Set<ModeId>, m: ModeId): string | null {
  const has = (x: ModeId) => picked.has(x);
  switch (m) {
    case 'citiesKnights':
      return board.kind === 'seafarers' ? 'The classic pairing with Seafarers.' : null;
    case 'witches':
      return has('church') ? 'Made to go with Church.' : null;
    case 'church':
      return has('witches') ? 'Made to go with Witches.' : null;
    case 'worldWonders':
      return has('civilisations') ? 'Designed together with Civilisations.' : null;
    case 'civilisations':
      return has('worldWonders') ? 'Designed together with World Wonders.' : null;
    case 'strategist':
      return has('citiesKnights') ? 'Made for Cities & Knights.' : null;
    case 'princes':
      return has('soldiers')
        ? 'Its authors pair it with Soldiers & Armies.'
        : has('citiesKnights')
          ? 'Its authors pair it with Cities & Knights.'
          : null;
    case 'soldiers':
      return has('princes')
        ? 'Its authors pair it with Princes & Explorers.'
        : board.group === 'explorers'
          ? 'Its authors pair it with Explorers & Pirates.'
          : null;
    case 'kingdoms':
      return has('citiesKnights') ? 'Knights join the kingdoms’ armies.' : null;
    case 'investors':
      return picked.size > 0 || board.kind !== 'usual'
        ? 'Its authors say it combines well with almost everything.'
        : null;
    case 'landWater':
      return board.kind === 'seafarers' ? 'Built around sea travel.' : null;
    default:
      return null;
  }
}

// ---- Weight ----

export type WeightLevel = 'fine' | 'heavy' | 'chaos';
/** Up to this, a game is fine; above it, long and rules-heavy. */
export const HEAVY_FROM = 6;
/** From this on, a mix tips into chaos. */
export const CHAOS_FROM = 8;

export function weightOf(board: BoardInfo, picked: Picked): number {
  let w = boardWeight(board);
  for (const m of asSet(picked)) w += MODE_INFO[m].weight;
  return w;
}

export function weightLevel(weight: number): WeightLevel {
  if (weight >= CHAOS_FROM) return 'chaos';
  if (weight >= HEAVY_FROM) return 'heavy';
  return 'fine';
}

// ---- Status of each mode ----

export interface ModeStatus {
  id: ModeId;
  /** picked; blocked (can't join); pair (goes well with what's picked); ok. */
  state: 'picked' | 'blocked' | 'pair' | 'ok';
  /** Why it's blocked or why it pairs well. */
  reason: string | null;
  /** A block that only waits on more work, not a clash in the rules. */
  notYet?: boolean;
  /** The total weight with this mode added (or as it stands, for a picked one). */
  weightWith: number;
}

/** Every mode's state against what's picked, for the selection screen. */
export function modeStatus(board: BoardInfo, picked: Picked): Record<ModeId, ModeStatus> {
  const set = resolve(board, picked);
  const base = weightOf(board, set);
  const out = {} as Record<ModeId, ModeStatus>;
  for (const m of MODES) {
    if (set.has(m)) {
      out[m] = { id: m, state: 'picked', reason: null, weightWith: base };
      continue;
    }
    const weightWith = base + MODE_INFO[m].weight;
    const block = blockReason(board, set, m);
    if (block) {
      out[m] = { id: m, state: 'blocked', reason: block.reason, weightWith };
      if (block.kind === 'notYet') out[m].notYet = true;
      continue;
    }
    const pair = pairReason(board, set, m);
    out[m] = { id: m, state: pair ? 'pair' : 'ok', reason: pair, weightWith };
  }
  return out;
}

function blockReason(board: BoardInfo, picked: Set<ModeId>, m: ModeId): Clash | null {
  const b = boardBlock(board, m);
  if (b) return { kind: 'notYet', reason: b };
  const need = REQUIRES[m];
  if (need && !picked.has(need) && !(need === 'citiesKnights' && board.needsCk))
    return { kind: 'conflict', reason: `Needs ${MODE_INFO[need].name}.` };
  for (const p of picked) {
    const c = clash(m, p);
    if (c) return c;
  }
  // Anything resolve still refuses (a rule the table above doesn't name).
  const next = resolve(board, [...picked, m]);
  if (!next.has(m) || [...picked].some((p) => !next.has(p)))
    return { kind: 'notYet', reason: 'Not with this mix yet.' };
  return null;
}

/** Things to warn about before the game starts, beyond the weight. */
export function warnings(board: BoardInfo, picked: Picked, vpTarget?: number): string[] {
  const set = resolve(board, picked);
  const out: string[] = [];
  const level = weightLevel(weightOf(board, set));
  if (level === 'chaos')
    out.push('This mix is very heavy: expect a long game with a lot of rules to track.');
  else if (level === 'heavy') out.push('A long, rules-heavy game.');
  if (set.has('citiesKnights') && set.has('soldiers'))
    out.push('Soldiers & Armies takes the place of the Cities & Knights knights.');
  if (set.has('princes') && set.has('soldiers'))
    out.push('Princes, robber walks and army battles at once: a lot to track each turn.');
  if (set.has('citiesKnights') && board.group === 'explorers')
    out.push('Explorers & Pirates with Cities & Knights is complex even by the official rules.');
  const fan = [...set].filter((m) => MODE_INFO[m].fan && m !== 'investors').length;
  if (set.has('investors') && fan >= 2)
    out.push('Investors & Speculators on top of two other fan expansions: many choices a turn.');
  if (vpTarget !== undefined && vpTarget > 18)
    out.push(`Playing to ${vpTarget} points makes for a long game.`);
  return out;
}
