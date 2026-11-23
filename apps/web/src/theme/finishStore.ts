import { useSyncExternalStore } from 'react';

/**
 * How the painted boards (Basic, Casino) finish a piece in the player's colour: the settlement,
 * city, ship, knights and every other figure that takes the colour. Chosen on each device.
 */
export const FINISHES = [
  { id: 'enamel', name: 'Enamel' },
  { id: 'glow', name: 'Enamel + glow' },
  { id: 'lounge', name: 'Lounge jewel' },
] as const;
export type Finish = (typeof FINISHES)[number]['id'];

const KEY = 'colonizers.finish';
const listeners = new Set<() => void>();

function read(): Finish {
  try {
    const v = localStorage.getItem(KEY);
    return FINISHES.some((f) => f.id === v) ? (v as Finish) : 'enamel';
  } catch {
    return 'enamel';
  }
}

let current = read();

export function setFinish(id: Finish): void {
  current = id;
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // Private mode: the choice lasts until the page closes.
  }
  for (const l of listeners) l();
}

/** The finish picked on this device. */
export function pieceFinish(): Finish {
  return current;
}

export function usePieceFinish(): Finish {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}

/** The colour dragons take: neutral, never a player's, darkening with the dragon's strength. */
export const DRAGON_COLOURS = [
  { id: 'gold', name: 'Gold', tiers: ['#f6dc8a', '#d29d2c', '#8a5a1e'] },
  { id: 'emerald', name: 'Emerald', tiers: ['#86e6b0', '#21a35a', '#0f5a33'] },
] as const;
export type DragonColour = (typeof DRAGON_COLOURS)[number]['id'];

const DRAGON_KEY = 'colonizers.dragons';

function readDragon(): DragonColour {
  try {
    const v = localStorage.getItem(DRAGON_KEY);
    return DRAGON_COLOURS.some((d) => d.id === v) ? (v as DragonColour) : 'gold';
  } catch {
    return 'gold';
  }
}

let dragon = readDragon();

export function setDragonColour(id: DragonColour): void {
  dragon = id;
  try {
    localStorage.setItem(DRAGON_KEY, id);
  } catch {
    // Private mode: the choice lasts until the page closes.
  }
  for (const l of listeners) l();
}

export function useDragonColour(): DragonColour {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => dragon,
  );
}

/** The shade for a dragon of strength `tier` (1 to 3) in the colour picked on this device. */
export function dragonTint(tier: number, colour: DragonColour = dragon): string {
  const tiers = DRAGON_COLOURS.find((d) => d.id === colour)!.tiers;
  return tiers[Math.min(Math.max(tier, 1), 3) - 1]!;
}
