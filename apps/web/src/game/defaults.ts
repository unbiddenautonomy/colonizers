import { TDA_CK_ADJUST, TDA_VP_BONUS } from '@colonizers/module-treasures-dragons';
import { EP_VP_BONUS } from '@colonizers/module-explorers-pirates';
import { DEFAULT_OPTIONS, type GameOptions } from '../../../server/src/protocol.ts';

/** Points the expansion scenarios add to the target (their modules add them in play). */
const TB_VP_BONUS: Record<string, number> = {
  caravans: 2,
  traders: 3,
  ...TDA_VP_BONUS,
  ...EP_VP_BONUS,
};

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

/** Points added on top of the chosen target by Cities & Knights and the map. */
export function vpBonus(
  citiesKnights: boolean,
  specialId: string | null,
  gwp = false,
  civs = false,
  church = false,
  witches = false,
  princes = false,
  soldiers = false,
  kingdoms = false,
): number {
  const ckAdjust =
    citiesKnights && specialId ? (TDA_CK_ADJUST[specialId as keyof typeof TDA_CK_ADJUST] ?? 0) : 0;
  // Greed, Wealth & Power plays to 18 with the usual 10, Civilisations to 20, Church or
  // Witches to 15, both to 17.
  const fan = church && witches ? 7 : church || witches ? 5 : 3;
  const expansion = citiesKnights ? (gwp ? (civs ? 10 : 8) : fan) : 0;
  // Princes & Explorers plays to 14 with the usual 10, Soldiers & Armies to 13, both to 14.
  return (
    expansion +
    (princes ? 4 : 0) +
    (soldiers && !princes ? 3 : 0) +
    // Kingdoms & Warriors plays to 2 more.
    (kingdoms ? 2 : 0) +
    (specialId ? (TB_VP_BONUS[specialId] ?? 0) : 0) +
    ckAdjust
  );
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
