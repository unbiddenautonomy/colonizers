/**
 * Messages between the browser and a game room. Phase 0 only has a test room
 * that rolls dice; phase 4 replaces this with real game intents and events.
 */
export type ClientMessage = { type: 'roll'; name: string } | { type: 'sync'; afterSeq: number };

export interface RollEvent {
  seq: number;
  name: string;
  dice: [number, number];
  total: number;
  at: number;
}

export type ServerMessage =
  | { type: 'welcome'; roomId: string; seq: number; history: RollEvent[]; online: number }
  | { type: 'rolled'; event: RollEvent }
  | { type: 'events'; events: RollEvent[] }
  | { type: 'presence'; online: number }
  | { type: 'error'; message: string };

export function parseClientMessage(raw: string | ArrayBuffer): ClientMessage | null {
  if (typeof raw !== 'string' || raw.length > 4096) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const msg = data as Record<string, unknown>;
  if (msg.type === 'roll' && typeof msg.name === 'string') {
    const name = msg.name.trim().slice(0, 32) || 'Anonymous';
    return { type: 'roll', name };
  }
  if (msg.type === 'sync' && typeof msg.afterSeq === 'number' && Number.isInteger(msg.afterSeq)) {
    return { type: 'sync', afterSeq: msg.afterSeq };
  }
  return null;
}
