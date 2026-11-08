import { useCallback, useEffect, useRef, useState } from 'react';
import {
  initialRoomState,
  reduce,
  roomSocketUrl,
  type RoomState,
  type ServerMessage,
} from './roomClient.ts';

/**
 * Connects to a room, reconnects with backoff, and asks for missed events.
 * Give the component a `key` of the room id if the room can change.
 */
export function useRoom(roomId: string) {
  const [state, setState] = useState<RoomState>(initialRoomState);
  const stateRef = useRef(state);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let stopped = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      const ws = new WebSocket(roomSocketUrl(roomId));
      socketRef.current = ws;
      ws.onopen = () => {
        attempt = 0;
      };
      ws.onmessage = (e: MessageEvent<string>) => {
        const msg = JSON.parse(e.data) as ServerMessage;
        const { state: next, gap } = reduce(stateRef.current, msg);
        stateRef.current = next;
        setState(next);
        if (gap) ws.send(JSON.stringify({ type: 'sync', afterSeq: next.seq }));
      };
      ws.onclose = () => {
        if (stopped) return;
        const next = { ...stateRef.current, status: 'reconnecting' as const };
        stateRef.current = next;
        setState(next);
        const delay = Math.min(10_000, 500 * 2 ** attempt++);
        timer = setTimeout(connect, delay);
      };
    };
    connect();

    return () => {
      stopped = true;
      clearTimeout(timer);
      socketRef.current?.close();
    };
  }, [roomId]);

  const roll = useCallback((name: string) => {
    const ws = socketRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'roll', name }));
  }, []);

  return { state, roll };
}
