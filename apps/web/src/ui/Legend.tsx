import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  cornerHexes,
  edgeHexes,
  hexToPixel,
  type CornerId,
  type EdgeId,
  type GameState,
  type HexId,
  type HexState,
  type Piece,
} from '@colonizers/engine';
import { RULEBOOKS } from '@colonizers/rulebook';
import { WONDERS, type WonderId } from '@colonizers/module-world-wonders';
import { Board, BOARD_UNIT as S, noTargets } from '../board/Board.tsx';
import { EXPANSION_THEMES, useTheme } from '../theme/themes.tsx';
import { Modal } from './Modal.tsx';

/**
 * The legend: every tile, piece, character, building and mark, each shown in the current
 * board's own art. A sample is a tiny game state (a hex or three, a piece) handed to the real
 * board, so a board's paintings, finishes and tints show exactly as they do in play; nothing is
 * drawn here. The picture is then cropped to the item's own outline, so it fills its box.
 */

/** Where a sample stands: in a hex, on a corner where three hexes meet, or on an edge. */
type Spot = 'hex' | 'corner' | 'edge';

/**
 * How the picture is framed: a whole hex ('tile', for lands and marks on a land), the item alone
 * with the land hidden ('piece'), or the item cropped tight with its land kept behind ('shore').
 */
type Focus = 'tile' | 'piece' | 'shore';

/** Copies of a sample sit this many hexes apart, so variants share one picture at one scale. */
const STEP = 3;

const hexAt = (i: number): HexId => `h:${i * STEP},0`;
const cornerAt = (i: number): CornerId => `c:${i * STEP},0,N`;
/** The hex's top-right edge, between it and its neighbour. */
const edgeAt = (i: number): EdgeId => `e:${i * STEP},0,NE`;

interface At {
  hex: HexId;
  corner: CornerId;
  edge: EdgeId;
}

interface Where extends At {
  /** The viewer's seat: the sample's pieces are theirs. */
  me: number;
  /** Another seat, for a rival's piece. */
  them: number;
  /** The spots of copy i (0 is the first). */
  at: (i: number) => At;
}

interface SamplePiece {
  type: string;
  /** 'me' for the viewer's piece, 'them' for a rival's, null for a neutral one. */
  owner: 'me' | 'them' | null;
  /** Which copy it stands in (default 0). */
  slot?: number;
  /** Defaults to the sample's spot. */
  on?: Spot;
  props?: (w: Where) => Record<string, unknown>;
}

interface Sample {
  spot: Spot;
  /** The land under it: one type for every hex, or one per hex (in the spot's hex order). */
  land: string | string[];
  token?: number;
  hexProps?: Record<string, unknown>;
  hidden?: boolean;
  pieces?: SamplePiece[];
  harbor?: { resource: string; ratio: number };
  data?: (w: Where) => Record<string, Record<string, unknown>>;
  /** Copies laid side by side (default 1). */
  slots?: number;
  focus?: Focus;
}

export interface LegendEntry {
  id: string;
  name: string;
  text: string;
  /** What the pips, bars, dots, counts or fading on it mean. */
  marks?: string;
  /** Shown with this game when any of these modules is in it. */
  modules: string[];
  kind: 'tile' | 'piece';
  sample: Sample;
  /** A further test on the game, e.g. that it has this feature at all. */
  when?: (state: GameState) => boolean;
}

const CORNER_LAND = ['fields', 'forest', 'hills'];

const city = (props?: SamplePiece['props'], slot?: number): SamplePiece => ({
  type: 'city',
  owner: 'me',
  ...(props ? { props } : {}),
  ...(slot !== undefined ? { slot } : {}),
});

const cornerPiece = (
  type: string,
  owner: SamplePiece['owner'] = 'me',
  props?: SamplePiece['props'],
): Sample => ({
  spot: 'corner',
  land: CORNER_LAND,
  pieces: [{ type, owner, ...(props ? { props } : {}) }],
});

const hexPiece = (type: string, owner: SamplePiece['owner'], land = 'pasture'): Sample => ({
  spot: 'hex',
  land,
  pieces: [{ type, owner }],
});

const tile = (
  id: string,
  name: string,
  text: string,
  modules: string[],
  extra: Partial<LegendEntry> = {},
): LegendEntry => ({
  id: `tile-${id}`,
  name,
  text,
  modules,
  kind: 'tile',
  sample: { spot: 'hex', land: id, focus: 'tile' },
  ...extra,
});

const piece = (
  id: string,
  name: string,
  text: string,
  modules: string[],
  sample: Sample,
  extra: Partial<LegendEntry> = {},
): LegendEntry => ({ id, name, text, modules, kind: 'piece', sample, ...extra });

const hasHexProp = (key: string) => (s: GameState) =>
  Object.values(s.hexes).some((h) => h.props?.[key] !== undefined && h.props?.[key] !== false);

const KNIGHT_MARKS =
  'Strength 1 to 3, left to right. Painted knights grow bigger and better armed; drawn ones carry one stripe per level.';

