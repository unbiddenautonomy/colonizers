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
import { recordLocalGame } from './localStats.ts';
import { AFTER_ROLL_MS } from '../ui/diceClock.ts';
import { motionScale } from '../ui/motion.tsx';

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
  /** Map key for stats, like "random:classic" or "scenario:new-shores". */
  mapKey?: string;
}

/** Pause between bot moves, so people can follow them. */
const BOT_DELAY_MS = 650;
/**
 * Turns of the bot loop with nothing moving before the game is treated as
 * stopped. Comfortably longer than the 12s a bot will wait for an answer to a
 * trade offer, so an ordinary wait is never mistaken for a dead game.
 */
const IDLE_TICKS = 32;

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

const mapKeyOf = (saved: SavedGame) => (saved.mapKey ? { mapKey: saved.mapKey } : {});

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
        let state = r.state;
        const taken: Action[] = [action];
        const events = [...r.events.map((event) => ({ seq: state.seq, event }))];
        // A step nobody can move in only happens through a bug in a scenario's
        // own rules, but it would end the game: leave it, as the room does
        // online. It is saved like any other move, so a refresh replays it.
        for (let i = 0; i < 2; i++) {
          const rescue: Action = { type: 'skipStep', player: state.turn.player };
          if (!library.stuck(state) || library.check(state, rescue) !== null) break;
          const out = library.apply(state, rescue);
          state = out.state;
          taken.push(rescue);
          events.push(...out.events.map((event) => ({ seq: state.seq, event })));
        }
        const next: Internal = {
          state,
          actions: [...current.actions, ...taken],
          log: [...current.log, ...events].slice(-1000),
        };
        gameRef.current = next;
        setGame(next);
        save({ config: saved.config, actions: next.actions, bots, ...mapKeyOf(saved) });
        return true;
      } catch (e) {
        if (e instanceof RuleError) {
          setError(e.message);
          return false;
        }
        throw e;
      }
    },
    [saved, bots],
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

  // A finished game goes into this device's stats (once, even if the save is resumed).
  const finished = game.state.winner !== null;
  useEffect(() => {
    if (!finished) return;
    const { state, actions } = gameRef.current;
    const timer = setTimeout(
      () => recordLocalGame({ config: saved.config, actions, bots, ...mapKeyOf(saved) }, state),
      0,
    );
    return () => clearTimeout(timer);
  }, [finished, saved, bots]);

  // Bots take their moves one at a time, with a short pause.
  const memory = useRef(new Map<number, BotMemory>());
  // How many turns of the loop have passed with the game in one place. A bot
  // that is waiting on an answer to its offer makes no move for a few of them,
  // which is fine; one that makes no move at all is a game that has stopped.
  const idle = useRef({ seq: -1, ticks: 0 });
  useEffect(() => {
    const seats = Object.keys(bots).map(Number);
    if (!seats.length || game.state.winner !== null) return;
    // After a roll the bots wait for the dice to land and the cards to rise from their lands.
    const lastAction = gameRef.current.actions[gameRef.current.actions.length - 1];
    const pause =
      lastAction?.type === 'roll'
        ? Math.max(BOT_DELAY_MS, AFTER_ROLL_MS * motionScale())
        : BOT_DELAY_MS;
    const timer = setTimeout(() => {
      const state = gameRef.current.state;
      const waiting = library.waitingOn(state).filter((s) => bots[s]);
      try {
        for (const seat of waiting) {
          if (!memory.current.has(seat)) memory.current.set(seat, newMemory());
          const a = chooseAction(library, state, seat, bots[seat]!, memory.current.get(seat), {
            budgetMs: 1500,
          });
          if (a && apply(a)) return;
        }
      } catch (e) {
        // Whatever went wrong in a bot's own head, the game goes on: swallowing
        // this here is what keeps the loop alive, because a throw out of a
        // timer stops it being scheduled again and the game never moves after.
        console.error('bot move failed', e);
      }
      if (!waiting.length) return;
      // Waiting on a person is not the game being stuck: they may be reading an
      // offer, or away from the table. Only a table of bots can be counted out.
      if (library.waitingOn(state).some((s) => !bots[s])) {
        setGame((g) => ({ ...g }));
        return;
      }
      if (idle.current.seq !== state.seq) idle.current = { seq: state.seq, ticks: 0 };
      idle.current.ticks++;
      // Nothing has moved for long enough that waiting is not the explanation.
      // Leave the step if the rules allow it; otherwise say so, rather than
      // asking the same bot the same question for ever behind a quiet screen.
      if (idle.current.ticks === IDLE_TICKS) {
        const seat = waiting[0]!;
        const rescue: Action = { type: 'skipStep', player: seat };
        if (library.check(state, rescue) === null && apply(rescue)) return;
        setError('A bot has stopped playing. Quit the game, or carry on without it.');
      }
      // A bot waiting on an answer to its offer looks again shortly.
      setGame((g) => ({ ...g }));
    }, pause);
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
  if (state.phase.id === 'specialBuild') {
    const builder = (state.phase.queue as number[] | undefined)?.[0];
    return builder === undefined || bots[builder] ? null : builder;
  }
  return bots[state.turn.player] ? null : state.turn.player;
}
