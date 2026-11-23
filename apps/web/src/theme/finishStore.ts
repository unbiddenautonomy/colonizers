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
