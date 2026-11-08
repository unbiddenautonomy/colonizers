import { stateFromView, type GameState } from '@colonizers/engine';
import type {
  ChatMessage,
  LogEntry,
  RoomInfo,
  ServerMessage,
} from '../../../server/src/protocol.ts';

export type Connection = 'connecting' | 'open' | 'reconnecting' | 'missing' | 'removed';

export interface OnlineGame {
  state: GameState;
  seq: number;
  /** When the turn timer runs out, on this device's clock. */
  deadline: number | null;
}

export interface OnlineState {
  conn: Connection;
  you: string | null;
  room: RoomInfo | null;
  game: OnlineGame | null;
  log: LogEntry[];
  chat: ChatMessage[];
  error: string | null;
  /** Why the room closed on us, when it did. */
  notice: string | null;
}

export const initialOnlineState: OnlineState = {
  conn: 'connecting',
  you: null,
  room: null,
  game: null,
  log: [],
  chat: [],
  error: null,
  notice: null,
};

const LOG_KEPT = 300;
const CHAT_KEPT = 100;

function toGame(
  snap: { view: Parameters<typeof stateFromView>[0]; seq: number; deadline: number | null },
  serverNow: number,
  localNow: number,
): OnlineGame {
  return {
    state: stateFromView(snap.view),
    seq: snap.seq,
    deadline: snap.deadline === null ? null : snap.deadline + (localNow - serverNow),
  };
}

/** Folds one server message into what the screen shows. */
export function reduce(s: OnlineState, msg: ServerMessage, localNow = Date.now()): OnlineState {
  switch (msg.type) {
    case 'welcome':
      return {
        ...s,
        conn: 'open',
        you: msg.you,
        room: msg.room,
        game: msg.game ? toGame(msg.game, msg.now, localNow) : null,
        log: msg.log,
        chat: msg.chat,
        error: null,
      };
    case 'room':
      return { ...s, room: msg.room };
    case 'game':
      // Messages arrive in order on one socket; ignore anything older just in case.
      if (s.game && msg.game.seq < s.game.seq) return s;
      return {
        ...s,
        game: toGame(msg.game, msg.now, localNow),
        log: [...s.log, ...msg.events].slice(-LOG_KEPT),
        error: msg.events.length ? null : s.error,
      };
    case 'chat':
      return { ...s, chat: [...s.chat, msg.message].slice(-CHAT_KEPT) };
    case 'error':
      if (msg.code === 'removed') return { ...s, conn: 'removed', notice: msg.message };
      return { ...s, error: msg.message };
  }
}

/** The seat this device plays, or null when watching. */
export function mySeat(s: OnlineState): number | null {
  return s.room?.members.find((m) => m.id === s.you)?.seat ?? null;
}
