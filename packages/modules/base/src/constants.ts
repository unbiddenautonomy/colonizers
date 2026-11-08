export const RESOURCES = ['brick', 'lumber', 'wool', 'grain', 'ore'] as const;
export type Resource = (typeof RESOURCES)[number];

export const TERRAIN_RESOURCE: Record<string, Resource> = {
  hills: 'brick',
  forest: 'lumber',
  pasture: 'wool',
  fields: 'grain',
  mountains: 'ore',
};

export const DEV_CARDS = [
  'knight',
  'victoryPoint',
  'roadBuilding',
  'yearOfPlenty',
  'monopoly',
] as const;
export type DevCard = (typeof DEV_CARDS)[number];

/** Base deck for 3–4 players, the 5–6 deck, and our 7–8 draft (PLAN.md section 2). */
export function devDeck(players: number): Record<DevCard, number> {
  if (players >= 7)
    return { knight: 26, victoryPoint: 6, roadBuilding: 4, yearOfPlenty: 4, monopoly: 4 };
  if (players >= 5)
    return { knight: 20, victoryPoint: 5, roadBuilding: 3, yearOfPlenty: 3, monopoly: 3 };
  return { knight: 14, victoryPoint: 5, roadBuilding: 2, yearOfPlenty: 2, monopoly: 2 };
}

export function bankPerResource(players: number): number {
  if (players >= 7) return 30;
  if (players >= 5) return 24;
  return 19;
}

export const MODULE_ID = 'base';
