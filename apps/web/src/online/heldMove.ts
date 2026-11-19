import type { ClientMessage } from '../../../server/src/protocol.ts';

/** A move made while the connection was down, waiting to be sent. */
export interface HeldMove {
  msg: ClientMessage;
  /** The move count the game was at when the player made it. */
  seq: number;
}

/**
 * The move to hold while the connection is down, if this message is one. Only
 * a game move is worth holding: everything else (chat, settings) can wait for
 * the player to try again.
 */
export function moveToHold(msg: ClientMessage, seq: number | undefined): HeldMove | null {
  return msg.type === 'act' && seq !== undefined ? { msg, seq } : null;
}

/**
 * What to do with a held move, given where the game is now. It is sent while
 * the game is still where the player left it, and dropped once the game has
 * moved on (the turn timer may have played for them), so a stale tap can never
 * land as a surprise several turns later. Without a snapshot yet, it waits.
 */
export function heldMoveNow(
  held: HeldMove | null,
  seq: number | undefined,
): 'wait' | 'send' | 'drop' {
  if (!held || seq === undefined) return 'wait';
  return seq === held.seq ? 'send' : 'drop';
}