/** Every entry, in the order the legend lists them. */
export const LEGEND: LegendEntry[] = [
  // ---- Lands ----
  tile('forest', 'Forest', 'Pays lumber when its number is rolled.', ['base']),
  tile('hills', 'Hills', 'Pays brick when its number is rolled.', ['base']),
  tile('pasture', 'Pasture', 'Pays wool when its number is rolled.', ['base']),
  tile('fields', 'Fields', 'Pays grain when its number is rolled.', ['base']),
  tile('mountains', 'Mountains', 'Pays ore when its number is rolled.', ['base']),
  tile('desert', 'Desert', 'Pays nothing. The robber starts here.', ['base']),
  tile('sea', 'Sea', 'Ships sail here, and harbors sit on its shore.', ['base']),
  tile('gold', 'Gold field', 'Pays any resource you choose: one per settlement, two per city.', [
    'seafarers',
    'explorers-pirates',
    'treasures-dragons',
  ]),
  tile(
    'volcano',
    'Volcano',
    'Pays like a gold field, then erupts: a die picks a corner, and what stands there is hurt.',
    ['special-maps'],
  ),
  tile('lake', 'Lake', 'Water inside the land. Pays nothing; harbors sit on its shore.', [
    'special-maps',
  ]),
  tile('oasis', 'Oasis', 'The caravans set out from here. The robber starts here.', [
    'traders-barbarians',
  ]),
  tile('castle', 'Castle', 'Knights ride out from here to fight the barbarians.', [
    'traders-barbarians',
  ]),
  tile('quarry', 'Quarry', 'Wagons carry its marble to the castle for points.', [
    'traders-barbarians',
  ]),
  tile('glassworks', 'Glassworks', 'Wagons carry its glass to the castle for points.', [
    'traders-barbarians',
  ]),
  tile(
    'shoal',
    'Fishing ground',
    'A numbered sea hex by the coast: buildings beside it catch fish.',
    ['traders-barbarians', 'explorers-pirates'],
  ),
  tile(
    'fishingLake',
    'Fishing lake',
    'Pays fish to the buildings around it.',
    ['traders-barbarians'],
    { marks: 'It pays on 2, 3, 11 and 12, the numbers shown on it.' },
  ),
  tile('swamp', 'Swamp', 'Pays nothing.', ['traders-barbarians', 'greed-wealth-power']),
  {
    ...tile(
      'hidden',
      'Unexplored',
      'Face down until a road or ship reaches it. Then it turns over.',
      ['seafarers', 'explorers-pirates', 'treasures-dragons'],
    ),
    sample: { spot: 'hex', land: 'hidden', hidden: true, focus: 'tile' },
  },

  // ---- Marks on the map ----
  {
    id: 'token',
    name: 'Number token',
    text: 'The land under it pays when this number is rolled.',
    marks:
      'The dots show how often it comes up: 5 dots for 6 and 8 (red, the most common), 1 dot for 2 and 12.',
    modules: ['base'],
    kind: 'tile',
    sample: { spot: 'hex', land: 'fields', token: 8, focus: 'tile' },
  },
  {
    id: 'harbor-any',
    name: 'Harbor 3:1',
    text: 'A settlement or city on its two posts trades any 3 of one resource for 1.',
    marks: 'The big number is the rate; "?" means any resource.',
    modules: ['base'],
    kind: 'tile',
    sample: {
      spot: 'edge',
      land: ['pasture', 'sea'],
      harbor: { resource: 'any', ratio: 3 },
      focus: 'shore',
    },
  },
  {
    id: 'harbor-two',
    name: 'Harbor 2:1',
    text: 'A settlement or city on its posts trades 2 of the shown resource for 1.',
    marks: 'The small picture under the rate is the resource it takes.',
    modules: ['base'],
    kind: 'tile',
    sample: {
      spot: 'edge',
      land: ['pasture', 'sea'],
      harbor: { resource: 'wool', ratio: 2 },
      focus: 'shore',
    },
  },
  {
    id: 'robbed-land',
    name: 'Robbed land',
    text: 'The land the robber stands on pays nothing.',
    marks: 'The land is darkened while the robber is there.',
    modules: ['base'],
    kind: 'tile',
    sample: {
      spot: 'hex',
      land: 'pasture',
      token: 6,
      pieces: [{ type: 'robber', owner: null }],
      focus: 'tile',
    },
    when: (s) => !s.modules.includes('explorers-pirates'),
  },
  {
    id: 'tile-gwp-river',
    name: 'River land',
    text: 'Keeps its land and number. A Monument beside it makes Gold.',
    marks: 'The blue river runs across the land.',
    modules: ['greed-wealth-power'],
    kind: 'tile',
    sample: { spot: 'hex', land: 'hills', token: 6, hexProps: { gwpRiver: true }, focus: 'tile' },
    when: hasHexProp('gwpRiver'),
  },
  {
    id: 'tile-enchanted',
    name: 'Enchanted land',
    text: 'A treasure made this land pay one card more.',
    marks: 'A gold glow around its edge.',
    modules: ['treasures-dragons'],
    kind: 'tile',
    sample: {
      spot: 'hex',
      land: 'pasture',
      token: 9,
      hexProps: { enchanted: true },
      focus: 'tile',
    },
  },

  // ---- Base game ----
  piece(
    'settlement',
    'Settlement',
    '1 point. Takes 1 card from each land around it when that land pays.',
    ['base'],
    cornerPiece('settlement'),
  ),
  piece(
    'city',
    'City',
    '2 points. Takes 2 cards from each land around it.',
    ['base'],
    cornerPiece('city'),
    { when: (s) => !s.modules.includes('explorers-pirates') },
  ),
  piece(
    'road',
    'Road',
    'Links your buildings. The longest unbroken road, 5 or more, scores 2 points.',
    ['base'],
    { spot: 'edge', land: ['forest', 'pasture'], pieces: [{ type: 'road', owner: 'me' }] },
  ),
  piece(
    'robber',
    'Robber',
    'Stops the land it stands on, and steals a card when moved. Moved on a 7 or a Knight card.',
    ['base'],
    hexPiece('robber', null),
    { when: (s) => !s.modules.includes('explorers-pirates') },
  ),
  piece(
    'neutral-builder',
    'Neutral builder',
    'Two-player duel: pieces nobody owns, built to block the board.',
    ['base'],
    {
      spot: 'corner',
      land: CORNER_LAND,
      slots: 2,
      pieces: [0, 1].map((n) => ({
        type: 'settlement',
        owner: null,
        slot: n,
        props: () => ({ neutral: n }),
      })),
    },
    {
      marks: 'White and black: the two neutral builders.',
      when: (s) => Object.values(s.pieces).some((p) => typeof p.props.neutral === 'number'),
    },
  ),

  // ---- Seafarers ----
  piece(
    'ship',
    'Ship',
    'A road on the water. Ships join into a trade route, and the loose end can sail on.',
    ['seafarers', 'explorers-pirates', 'treasures-dragons'],
    { spot: 'edge', land: 'sea', pieces: [{ type: 'ship', owner: 'me' }] },
  ),
  piece(
    'pirate',
    'Pirate ship',
    'The robber of the sea: no ship can be built or moved beside it, and it steals a card.',
    ['seafarers', 'explorers-pirates', 'treasures-dragons'],
    hexPiece('pirate', null, 'sea'),
  ),

  // ---- Explorers & Pirates ----
  piece(
    'ep-harbor',
    'Harbor settlement',
    '2 points. Ships load and unload here.',
    ['explorers-pirates'],
    { spot: 'corner', land: ['pasture', 'sea', 'sea'], pieces: [{ type: 'harbor', owner: 'me' }] },
  ),
  piece(
    'ep-cargo',
    'Ship cargo',
    'What a ship carries: a settler to found a settlement, a crew to storm a lair, fish or spice to sell.',
    ['explorers-pirates', 'soldiers'],
    {
      spot: 'edge',
      land: 'sea',
      slots: 4,
      pieces: ['settler', 'crew', 'fish', 'spice'].map((c, i) => ({
        type: 'ship',
        owner: 'me',
        slot: i,
        props: () => ({ cargo: [c] }),
      })),
    },
    { marks: 'Left to right: settler, crew, fish, spice. The cargo stands beside the ship.' },
  ),
  piece(
    'ep-boost',
    'Extra sails',
    'This ship has two more moves this turn.',
    ['explorers-pirates', 'landwater'],
    {
      spot: 'edge',
      land: 'sea',
      pieces: [{ type: 'ship', owner: 'me', props: () => ({ boost: true }) }],
    },
    { marks: 'A gold aura around the ship and white wind lines behind it.' },
  ),
  piece(
    'ep-lair',
    'Pirate lair',
    'Bring crews here to storm it. Whoever captures it scores.',
    ['explorers-pirates'],
    {
      spot: 'hex',
      land: 'pasture',
      data: (w) => ({
        'explorers-pirates': { lairs: { [w.hex]: { [w.me]: 2, [w.them]: 1 } } },
      }),
    },
    { marks: 'The dots under the skull are the crews there, in each player’s colour.' },
  ),
  piece(
    'ep-village',
    'Spice village',
    'A ship beside it buys spice for 2 gold.',
    ['explorers-pirates'],
    {
      spot: 'hex',
      land: 'forest',
      hexProps: { village: true },
      data: () => ({ 'explorers-pirates': {} }),
    },
  ),

  // ---- Traders & Barbarians ----
  piece('tb-river', 'River', 'Only a bridge can cross it.', ['traders-barbarians'], {
    spot: 'edge',
    land: ['hills', 'pasture'],
    pieces: [{ type: 'river', owner: null }],
    focus: 'shore',
  }),
  piece(
    'tb-bridge',
    'Bridge',
    'Your road across a river. Building it pays a coin.',
    ['traders-barbarians'],
    {
      spot: 'edge',
      land: ['hills', 'pasture'],
      pieces: [
        { type: 'river', owner: null },
        { type: 'bridge', owner: 'me' },
      ],
    },
  ),
  piece(
    'tb-camel',
    'Camel',
    'A caravan: a road beside it counts double for the longest road.',
    ['traders-barbarians'],
    {
      spot: 'edge',
      land: ['oasis', 'fields'],
      data: (w) => ({ 'traders-barbarians': { camels: [w.edge] } }),
    },
  ),
  piece(
    'tb-barbarians',
    'Barbarians',
    'They land on the coast. Three on one land hold it, and it pays nothing.',
    ['traders-barbarians'],
    {
      spot: 'hex',
      land: 'pasture',
      slots: 3,
      data: (w) => ({
        'traders-barbarians': {
          barbarians: { [w.at(0).hex]: 1, [w.at(1).hex]: 2, [w.at(2).hex]: 3 },
        },
      }),
    },
    { marks: 'The band grows with their number: 1, 2, then 3 (the land is held).' },
  ),
  piece(
    'tb-wagon',
    'Wagon',
    'Carries goods between the castle, the quarry and the glassworks.',
    ['traders-barbarians'],
    {
      spot: 'corner',
      land: ['quarry', 'pasture', 'fields'],
      data: (w) => ({ 'traders-barbarians': { wagons: { [w.me]: { corner: w.corner } } } }),
    },
  ),
  piece(
    'tb-knight',
    'Knight on a path',
    'Rides out from the castle and fights the barbarians it meets.',
    ['traders-barbarians'],
    {
      spot: 'edge',
      land: ['castle', 'pasture'],
      data: (w) => ({
        'traders-barbarians': { knights: [{ id: 'k', owner: w.me, edge: w.edge }] },
      }),
    },
  ),

  // ---- Treasures & Dragons ----
  piece(
    'td-chest',
    'Treasure chest',
    'Build a road or ship here to open it.',
    ['treasures-dragons'],
    {
      spot: 'corner',
      land: ['pasture', 'sea', 'forest'],
      pieces: [{ type: 'treasure', owner: null }],
    },
  ),
  piece(
    'td-dragons',
    'Dragons',
    'A dragon guards a corner. Beat it with a knight at least as strong.',
    ['treasures-dragons'],
    {
      spot: 'corner',
      land: ['mountains', 'hills', 'forest'],
      slots: 3,
      pieces: [1, 2, 3].map((tier, i) => ({
        type: 'dragon',
        owner: null,
        slot: i,
        props: () => ({ tier }),
      })),
    },
    {
      marks:
        'The gold pips under its feet are the knight strength it takes to beat it: 1, 2 or 3. Stronger dragons are bigger.',
    },
  ),
  piece(
    'td-hex-dragon',
    'Dragon on a land',
    'This land pays nothing while the dragon sits on it.',
    ['treasures-dragons'],
    {
      spot: 'hex',
      land: 'pasture',
      token: 9,
      focus: 'tile',
      data: (w) => ({ 'treasures-dragons': { dragons: { [w.hex]: 1 } } }),
    },
    { marks: 'The land glows pink, with the dragon beside its number.' },
  ),
  piece(
    'td-cut',
    'Road cut by dragons',
    'Dragons on both sides break this road until one of them leaves.',
    ['treasures-dragons'],
    {
      spot: 'edge',
      land: ['pasture', 'forest'],
      focus: 'shore',
      pieces: [{ type: 'road', owner: 'me' }],
      data: (w) => ({
        'treasures-dragons': {
          dragons: Object.fromEntries(edgeHexes(w.edge).map((h) => [h, 1])),
        },
      }),
    },
    { marks: 'A red cross on the road.' },
  ),

  // ---- Cities & Knights ----
  piece(
    'ck-knights',
    'Knights',
    'Active knights defend against the barbarians, chase off the robber and break rivals’ roads.',
    ['cities-knights', 'strategist', 'greed-wealth-power'],
    {
      spot: 'corner',
      land: CORNER_LAND,
      slots: 3,
      pieces: [1, 2, 3].map((level, i) => ({
        type: `knight${level}`,
        owner: 'me',
        slot: i,
        props: () => ({ active: true }),
      })),
    },
    { marks: KNIGHT_MARKS },
  ),
  piece(
    'ck-knight-idle',
    'Inactive knight',
    'Pay a grain to activate it. Only active knights fight.',
    ['cities-knights', 'strategist', 'greed-wealth-power'],
    cornerPiece('knight1', 'me', () => ({ active: false })),
    { marks: 'Faded.' },
  ),
  piece(
    'ck-wall',
    'City wall',
    'You may hold 2 more cards when a 7 is rolled. Lost before the city to the barbarians.',
    ['cities-knights'],
    { spot: 'corner', land: CORNER_LAND, pieces: [city(() => ({ wall: true }))] },
  ),
  piece(
    'ck-metro',
    'Metropolis',
    'The first to level 4 in a track: the city is worth 2 more points and is safe from the barbarians.',
    ['cities-knights'],
    {
      spot: 'corner',
      land: CORNER_LAND,
      slots: 3,
      pieces: (['science', 'trade', 'politics'] as const).map((track, i) =>
        city(() => ({ metropolis: track }), i),
      ),
    },
    { marks: 'The emblem shows the track: Science, Trade, Politics, left to right.' },
  ),
  piece(
    'ck-merchant',
    'Merchant',
    'While it is yours: 1 point, and you trade this land’s resource 2 for 1.',
    ['cities-knights'],
    hexPiece('merchant', 'me', 'pasture'),
  ),
  piece(
    'damaged-city',
    'Damaged city',
    'Hurt in battle. It pays nothing until it is repaired.',
    ['soldiers', 'cities-knights'],
    cornerPiece('city', 'me', () => ({ damaged: true })),
    { marks: 'Broken roof, and a little faded.' },
  ),

  // ---- Church, Witches: the extra metropolis towers and seats ----
  piece(
    'church-metro',
    'Metropolis (Religion)',
    'The first to level 4 in Religion: 2 more points.',
    ['church'],
    { spot: 'corner', land: CORNER_LAND, pieces: [city(() => ({ metropolis: 'religion' }))] },
  ),
  piece(
    'church-diocese',
    'Diocese',
    '1 point. Makes the Religion commodity and opens the Religion track.',
    ['church'],
    {
      spot: 'corner',
      land: CORNER_LAND,
      pieces: [city()],
      data: (w) => ({ 'cities-knights': { seats: { diocese: { [w.me]: w.corner } } } }),
    },
    { marks: 'It stands over the city it belongs to.' },
  ),
  piece(
    'church-festival',
    'Festival',
    'The piece under it stops until its holder’s next turn.',
    ['church'],
    {
      spot: 'corner',
      land: CORNER_LAND,
      pieces: [{ type: 'settlement', owner: 'them' }],
      data: (w) => ({
        church: { festivals: [{ by: w.me, target: w.them, at: w.corner, kind: 'settlement' }] },
      }),
    },
  ),
  piece(
    'church-inquisitor',
    'Inquisitor',
    'This city’s owner has no level 3 abilities.',
    ['church'],
    {
      spot: 'corner',
      land: CORNER_LAND,
      pieces: [{ type: 'city', owner: 'them' }],
      data: (w) => ({ church: { inquisitor: w.corner } }),
    },
  ),
  piece(
    'witches-metro',
    'Metropolis (Magic)',
    'The first to level 4 in Magic: 2 more points.',
    ['witches'],
    { spot: 'corner', land: CORNER_LAND, pieces: [city(() => ({ metropolis: 'magic' }))] },
  ),
  piece(
    'witches-citadel',
    'Citadel (Magic seat)',
    '1 point. Makes the Magic commodity and opens the Magic track.',
    ['witches'],
    {
      spot: 'corner',
      land: CORNER_LAND,
      pieces: [city()],
      data: (w) => ({ 'cities-knights': { seats: { citadel: { [w.me]: w.corner } } } }),
    },
  ),
  piece(
    'witches-wizard',
    'Wizard',
    'The robber can’t stop this building or steal through it.',
    ['witches'],
    {
      spot: 'corner',
      land: CORNER_LAND,
      pieces: [city(), { type: 'wizard', owner: null, props: (w) => ({ by: w.me }) }],
    },
    { marks: 'It wears its owner’s colour.' },
  ),

  // ---- Princes ----
  piece(
    'princes-prince',
    'Prince',
    'Buildings on this land score a point more, and roads here count double for the longest road.',
    ['princes'],
    hexPiece('prince', null, 'fields'),
  ),
  piece('princes-citadel', 'Citadel', 'A city with a citadel scores a point more.', ['princes'], {
    spot: 'corner',
    land: CORNER_LAND,
    pieces: [city(() => ({ citadel: true }))],
  }),

  // ---- Soldiers & Armies ----
  piece(
    'soldiers-army',
    'Army',
    'Infantry, cavalry and artillery mustered at your building.',
    ['soldiers'],
    cornerPiece('army', 'me', () => ({ infantry: 2, cavalry: 1 })),
    { marks: 'The number on the disc is how many units it has.' },
  ),
  piece(
    'soldiers-nuke',
    'Nuke',
    'Used once, on a land up to 6 away.',
    ['soldiers'],
    cornerPiece('nuke'),
  ),
  piece(
    'soldiers-nuked',
    'Nuked land',
    'Pays nothing for the rest of the game.',
    ['soldiers'],
    {
      spot: 'hex',
      land: 'forest',
      token: 6,
      focus: 'tile',
      data: (w) => ({ soldiers: { nuked: { [w.hex]: true } } }),
    },
    { marks: 'The radiation mark beside its number.' },
  ),

  // ---- Kingdoms & Warriors ----
  piece(
    'kingdoms-marker',
    'Kingdom marker',
    'Takes this land’s resource. Every 3 joined together make a point.',
    ['kingdoms'],
    hexPiece('kingdom', 'me', 'fields'),
  ),
  piece(
    'kingdoms-fight',
    'Contested land',
    'Your marker on a rival’s land: you fight when the turn ends.',
    ['kingdoms'],
    {
      spot: 'hex',
      land: 'fields',
      pieces: [{ type: 'kingdom', owner: 'me', props: () => ({ contest: 'fight' }) }],
    },
    { marks: 'Crossed swords instead of the crown.' },
  ),

  // ---- Land & Water ----
  ...(
    [
      ['train', 'Train', 'Runs along your roads, carrying goods between your buildings.'],
      ['ferry', 'Ferry', 'Crosses the water between your harbors.'],
      ['plane', 'Plane', 'Flies between your cities, over land and sea.'],
    ] as const
  ).map(([type, name, text]) =>
    piece(`lw-${type}`, name, text, ['landwater'], cornerPiece(type), {
      marks: 'Faded with a dashed edge when passive: pay to activate it before it moves again.',
    }),
  ),

  // ---- Strategist ----
  piece(
    'sf-junker',
    'Junker',
    'Nothing is built or moved on this land, and the barbarians don’t see its knights and cities.',
    ['strategist'],
    hexPiece('junker', null, 'forest'),
  ),
  piece(
    'sf-duke',
    'Duke',
    'Stands by a knight: its owner’s knight is 1 stronger, a rival’s 1 weaker.',
    ['strategist'],
    cornerPiece('knight2', 'me', (w) => ({ active: true, duke: w.me })),
  ),
  piece(
    'sf-scholar',
    'Scholar',
    'Its owner gets what this building makes again, until the barbarians land.',
    ['strategist'],
    { spot: 'corner', land: CORNER_LAND, pieces: [city((w) => ({ scholar: { owner: w.me } }))] },
  ),

  // ---- Greed, Wealth & Power ----
  piece(
    'gwp-metro',
    'Metropolis (Wealth)',
    'The first to level 4 in Wealth: 2 more points.',
    ['greed-wealth-power'],
    { spot: 'corner', land: CORNER_LAND, pieces: [city(() => ({ metropolis: 'wealth' }))] },
  ),
  ...(
    [
      [
        'citadel',
        'Citadel',
        'hills',
        'On a brick land: your cities there make 1 brick and 1 Crystal.',
      ],
      [
        'diocese',
        'Diocese',
        'fields',
        'On a grain land: your cities there make 1 grain and 1 Bread.',
      ],
      [
        'monument',
        'Monument',
        'gold',
        'On a gold field or river: your cities there make 1 Gold and a resource.',
      ],
      ['silo', 'Silo', 'fields', 'On a grain land: your cities there make 1 more grain.'],
    ] as const
  ).map(([building, name, land, text]) =>
    piece(
      `gwp-${building}`,
      name,
      text,
      ['greed-wealth-power'],
      {
        spot: 'corner',
        land,
        data: (w) => ({
          'greed-wealth-power': {
            buildings: { [w.me]: { [building]: { corner: w.corner, hex: w.hex } } },
          },
        }),
      },
      { marks: 'It stands on a base in its owner’s colour.' },
    ),
  ),
  piece(
    'gwp-deed',
    'Land Deed',
    'This spot is held for its owner: nobody else may build here.',
    ['greed-wealth-power'],
    {
      spot: 'corner',
      land: CORNER_LAND,
      data: (w) => ({ 'greed-wealth-power': { deeds: { [w.me]: w.corner } } }),
    },
    { marks: 'A short wall in its owner’s colour inside a dashed ring.' },
  ),
  ...(
    [
      ['duke', 'Duke', 'Your knights on its corners are 1 stronger; everyone else’s are 1 weaker.'],
      ['scholar', 'Scholar', '1 more card for you when this land pays.'],
      ['wizard', 'Wizard', 'The robber does not stop your production here.'],
      ['inquisitor', 'Inquisitor', 'The player it watches has no level 3 abilities.'],
      ['envoy', 'Envoy', '1 card for you when this land pays.'],
    ] as const
  ).map(([type, name, text]) =>
    piece(
      `gwp-${type}`,
      name,
      `${text} 1 point while it is yours.`,
      ['greed-wealth-power'],
      hexPiece(type, 'me'),
      {
        marks: 'It wears the colour of the player who holds it.',
      },
    ),
  ),
  piece(
    'gwp-dragon',
    'Dragon',
    'The land it sits on pays nothing. In its lair only a mighty knight can drive it out.',
    ['greed-wealth-power'],
    hexPiece('gwpDragon', null, 'mountains'),
  ),
  piece(
    'gwp-damsel',
    'Damsel',
    'Nothing may be built beside her, and cities by her are safe from the barbarians.',
    ['greed-wealth-power'],
    hexPiece('damsel', null, 'fields'),
  ),

  // ---- World Wonders: one card per wonder ----
  ...(Object.values(WONDERS) as { id: WonderId; name: string; needs: string }[]).map((wd) =>
    piece(
      `ww-${wd.id}`,
      wd.name,
      `Needs ${wd.needs}.`,
      ['world-wonders'],
      {
        spot: 'hex',
        land: 'desert',
        data: (w) => ({
          'world-wonders': { wonders: { [wd.id]: { owner: w.me, hex: w.hex, stages: 2 } } },
        }),
      },
      { marks: 'A plinth in its builder’s colour. Lit pips are the stages built, out of 4.' },
    ),
  ),
];

