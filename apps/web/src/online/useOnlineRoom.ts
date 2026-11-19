import { useCallback, useEffect, useRef, useState } from 'react';
import type { Action } from '@colonizers/engine';
import type { ClientMessage, ServerMessage } from '../../../server/src/protocol.ts';
import { roomSocketUrl, roomSummary } from './api.ts';
import { rememberRoom, tokenFor } from './identity.ts';
import { heldMoveNow, moveToHold, type HeldMove } from './heldMove.ts';
import { initialOnlineState, reduce, type OnlineState } from './roomState.ts';

/**
 * Keeps this device connected to a room. It reconnects with backoff, and
 * straight away when the tab comes back or the network returns, then gets a
 * fresh snapshot from the room. A move made while the connection is down is
 * held and sent once it is back, as long as the game has not moved on without
 * it. Give the component a `key` of the room code.
 */
export function useOnlineRoom(code: string, name: string) {
  const [state, setState] = useState<OnlineState>(initialOnlineState);
  const stateRef = useRef(state);
  const socketRef = useRef<WebSocket | null>(null);
  /** A move made while offline, with the move count it was made at. */
  const heldRef = useRef<HeldMove | null>(null);
  const nameRef = useRef(name);
  useEffect(() => {
    nameRef.current = name;
  }, [name]);

  useEffect(() => {
    let stopped = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const update = (fn: (s: OnlineState) => OnlineState) => {
      stateRef.current = fn(stateRef.current);
      setState(stateRef.current);
    };

    /** Deals with the move made while offline, once a fresh snapshot is in. */
    const sendHeld = (ws: WebSocket) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      const held = heldRef.current;
      const what = heldMoveNow(held, stateRef.current.game?.seq);
      if (what === 'wait') return;
      heldRef.current = null;
      if (what === 'send') ws.send(JSON.stringify(held!.msg));
      else
        update((s) => ({
          ...s,
          error: 'The game moved on while you were offline, so your move was not played.',
        }));
    };

    const connect = () => {
      clearTimeout(timer);
      if (stopped) return;
      const ws = new WebSocket(roomSocketUrl(code));
      socketRef.current = ws;
      ws.onopen = () => {
        attempt = 0;
        rememberRoom(code);
        ws.send(JSON.stringify({ type: 'hello', token: tokenFor(code), name: nameRef.current }));
      };
      ws.onmessage = (e: MessageEvent<string>) => {
        update((s) => reduce(s, JSON.parse(e.data) as ServerMessage));
        sendHeld(ws);
      };
      ws.onclose = () => {
        if (socketRef.current === ws) socketRef.current = null;
        if (stopped || stateRef.current.conn === 'removed') return;
        update((s) => ({ ...s, conn: s.conn === 'connecting' ? 'connecting' : 'reconnecting' }));
        // A room that never existed (or was typed wrong) should say so, not spin.
        if (attempt === 1) {
          void roomSummary(code).then((r) => {
            if (!r.exists && !stopped) {
              stopped = true;
              update((s) => ({ ...s, conn: 'missing' }));
            }
          });
        }
        const delay = Math.min(10_000, 400 * 2 ** attempt++);
        timer = setTimeout(connect, delay);
      };
    };

    const wake = () => {
      if (document.visibilityState === 'visible' && !socketRef.current && !stopped) {
        attempt = 0;
        connect();
      }
    };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('online', wake);
    connect();

    return () => {
      stopped = true;
      heldRef.current = null;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('online', wake);
      socketRef.current?.close();
    };
  }, [code]);

  const send = useCallback((msg: ClientMessage): boolean => {
    const ws = socketRef.current;
    if (ws?.readyState !== WebSocket.OPEN) {
      // A dropped connection should not cost someone their move: hold it and
      // send it on reconnect. Anything else can wait for the player to retry.
      const hold = moveToHold(msg, stateRef.current.game?.seq);
      if (hold) {
        heldRef.current = hold;
        setState(
          (s) => (stateRef.current = { ...s, error: 'Offline for a moment. Sending your move…' }),
        );
        return true;
      }
      setState((s) => (stateRef.current = { ...s, error: 'Not connected. Reconnecting…' }));
      return false;
    }
    ws.send(JSON.stringify(msg));
    return true;
  }, []);

  const act = useCallback((action: Action) => send({ type: 'act', action }), [send]);
  const clearError = useCallback(
    () => setState((s) => (stateRef.current = { ...s, error: null })),
    [],
  );

  return { ...state, send, act, clearError };
}
