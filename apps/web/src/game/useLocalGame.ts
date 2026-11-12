import { useCallback, useMemo, useState } from 'react';
import {
  RuleError,
  type Action,
  type GameConfig,
  type GameEvent,
  type GameState,
} from '@colonizers/engine';
import { library } from './library.ts';

export interface LogEntry {
  seq: number;
  event: GameEvent;
}

const SAVE_KEY = 'colonizers.localGame';

export interface SavedGame {
  config: GameConfig;
  actions: Action[];
}

export function loadSavedGame(): SavedGame | null {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw ? (JSON.parse(raw) as SavedGame) : null;
  } catch {
    return null;
  }
}

export function clearSavedGame(): void {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Storage blocked; nothing to clear.
  }
}

function save(game: SavedGame): void {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(game));
  } catch {
    // Storage blocked or full; the game still works, it just won't resume.
  }
}

interface Internal {
  state: GameState;
  actions: Action[];
  log: LogEntry[];
}

function start(saved: SavedGame): Internal {
  const created = library.createGame(saved.config);
  let state = created.state;
  const log: LogEntry[] = created.events.map((event) => ({ seq: 0, event }));
  const actions: Action[] = [];
  for (const a of saved.actions) {
    try {
      const r = library.apply(state, a);
      state = r.state;
      actions.push(a);
      for (const event of r.events) log.push({ seq: state.seq, event });
    } catch {
      break; // A save from an older rules version; keep what replays.
    }
  }
  return { state, actions, log };
}

/** Runs a game on this device (hotseat). Every move is saved so a refresh resumes it. */
export function useLocalGame(saved: SavedGame) {
  const [game, setGame] = useState<Internal>(() => start(saved));
  const [error, setError] = useState<string | null>(null);

  const act = useCallback(
    (action: Action): boolean => {
      try {
        const r = library.apply(game.state, action);
        const next: Internal = {
          state: r.state,
          actions: [...game.actions, action],
          log: [...game.log, ...r.events.map((event) => ({ seq: r.state.seq, event }))].slice(-300),
        };
        setGame(next);
        setError(null);
        save({ config: saved.config, actions: next.actions });
        return true;
      } catch (e) {
        if (e instanceof RuleError) {
          setError(e.message);
          return false;
        }
        throw e;
      }
    },
    [game, saved.config],
  );

  /** Who should be holding the device right now. */
  const actor = useMemo(() => actorOf(game.state), [game.state]);

  return { state: game.state, log: game.log, act, error, clearError: () => setError(null), actor };
}

export function actorOf(state: GameState): number | null {
  if (state.winner !== null) return null;
  if (state.phase.owed) {
    const owed = state.phase.owed as Record<number, number>;
    const seats = Object.keys(owed).map(Number);
    return seats.length ? Math.min(...seats) : null;
  }
  return state.turn.player;
}