/** True when this entry belongs to the game being played. */
function inGame(e: LegendEntry, state: GameState): boolean {
  return e.modules.some((m) => state.modules.includes(m)) && (!e.when || e.when(state));
}

/** An entry that this game's expansions have, but that this game turned off (no city in E&P). */
function turnedOff(e: LegendEntry, state: GameState): boolean {
  return e.modules.some((m) => state.modules.includes(m)) && !!e.when && !e.when(state);
}

/** This game's entries, then the rest (grouped by the expansion they come from). */
export function legendFor(state: GameState): { mine: LegendEntry[]; others: LegendEntry[] } {
  const mine = LEGEND.filter((e) => inGame(e, state));
  const others = LEGEND.filter((e) => !inGame(e, state) && !turnedOff(e, state) && !e.when);
  return { mine, others };
}

function hexesFor(spot: Spot, i: number): HexId[] {
  if (spot === 'hex') return [hexAt(i)];
  if (spot === 'corner') return cornerHexes(cornerAt(i));
  return edgeHexes(edgeAt(i));
}

/** The small game state that shows one entry, built on the real game for its players and rules. */
export function sampleState(base: GameState, entry: LegendEntry, me: number): GameState {
  const sample = entry.sample;
  const them = base.players.length > 1 ? (me + 1) % base.players.length : me;
  const at = (i: number): At => ({
    hex: hexesFor(sample.spot, i)[0]!,
    corner: cornerAt(i),
    edge: edgeAt(i),
  });
  const hexes: Record<HexId, HexState> = {};
  for (let i = 0; i < (sample.slots ?? 1); i++) {
    const ids = hexesFor(sample.spot, i);
    const lands =
      typeof sample.land === 'string' ? ids.map(() => sample.land as string) : sample.land;
    ids.forEach((id, k) => {
      const [q, r] = id.slice(2).split(',').map(Number) as [number, number];
      const main = k === 0;
      hexes[id] = {
        id,
        q,
        r,
        type: lands[k] ?? lands[0] ?? 'pasture',
        ...(main && sample.token ? { token: sample.token } : {}),
        ...(main && sample.hexProps ? { props: sample.hexProps } : {}),
        ...(sample.hidden ? { hidden: true } : {}),
      };
    });
  }
  const w: Where = { ...at(0), me, them, at };
  const pieces: Record<string, Piece> = {};
  (sample.pieces ?? []).forEach((p, n) => {
    const on = p.on ?? sample.spot;
    const spot = at(p.slot ?? 0);
    const id = `legend-${n}`;
    pieces[id] = {
      id,
      type: p.type,
      owner: p.owner === 'me' ? me : p.owner === 'them' ? them : null,
      at:
        on === 'hex'
          ? { kind: 'hex', id: spot.hex }
          : on === 'corner'
            ? { kind: 'corner', id: spot.corner }
            : { kind: 'edge', id: spot.edge },
      props: p.props?.(w) ?? {},
      placedTurn: 0,
    };
  });
  return {
    ...base,
    // An entry from another expansion is drawn as that expansion's game would draw it.
    modules: [...new Set([...base.modules, ...entry.modules])],
    hexes,
    pieces,
    harbors: sample.harbor ? [{ edge: w.edge, ...sample.harbor }] : [],
    data: sample.data?.(w) ?? {},
  };
}

