import { useEffect, useState } from 'react';
import { ROLL_SHOW } from '@colonizers/bots';
import { motionScale } from './motion.tsx';

/** The longest a throw takes to land: the slowest die (1150ms) plus the stagger of the others. */
export const DICE_SETTLE_MS = ROLL_SHOW.diceMs;

/** When the dice and cards now moving on screen will all have come to rest. */
let busyUntil = 0;

/** Notes that something now starting on screen runs for `ms` more. */
export function keepScreenBusy(ms: number): void {
  busyUntil = Math.max(busyUntil, Date.now() + ms);
}

/** How long until the dice and cards on screen have come to rest; 0 once they have. */
export function screenBusyFor(): number {
  return Math.max(0, busyUntil - Date.now());
}

/** How long the dice take to land at the player's motion setting. */
export function diceSettleMs(): number {
  return DICE_SETTLE_MS * motionScale();
}

/**
 * True while the dice of the latest roll are still in the air, so the turn can't be ended under
 * them. The first roll seen on opening the page is already lying still.
 */
export function useDiceRolling(rollKey: string | null): boolean {
  // The roll whose dice have come to rest; the one showing on opening the page already has.
  const [still, setStill] = useState(rollKey);
  useEffect(() => {
    if (rollKey === still) return;
    const t = setTimeout(() => setStill(rollKey), diceSettleMs());
    return () => clearTimeout(t);
  }, [rollKey, still]);
  return rollKey !== still && diceSettleMs() > 0;
}
