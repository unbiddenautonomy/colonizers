import { DEFAULT_OPTIONS, type GameOptions } from '../../../server/src/protocol.ts';

/** Points the Traders & Barbarians scenarios add to the target (their module adds them in play). */
const TB_VP_BONUS: Record<string, number> = { caravans: 2, traders: 3 };

/** Maps with no robber at all, where robber options mean nothing. */
const NO_ROBBER = new Set(['barbarians', 'traders']);

/** Points added on top of the chosen target by Cities & Knights and the map. */
export function vpBonus(citiesKnights: boolean, specialId: string | null): number {
  return (citiesKnights ? 3 : 0) + (specialId ? (TB_VP_BONUS[specialId] ?? 0) : 0);
}

export function hasRobber(specialId: string | null): boolean {
  return !specialId || !NO_ROBBER.has(specialId);
}

/** The base target (before bonuses) every game type starts from. */
export const DEFAULT_VP_BASE = 10;

/** Standard options for a game type: options it can't use are left off. */
export function defaultOptionsFor(): GameOptions {
  return { ...DEFAULT_OPTIONS };
}

/** Option keys that differ from the defaults. */
export function changedOptions(o: GameOptions): (keyof GameOptions)[] {
  const d = defaultOptionsFor();
  return (Object.keys(d) as (keyof GameOptions)[]).filter((k) => o[k] !== d[k]);
}