const focusOf = (entry: LegendEntry): Focus =>
  entry.sample.focus ?? (entry.kind === 'tile' ? 'tile' : 'piece');

/** Whole hexes: the copies' hexes, edge to edge. */
function tileFrame(state: GameState): Box {
  const box = emptyBox();
  for (const h of Object.values(state.hexes)) {
    const c = hexToPixel(h.q, h.r, S);
    grow(box, { x: c.x - 0.87 * S, y: c.y - S, width: 1.74 * S, height: 2 * S });
  }
  return box;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const emptyBox = (): Box => ({ x: Infinity, y: Infinity, width: -Infinity, height: -Infinity });

function grow(box: Box, b: Box) {
  if (!Number.isFinite(box.x)) {
    Object.assign(box, { x: b.x, y: b.y, width: b.width, height: b.height });
    return;
  }
  const x2 = Math.max(box.x + box.width, b.x + b.width);
  const y2 = Math.max(box.y + box.height, b.y + b.height);
  box.x = Math.min(box.x, b.x);
  box.y = Math.min(box.y, b.y);
  box.width = x2 - box.x;
  box.height = y2 - box.y;
}

/** Parts of a drawing that are never seen themselves: they paint, clip or describe other parts. */
const UNSEEN = new Set([
  'defs',
  'filter',
  'mask',
  'clippath',
  'pattern',
  'lineargradient',
  'radialgradient',
  'title',
  'symbol',
  'marker',
]);
const SHAPES = new Set([
  'path',
  'circle',
  'ellipse',
  'rect',
  'line',
  'polyline',
  'polygon',
  'text',
  'image',
  'use',
]);

/** The share of a picture that is not transparent: [left, top, right, bottom], 0 to 1. */
const opaque = new Map<string, Promise<[number, number, number, number]>>();

function opaqueOf(href: string): Promise<[number, number, number, number]> {
  let found = opaque.get(href);
  if (!found) {
    found = new Promise((resolve) => {
      const whole: [number, number, number, number] = [0, 0, 1, 1];
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, 256 / Math.max(img.naturalWidth, img.naturalHeight, 1));
        const w = Math.max(1, Math.round(img.naturalWidth * k));
        const h = Math.max(1, Math.round(img.naturalHeight * k));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(whole);
        ctx.drawImage(img, 0, 0, w, h);
        let data: Uint8ClampedArray;
        try {
          data = ctx.getImageData(0, 0, w, h).data;
        } catch {
          return resolve(whole);
        }
        let [x0, y0, x1, y1] = [w, h, -1, -1];
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++)
            if (data[(y * w + x) * 4 + 3]! > 40) {
              if (x < x0) x0 = x;
              if (x > x1) x1 = x;
              if (y < y0) y0 = y;
              if (y > y1) y1 = y;
            }
        resolve(x1 < 0 ? whole : [x0 / w, y0 / h, (x1 + 1) / w, (y1 + 1) / h]);
      };
      img.onerror = () => resolve(whole);
      img.src = href;
    });
    opaque.set(href, found);
  }
  return found;
}

