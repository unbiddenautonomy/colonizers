/**
 * What goes on a board for each player count (PLAN.md section 2).
 */
export interface ComponentSet {
  terrain: Record<string, number>;
  tokens: Record<number, number>;
  harbors: Record<string, number>;
}

export const RESOURCE_OF: Record<string, string> = {
  hills: 'brick',
  forest: 'lumber',
  pasture: 'wool',
  fields: 'grain',
  mountains: 'ore',
};

export const PIPS: Record<number, number> = {
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

export const BASE_COMPONENTS: ComponentSet = {
  terrain: { forest: 4, pasture: 4, fields: 4, hills: 3, mountains: 3, desert: 1 },
  tokens: { 2: 1, 3: 2, 4: 2, 5: 2, 6: 2, 8: 2, 9: 2, 10: 2, 11: 2, 12: 1 },
  harbors: { any: 4, brick: 1, lumber: 1, wool: 1, grain: 1, ore: 1 },
};

export const FIVE_SIX_COMPONENTS: ComponentSet = {
  terrain: { forest: 6, pasture: 6, fields: 6, hills: 5, mountains: 5, desert: 2 },
  tokens: { 2: 2, 3: 3, 4: 3, 5: 3, 6: 3, 8: 3, 9: 3, 10: 3, 11: 3, 12: 2 },
  harbors: { any: 5, brick: 1, lumber: 1, wool: 2, grain: 1, ore: 1 },
};

/** Our 7–8 player draft (PLAN.md section 2.3). */
export const SEVEN_EIGHT_COMPONENTS: ComponentSet = {
  terrain: { forest: 8, pasture: 8, fields: 8, hills: 6, mountains: 6, desert: 1 },
  tokens: { 2: 2, 3: 4, 4: 4, 5: 4, 6: 4, 8: 4, 9: 4, 10: 4, 11: 4, 12: 2 },
  harbors: { any: 6, brick: 1, lumber: 1, wool: 2, grain: 2, ore: 1 },
};

export function componentsFor(players: number): ComponentSet {
  if (players >= 7) return SEVEN_EIGHT_COMPONENTS;
  if (players >= 5) return FIVE_SIX_COMPONENTS;
  return BASE_COMPONENTS;
}

export function expandTerrain(counts: Record<string, number>): string[] {
  return Object.entries(counts).flatMap(([t, n]) => Array<string>(n).fill(t));
}

export function expandTokens(counts: Record<number, number>): number[] {
  return Object.entries(counts).flatMap(([t, n]) => Array<number>(n).fill(Number(t)));
}
