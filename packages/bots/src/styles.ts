export const STYLES = ['balanced', 'builder', 'city', 'army', 'trader'] as const;
export type Style = (typeof STYLES)[number];

export const LEVELS = ['easy', 'medium', 'hard'] as const;
export type Level = (typeof LEVELS)[number];

export interface StyleWeights {
  /** How much each resource's production is worth (1 = average). */
  resources: Record<string, number>;
  /** How much saving toward each build is worth. */
  targets: Record<string, number>;
  expand: number;
  road: number;
  army: number;
  harbor: number;
  /** How keen it is to offer trades to other players (0 to 1). */
  trade: number;
}

const BASE: StyleWeights = {
  resources: { brick: 1, lumber: 1, wool: 0.85, grain: 1.05, ore: 1 },
  targets: {
    settlement: 1.4,
    city: 1.4,
    road: 0.5,
    ship: 0.5,
    devCard: 0.7,
    knight: 0.7,
    wall: 0.3,
  },
  expand: 1,
  road: 1,
  army: 1,
  harbor: 1,
  trade: 0.4,
};

export const STYLE_WEIGHTS: Record<Style, StyleWeights> = {
  balanced: BASE,
  builder: {
    ...BASE,
    resources: { brick: 1.2, lumber: 1.2, wool: 0.9, grain: 0.95, ore: 0.75 },
    targets: { ...BASE.targets, settlement: 1.7, road: 0.8, ship: 0.7, city: 1.1 },
    expand: 1.4,
    road: 1.8,
  },
  city: {
    ...BASE,
    resources: { brick: 0.8, lumber: 0.8, wool: 0.9, grain: 1.25, ore: 1.3 },
    targets: { ...BASE.targets, city: 1.9, devCard: 0.9, settlement: 1.1 },
    expand: 0.8,
  },
  army: {
    ...BASE,
    resources: { brick: 0.85, lumber: 0.85, wool: 1.1, grain: 1.1, ore: 1.2 },
    targets: { ...BASE.targets, devCard: 1.5, knight: 1.4, city: 1.3 },
    army: 1.8,
  },
  trader: {
    ...BASE,
    harbor: 2,
    trade: 0.9,
  },
};

export const STYLE_INFO: Record<Style, { name: string; text: string }> = {
  balanced: { name: 'Balanced', text: 'Adapts to the board.' },
  builder: { name: 'Builder', text: 'Roads and settlements, goes for the longest road.' },
  city: { name: 'City', text: 'Grain and ore, cities and development.' },
  army: { name: 'Army', text: 'Knights and development cards.' },
  trader: { name: 'Trader', text: 'Trades a lot and uses harbors.' },
};

export const LEVEL_INFO: Record<Level, { name: string; text: string }> = {
  easy: {
    name: 'Easy',
    text: 'Plays good moves, but often not the very best one. Good for learning.',
  },
  medium: {
    name: 'Medium',
    text: 'Weighs every move by production, points and what it can build next.',
  },
  hard: { name: 'Hard', text: 'Plans each turn a few moves ahead and plays to stop the leader.' },
};