/** Where an <image> really paints inside its box, after preserveAspectRatio and transparency. */
async function imageArea(el: SVGImageElement, b: Box): Promise<Box> {
  const href = el.getAttribute('href') ?? el.getAttribute('xlink:href');
  if (!href) return b;
  const [fx0, fy0, fx1, fy1] = await opaqueOf(href);
  // The picture's own shape, from a fresh load (cached by the browser).
  const size = await new Promise<[number, number]>((resolve) => {
    const img = new Image();
    img.onload = () => resolve([img.naturalWidth || 1, img.naturalHeight || 1]);
    img.onerror = () => resolve([b.width, b.height]);
    img.src = href;
  });
  const par = (el.getAttribute('preserveAspectRatio') ?? 'xMidYMid meet').split(/\s+/);
  let dw = b.width;
  let dh = b.height;
  let ox = 0;
  let oy = 0;
  if (par[0] !== 'none') {
    const scale = (par[1] === 'slice' ? Math.max : Math.min)(b.width / size[0], b.height / size[1]);
    dw = size[0] * scale;
    dh = size[1] * scale;
    const align = par[0] ?? 'xMidYMid';
    ox = align.startsWith('xMin')
      ? 0
      : align.startsWith('xMax')
        ? b.width - dw
        : (b.width - dw) / 2;
    oy = align.endsWith('YMin') ? 0 : align.endsWith('YMax') ? b.height - dh : (b.height - dh) / 2;
  }
  const x0 = Math.max(b.x, b.x + ox + fx0 * dw);
  const y0 = Math.max(b.y, b.y + oy + fy0 * dh);
  const x1 = Math.min(b.x + b.width, b.x + ox + fx1 * dw);
  const y1 = Math.min(b.y + b.height, b.y + oy + fy1 * dh);
  return { x: x0, y: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0) };
}

