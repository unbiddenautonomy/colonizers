import type { Prefs } from '../../../server/src/accountTypes.ts';

/**
 * The pickers say here when the player picks a look, board or dice, so a
 * signed-in player's choice can be saved to their account. Kept apart from
 * the account code so the theme files don't import it.
 */
type Listener = (picked: Partial<Prefs>) => void;
const listeners = new Set<Listener>();

export function onPrefPicked(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function prefPicked(picked: Partial<Prefs>): void {
  for (const l of listeners) l(picked);
}
