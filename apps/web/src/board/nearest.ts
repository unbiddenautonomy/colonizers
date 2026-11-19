/** A place on the board a tap can land, in board coordinates. */
export interface Spot<T> {
  x: number;
  y: number;
  what: T;
}

/**
 * The spot nearest a tap, if it is close enough to have been meant.
 *
 * Building spots are small: 12 px across on a phone, and the board cannot
 * make them much bigger without a road's spot and a settlement's spot
 * stealing taps from each other. So a tap that lands on nothing takes the
 * nearest spot instead, as long as it is within a thumb's width.
 */
export function nearestSpot<T>(
  tap: { x: number; y: number },
  spots: Spot<T>[],
  within: number,
): T | null {
  let best: Spot<T> | null = null;
  let bestDistance = within;
  for (const spot of spots) {
    const d = Math.hypot(spot.x - tap.x, spot.y - tap.y);
    if (d <= bestDistance) {
      // A later spot only wins by being strictly nearer, so the order the
      // board lists them in decides a tie.
      if (best && d === bestDistance) continue;
      best = spot;
      bestDistance = d;
    }
  }
  return best ? best.what : null;
}
