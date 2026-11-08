import type { RollEvent, ServerMessage } from '../../server/src/protocol.ts';

export type { RollEvent, ServerMessage };

export type ConnectionStatus = 'connecting' | 'open' | 'reconnecting';

export interface RoomState {
  status: ConnectionStatus;
  seq: number;
  events: RollEvent[];
  online: number;
}

export const initialRoomState: RoomState = {
  status: 'connecting',
  seq: 0,
  events: [],
  online: 0,
};

const MAX_EVENTS = 50;

/** Applies new events in order, ignoring duplicates. Returns whether a gap was seen. */
export function applyEvents(
  state: RoomState,
  incoming: RollEvent[],
): { state: RoomState; gap: boolean } {
  let { seq, events } = state;
  let gap = false;
  for (const e of [...incoming].sort((a, b) => a.seq - b.seq)) {
    if (e.seq <= seq) continue;
    if (e.seq > seq + 1) {
      gap = true;
      break;
    }
    events = [...events, e];
    seq = e.seq;
  }
  return { state: { ...state, seq, events: events.slice(-MAX_EVENTS) }, gap };
}

export function reduce(state: RoomState, msg: ServerMessage): { state: RoomState; gap: boolean } {
  switch (msg.type) {
    case 'welcome': {
      // A fresh snapshot: keep anything we had, then fill in history.
      const base = { ...state, status: 'open' as const, online: msg.online };
      if (state.seq === 0) {
        return {
          state: { ...base, seq: msg.seq, events: msg.history.slice(-MAX_EVENTS) },
          gap: false,
        };
      }
      const applied = applyEvents(base, msg.history);
      return { state: applied.state, gap: applied.state.seq < msg.seq };
    }
    case 'rolled':
      return applyEvents(state, [msg.event]);
    case 'events':
      return applyEvents(state, msg.events);
    case 'presence':
      return { state: { ...state, online: msg.online }, gap: false };
    case 'error':
      return { state, gap: false };
  }
}

export function roomSocketUrl(roomId: string, location: Location = window.location): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/api/rooms/${encodeURIComponent(roomId)}/ws`;
}
