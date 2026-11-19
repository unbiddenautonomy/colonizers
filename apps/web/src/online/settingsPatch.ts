import type { GameOptions } from '../../../server/src/protocol.ts';

/**
 * The options that changed, so a later change can't undo an earlier one. The
 * lobby used to send the whole settings list, built from the copy it last
 * received, so a change made before the server answered was silently lost.
 */
export function changedOptions(before: GameOptions, after: GameOptions): Partial<GameOptions> {
  const was: Record<string, unknown> = { ...before };
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(after)) if (value !== was[key]) out[key] = value;
  return out as Partial<GameOptions>;
}
