import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { chooseAction, newMemory, type BotConfig, type BotMemory } from '@colonizers/bots';
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
  /** Seats played by the computer. */
  bots?: Record<number, BotConfig>;
}

/** Pause between bot moves, so people can follow them. */
const BOT_DELAY_MS = 650;

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

/** Runs a game on this device (hotseat, and bots). Every move is saved so a refresh resumes it. */
export function useLocalGame(saved: SavedGame) {
  const [game, setGame] = useState<Internal>(() => start(saved));
  const [error, setError] = useState<string | null>(null);
  const gameRef = useRef(game);
  const bots = useMemo(() => saved.bots ?? {}, [saved.bots]);

  const apply = useCallback(
    (action: Action): boolean => {
      const current = gameRef.current;
      try {
        const r = library.apply(current.state, action);
        const next: Internal = {
          state: r.state,
          actions: [...current.actions, action],
          log: [...current.log, ...r.events.map((event) => ({ seq: r.state.seq, event }))].slice(
            -300,
          ),
        };
        gameRef.current = next;
        setGame(next);
        save({ config: saved.config, actions: next.actions, bots });
        return true;
      } catch (e) {
        if (e instanceof RuleError) {
          setError(e.message);
          return false;
        }
        throw e;
      }
    },
    [saved.config, bots],
  );

  const act = useCallback(
    (action: Action): boolean => {
      if (bots[action.player]) return false;
      const ok = apply(action);
      if (ok) setError(null);
      return ok;
    },
    [apply, bots],
  );

  // Bots take their moves one at a time, with a short pause.
  const memory = useRef(new Map<number, BotMemory>());
  useEffect(() => {
    const seats = Object.keys(bots).map(Number);
    if (!seats.length || game.state.winner !== null) return;
    const timer = setTimeout(() => {
      const state = gameRef.current.state;
      const waiting = library.waitingOn(state).filter((s) => bots[s]);
      for (const seat of waiting) {
        if (!memory.current.has(seat)) memory.current.set(seat, newMemory());
        const a = chooseAction(library, state, seat, bots[seat]!, memory.current.get(seat), {
          budgetMs: 1500,
        });
        if (a && apply(a)) return;
      }
      // A bot waiting on an answer to its offer looks again shortly.
      if (waiting.length) setGame((g) => ({ ...g }));
    }, BOT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [game, bots, apply]);

  /** Who should be holding the device right now. */
  const actor = useMemo(() => {
    const a = actorOf(game.state, bots);
    const humans = game.state.players.map((p) => p.seat).filter((s) => !bots[s]);
    // With one person at the table, the device is always theirs.
    if (humans.length === 1) return humans[0]!;
    return a ?? humans[0] ?? null;
  }, [game.state, bots]);

  return {
    state: game.state,
    log: game.log,
    act,
    error,
    clearError: () => setError(null),
    actor,
    bots,
  };
}

export function actorOf(state: GameState, bots: Record<number, unknown> = {}): number | null {
  if (state.winner !== null) return null;
  if (state.phase.owed) {
    const owed = state.phase.owed as Record<number, number>;
    const seats = Object.keys(owed)
      .map(Number)
      .filter((s) => !bots[s]);
    return seats.length ? Math.min(...seats) : null;
  }
  return bots[state.turn.player] ? null : state.turn.player;
}
