import { ALL_TRACKS, commodityBank, type EventFace } from '@colonizers/module-cities-knights';

export const MODULE_ID = 'greed-wealth-power';

/** Greed, Wealth & Power: the three tracks it adds to Cities & Knights. */
export const GWP_TRACKS = ['magic', 'religion', 'wealth'] as const;
export const GWP_COMMODITIES = ['crystal', 'bread', 'gold'] as const;

export const GWP_VP_TARGET = 18;
export const GWP_PROGRESS_LIMIT = 5;

/**
 * The 12-sided event die: half ships as before, two of them also a wild gate,
 * and one gate for each of the six tracks.
 */
export const GWP_EVENT_FACES: EventFace[] = [
  'ship',
  'ship',
  'ship',
  'ship',
  'wild',
  'wild',
  'science',
  'trade',
  'politics',
  'magic',
  'religion',
  'wealth',
];

/** Owning one of these metropolises stops the other two tracks at level 3. */
export const EXCLUSIVE_METROPOLIS = ['science', 'magic', 'religion'] as const;

export const SETTINGS = {
  vpTarget: GWP_VP_TARGET,
  ckTracks: [...ALL_TRACKS],
  ckEventFaces: GWP_EVENT_FACES,
  progressLimit: GWP_PROGRESS_LIMIT,
  exclusiveMetropolis: [...EXCLUSIVE_METROPOLIS],
};

/** The four special buildings, one of each per player. */
export const BUILDINGS = ['citadel', 'diocese', 'monument', 'silo'] as const;
export type Building = (typeof BUILDINGS)[number];

/** What each building stands on: a hex that produces this card, or a gold field. */
export const BUILDING_HEX: Record<Building, string> = {
  citadel: 'brick',
  diocese: 'grain',
  monument: 'gold',
  silo: 'grain',
};

/** The commodity each building unlocks, if any. */
export const BUILDING_COMMODITY: Partial<Record<Building, string>> = {
  citadel: 'crystal',
  diocese: 'bread',
  monument: 'gold',
};

/** Beer festivals cost this much Beer (Beer itself comes from Religion level 3). */
export const BEER = 'beer';

export { commodityBank };

/**
 * The five new neutral pieces (the Merchant is the sixth), each placed by a
 * progress card of the same name in its track's deck.
 */
export const NEUTRALS = ['duke', 'scholar', 'wizard', 'inquisitor', 'envoy'] as const;
export type Neutral = (typeof NEUTRALS)[number];

export const NEUTRAL_DECK: Record<Neutral, string> = {
  duke: 'politics',
  scholar: 'science',
  wizard: 'magic',
  inquisitor: 'religion',
  envoy: 'wealth',
};

export const NEUTRAL_CARDS: Record<Neutral, number> = {
  duke: 4,
  scholar: 4,
  wizard: 5,
  inquisitor: 5,
  envoy: 5,
};

/** These three chase each other off a hex they share. */
export const RIVAL_NEUTRALS: readonly Neutral[] = ['scholar', 'wizard', 'inquisitor'];

/** Hero of Catan: one per player, five in the box. */
export const HERO_CARDS = 5;