/** A box in an element's own units, moved into the board's units. */
function toBoard(svg: SVGSVGElement, el: SVGGraphicsElement, b: Box): Box {
  const from = el.getScreenCTM();
  const to = svg.getScreenCTM();
  if (!from || !to) return b;
  const m = to.inverse().multiply(from);
  const box = emptyBox();
  for (const [x, y] of [
    [b.x, b.y],
    [b.x + b.width, b.y],
    [b.x, b.y + b.height],
    [b.x + b.width, b.y + b.height],
  ] as const) {
    const p = new DOMPoint(x, y).matrixTransform(m);
    grow(box, { x: p.x, y: p.y, width: 0, height: 0 });
  }
  return box;
}

/**
 * The item's own outline: every visible shape the board drew, except the land, trimmed to the
 * painted part of each picture (sprite files carry clear margins around the figure).
 */
export async function itemBox(
  svg: SVGSVGElement,
  near?: { x0: number; x1: number },
): Promise<Box | null> {
  const parts: Promise<Box | null>[] = [];
  const visit = (el: Element) => {
    const tag = el.tagName.toLowerCase();
    if (UNSEEN.has(tag) || el.classList.contains('hex-tile') || el.classList.contains('target'))
      return;
    if (!SHAPES.has(tag)) {
      for (const c of Array.from(el.children)) visit(c);
      return;
    }
    const g = el as SVGGraphicsElement;
    const style = getComputedStyle(g);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return;
    if (
      tag !== 'image' &&
      tag !== 'text' &&
      tag !== 'use' &&
      style.fill === 'none' &&
      style.stroke === 'none'
    )
      return;
    const raw = g.getBBox();
    if (raw.width <= 0 && raw.height <= 0) return;
    const pad =
      tag === 'image' || style.stroke === 'none' ? 0 : (parseFloat(style.strokeWidth) || 0) / 2;
    const b = {
      x: raw.x - pad,
      y: raw.y - pad,
      width: raw.width + 2 * pad,
      height: raw.height + 2 * pad,
    };
    parts.push(
      (tag === 'image' ? imageArea(g as SVGImageElement, b) : Promise.resolve(b)).then((a) =>
        a.width > 0 || a.height > 0 ? toBoard(svg, g, a) : null,
      ),
    );
  };
  for (const c of Array.from(svg.children)) visit(c);
  const box = emptyBox();
  for (const b of await Promise.all(parts)) {
    if (!b) continue;
    const cx = b.x + b.width / 2;
    if (near && (cx < near.x0 || cx > near.x1)) continue;
    grow(box, b);
  }
  return Number.isFinite(box.x) ? box : null;
}

