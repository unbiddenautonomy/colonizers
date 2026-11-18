import { DEFAULT_OPTIONS, type GameOptions } from '../../../server/src/protocol.ts';
import { BASE_TARGET } from '../../../server/src/winTarget.ts';

/** Maps with no robber at all, where robber options mean nothing. */
const NO_ROBBER = new Set([
  'barbarians',
  'traders',
  'desert-dragons',
  'land-ho',
  'pirate-lairs',
  'fishing-grounds',
  'spice-islands',
  'full-voyage',
]);

export function hasRobber(specialId: string | null): boolean {
  return !specialId || !NO_ROBBER.has(specialId);
}

/** A room's stored target for "the game's own": see winTarget.ts. */
export const DEFAULT_VP_BASE = BASE_TARGET;

/** Standard options for a game type: options it can't use are left off. */
export function defaultOptionsFor(): GameOptions {
  return { ...DEFAULT_OPTIONS };
}

/** Option keys that differ from the defaults. */
export function changedOptions(o: GameOptions): (keyof GameOptions)[] {
  const d = defaultOptionsFor();
  return (Object.keys(d) as (keyof GameOptions)[]).filter((k) => o[k] !== d[k]);
}
