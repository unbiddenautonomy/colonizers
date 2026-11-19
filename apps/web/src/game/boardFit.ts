/** How many players a board takes. */
export interface PlayerRange {
  min: number;
  max: number;
}

/** Whether a board can be played in a room as it stands. */
export type Fit = { ok: true; waiting?: string } | { ok: false; why: string };

/** "4 players", "3 or 4 players", "3 to 6 players". */
export function playersText(range: PlayerRange): string {
  if (range.min === range.max) return `${range.min} players`;
  if (range.max === range.min + 1) return `${range.min} or ${range.max} players`;
  return `${range.min} to ${range.max} players`;
}

/**
 * Whether a board can be picked in a room with `here` players and `seats` of
 * them. A board that needs more players than the room has seats, or fewer than
 * are already here, can never be played, so it is greyed out and says what it
 * needs. One that only waits for people to arrive can be picked straight away:
 * a host setting the room up alone should not have to wait to choose a board.
 */
export function boardFit(range: PlayerRange, here: number, seats: number): Fit {
  if (here >= range.min && here <= range.max) return { ok: true };
  if (here > range.max || seats < range.min)
    return { ok: false, why: `needs ${playersText(range)}` };
  // No room can start with fewer than two players, so needing two is not worth
  // saying: only a board that wants a third player is worth a word.
  return range.min > 2 ? { ok: true, waiting: `waiting for ${playersText(range)}` } : { ok: true };
}