/** A box padded on every side and stretched to the shape it will be shown in. */
export function framed(b: Box, aspect: number, pad = 0.1): Box {
  let w = b.width * (1 + 2 * pad);
  let h = b.height * (1 + 2 * pad);
  if (w / h < aspect) w = h * aspect;
  else h = w / aspect;
  return { x: b.x + b.width / 2 - w / 2, y: b.y + b.height / 2 - h / 2, width: w, height: h };
}

/** The picture's shape: about square, a little wider for long items such as roads. */
const aspectOf = (b: Box) => Math.min(1.5, Math.max(1, b.width / b.height));

const noop = () => {};
const view = (b: Box) => `${b.x} ${b.y} ${b.width} ${b.height}`;

/** Where slot i sits across, and the strip of board around it that belongs to it. */
const slotStrip = (i: number) => {
  const x = hexToPixel(i * STEP, 0, S).x;
  const half = (hexToPixel(STEP, 0, S).x - hexToPixel(0, 0, S).x) / 2;
  return { x0: x - half, x1: x + half };
};

/**
 * Variants (knights, dragons, barbarian bands) are each shown in their own picture, side by
 * side, all at one scale and standing on one line, so a bigger piece still looks bigger.
 */
export function commonFrames(boxes: Box[]): Box[] {
  const w = Math.max(...boxes.map((b) => b.width));
  const h = Math.max(...boxes.map((b) => b.height));
  return boxes.map((b) =>
    framed(
      { x: b.x + b.width / 2 - w / 2, y: b.y + b.height - h, width: w, height: h },
      aspectOf({ x: 0, y: 0, width: w, height: h }),
    ),
  );
}

