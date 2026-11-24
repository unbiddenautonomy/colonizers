import { useSyncExternalStore } from 'react';

/**
 * Whether the Wooden board shows an object on each land (logs, bricks, a sheep …) above the
 * number, or only the printed tiles. Chosen on each device; tiles only unless turned on.
 */
const KEY = 'colonizers.landIcons';
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === 'on';
  } catch {
    return false;
  }
}

let current = read();

export function setLandIcons(on: boolean): void {
  current = on;
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    // Private mode: the choice lasts until the page closes.
  }
  for (const l of listeners) l();
}

export function subscribeLandIcons(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function landIcons(): boolean {
  return current;
}

export function useLandIcons(): boolean {
  return useSyncExternalStore(subscribeLandIcons, landIcons);
}
