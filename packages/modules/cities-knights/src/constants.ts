export const MODULE_ID = 'cities-knights';

export const COMMODITIES = ['paper', 'cloth', 'coin'] as const;
export type Commodity = (typeof COMMODITIES)[number];

/** The three improvement tracks, each paid for with one commodity. */
export const TRACKS = ['science', 'trade', 'politics'] as const;
export type Track = (typeof TRACKS)[number];

export const TRACK_COMMODITY: Record<Track, Commodity> = {
  science: 'paper',
  trade: 'cloth',
  politics: 'coin',
};

/** A city on these hexes takes one resource and one commodity. */
export const TERRAIN_COMMODITY: Record<string, Commodity> = {
  forest: 'paper',
  pasture: 'cloth',
  mountains: 'coin',
};

export const MAX_LEVEL = 5;
/** Level that unlocks the track's special ability. */
export const ABILITY_LEVEL = 3;
/** Level that wins the metropolis if nobody holds it. */
export const METROPOLIS_LEVEL = 4;

/** Knight piece types, by strength. */
export const KNIGHT_TYPES = ['knight1', 'knight2', 'knight3'] as const;
export type KnightType = (typeof KNIGHT_TYPES)[number];

export const MAX_WALLS = 3;
export const WALL_HAND_BONUS = 2;
/** Progress cards a player can hold, not counting victory point cards. */
export const PROGRESS_HAND_LIMIT = 4;
export const DEFENDER_CARDS = 6;

/** Event die faces: three ship faces and one gate per track. */
export const EVENT_FACES = ['ship', 'ship', 'ship', 'science', 'trade', 'politics'] as const;
export type EventFace = (typeof EVENT_FACES)[number];

export const SCIENCE_CARDS = {
  alchemist: 2,
  crane: 2,
  engineer: 1,
  inventor: 2,
  irrigation: 2,
  medicine: 2,
  mining: 2,
  printer: 1,
  roadBuilding: 2,
  smith: 2,
} as const;

export const TRADE_CARDS = {
  commercialHarbor: 2,
  masterMerchant: 2,
  merchant: 6,
  merchantFleet: 2,
  resourceMonopoly: 4,
  tradeMonopoly: 2,
} as const;

export const POLITICS_CARDS = {
  bishop: 2,
  constitution: 1,
  deserter: 2,
  diplomat: 2,
  intrigue: 2,
  saboteur: 2,
  spy: 3,
  warlord: 2,
  wedding: 2,
} as const;

export const DECK_CARDS: Record<Track, Record<string, number>> = {
  science: SCIENCE_CARDS,
  trade: TRADE_CARDS,
  politics: POLITICS_CARDS,
};

/** Victory point cards are shown and scored as soon as they are drawn. */
export const VP_PROGRESS = ['printer', 'constitution'] as const;

export function deckOf(card: string): Track | null {
  for (const t of TRACKS) if (card in DECK_CARDS[t]) return t;
  return null;
}

export function commodityBank(players: number): number {
  if (players >= 7) return 18;
  if (players >= 5) return 15;
  return 12;
}

export function isCommodity(card: string): card is Commodity {
  return (COMMODITIES as readonly string[]).includes(card);
}

export function isTrack(t: unknown): t is Track {
  return typeof t === 'string' && (TRACKS as readonly string[]).includes(t);
}