const Picture = memo(function Picture({
  state,
  entry,
  me,
}: {
  state: GameState;
  entry: LegendEntry;
  me: number;
}) {
  const mini = useMemo(() => sampleState(state, entry, me), [state, entry, me]);
  const focus = focusOf(entry);
  const slots = entry.sample.slots ?? 1;
  const tiles = useMemo(() => tileFrame(mini), [mini]);
  const [boxes, setBoxes] = useState<Box[] | null>(
    focus === 'tile' ? [framed(tiles, aspectOf(tiles), 0.02)] : null,
  );
  const wrap = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (focus === 'tile') return;
    const svgs = Array.from(wrap.current?.querySelectorAll('svg.board') ?? []) as SVGSVGElement[];
    if (svgs.length < slots) return;
    let live = true;
    void Promise.all(
      svgs.slice(0, slots).map((svg, i) => itemBox(svg, slots > 1 ? slotStrip(i) : undefined)),
    ).then((found) => {
      if (!live) return;
      if (found.some((b) => !b)) setBoxes([framed(tiles, aspectOf(tiles), 0.02)]);
      else if (slots > 1) setBoxes(commonFrames(found as Box[]));
      else setBoxes([framed(found[0]!, aspectOf(found[0]!))]);
    });
    return () => {
      live = false;
    };
  }, [focus, tiles, slots]);
  const count = focus === 'tile' ? 1 : slots;
  return (
    <div ref={wrap} className="legend-pictures" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => {
        const box = boxes?.[i] ?? boxes?.[0];
        return (
          <div
            key={i}
            className={`legend-art legend-${focus}`}
            style={{ aspectRatio: String(box ? box.width / box.height : 1), opacity: box ? 1 : 0 }}
          >
            <Board state={mini} targets={noTargets} onAction={noop} frame={view(box ?? tiles)} />
          </div>
        );
      })}
    </div>
  );
});

const MODULE_NAME = new Map(RULEBOOKS.map((b) => [b.module, b.name]));

/** Groups entries for display: lands and map marks, then pieces by the expansion they come from. */
function grouped(list: LegendEntry[], modules: readonly string[]): [string, LegendEntry[]][] {
  const out = new Map<string, LegendEntry[]>();
  const add = (k: string, e: LegendEntry) => out.set(k, [...(out.get(k) ?? []), e]);
  for (const e of list) {
    if (e.kind === 'tile') add(e.id.startsWith('tile-') ? 'Lands' : 'Map marks', e);
    else {
      const m = e.modules.find((id) => modules.includes(id)) ?? e.modules[0]!;
      add(m === 'base' ? 'Pieces' : (MODULE_NAME.get(m) ?? m), e);
    }
  }
  return [...out];
}

function Cards({
  state,
  list,
  seat,
  modules,
}: {
  state: GameState;
  list: LegendEntry[];
  seat: number;
  modules: readonly string[];
}) {
  return (
    <>
      {grouped(list, modules).map(([title, items]) => (
        <section key={title} className="legend-section">
          <h3>{title}</h3>
          <ul className="legend-grid">
            {items.map((e) => (
              <li key={e.id} className={`legend-item${(e.sample.slots ?? 1) > 1 ? ' wide' : ''}`}>
                <Picture state={state} entry={e} me={seat} />
                <div>
                  <strong>{e.name}</strong>
                  <p>{e.text}</p>
                  {e.marks && <p className="legend-marks">{e.marks}</p>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

/** The legend dialog: this game's lands, marks and pieces, then every other expansion's. */
export function Legend({
  state,
  seat,
  onClose,
}: {
  state: GameState;
  /** Whose colour the pieces are drawn in. */
  seat: number;
  onClose: () => void;
}) {
  // Only the board's layout and rules matter here, not every move, so a move behind the
  // dialog doesn't redraw every picture.
  const [base] = useState(state);
  const theme = useTheme();
  const { mine, others } = useMemo(() => legendFor(base), [base]);
  // Only the expansion boards have art for every expansion's pieces.
  const showOthers = EXPANSION_THEMES.includes(theme.id) && others.length > 0;
  const [open, setOpen] = useState(false);
  return (
    <Modal title="Legend" onClose={onClose} wide>
      <div className="legend">
        <Cards state={base} list={mine} seat={seat} modules={base.modules} />
        {showOthers && (
          <details className="legend-others" onToggle={(e) => setOpen(e.currentTarget.open)}>
            <summary>Other expansions</summary>
            {open && <Cards state={base} list={others} seat={seat} modules={[]} />}
          </details>
        )}
      </div>
    </Modal>
  );
}
