import { useEffect, useMemo, useState } from 'react';
import { Ctx, type GameEvent, type GameState } from '@colonizers/engine';
import { publicVp } from '@colonizers/module-base';
import { nameOf } from '@colonizers/rulebook';
import { Board } from '../board/Board.tsx';
import { describe } from '../game/describe.ts';
import { library } from '../game/library.ts';
import { getReplay, mapName, type Replay } from '../online/account.ts';
import { ThemePicker, useTheme } from '../theme/themes.tsx';
import { DiceTray } from '../ui/Dice.tsx';
import { PlayerBadge } from '../ui/PlayerBadge.tsx';

/** Keep a full state every this many moves, and replay forward from the nearest one. */
const CHECKPOINT = 25;
const SPEEDS = [1500, 700, 250];

interface Timeline {
  checkpoints: GameState[];
  /** Log events, each with the move number after which it happened. */
  events: { step: number; event: GameEvent }[];
  /** Move numbers where a turn starts, for skipping turn by turn. */
  turns: number[];
}

function buildTimeline(r: Replay): Timeline {
  const created = library.createGame(r.config);
  let state = created.state;
  const checkpoints = [state];
  const events = created.events.map((event) => ({ step: 0, event }));
  const turns: number[] = [];
  r.actions.forEach((a, i) => {
    const res = library.apply(state, a);
    state = res.state;
    for (const event of res.events) {
      events.push({ step: i + 1, event });
      if (event.type === 'turnStarted') turns.push(i + 1);
    }
    if ((i + 1) % CHECKPOINT === 0) checkpoints.push(state);
  });
  return { checkpoints, events, turns };
}

function stateAt(r: Replay, t: Timeline, step: number): GameState {
  const k = Math.min(Math.floor(step / CHECKPOINT), t.checkpoints.length - 1);
  let s = t.checkpoints[k]!;
  for (let i = k * CHECKPOINT; i < step; i++) s = library.apply(s, r.actions[i]!).state;
  return s;
}

const noTargets = { corners: new Map(), edges: new Map(), hexes: new Map() };

/** Steps through a finished online game, move by move. */
export function ReplayPage({ id, onBack }: { id: string; onBack: () => void }) {
  const [replay, setReplay] = useState<Replay | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    getReplay(id).then(setReplay, (e: unknown) =>
      setError(e instanceof Error ? e.message : String(e)),
    );
  }, [id]);

  if (error || !replay)
    return (
      <main className="setup-page">
        <header className="page-top">
          <button type="button" className="ghost" onClick={onBack}>
            ← Back
          </button>
          <h1>Replay</h1>
        </header>
        <section className="card">{error ? <p role="alert">{error}</p> : <p>Loading…</p>}</section>
      </main>
    );
  return <ReplayView replay={replay} onBack={onBack} />;
}

function ReplayView({ replay, onBack }: { replay: Replay; onBack: () => void }) {
  const timeline = useMemo(() => buildTimeline(replay), [replay]);
  const last = replay.actions.length;
  // A replay opens at the first move: opening on the last one left Play with
  // nothing to do until you found the Start button.
  const [step, setStep] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const state = useMemo(() => stateAt(replay, timeline, step), [replay, timeline, step]);
  const ctx = useMemo(() => new Ctx(state, library.registry(state.modules)), [state]);
  const names = state.players.map((p) => p.name);
  const theme = useTheme();

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      setStep((s) => {
        if (s >= last) {
          setPlaying(false);
          return s;
        }
        return s + 1;
      });
    }, SPEEDS[speed]);
    return () => clearInterval(timer);
  }, [playing, speed, last]);

  const prevTurn = [...timeline.turns].reverse().find((t) => t < step) ?? 0;
  const nextTurn = timeline.turns.find((t) => t > step) ?? last;
  const lines = timeline.events
    .filter((e) => e.step <= step)
    .map((e) => ({ ...e, text: describe(e.event, names) }))
    .filter((e) => e.text)
    .slice(-60)
    .reverse();
  const lastRoll =
    (state.data.base?.lastRoll as { total: number; dice: Record<string, unknown> } | undefined) ??
    null;

  return (
    <div className="game replay">
      <header className="game-head">
        <h1 className="game-title">Replay</h1>
        <p className="prompt">
          {mapName(replay.map)} · Turn {state.turn.number} · move {step} of {last}
          {state.winner !== null && ` · ${names[state.winner]} wins`}
        </p>
        <button
          type="button"
          className="icon menu-toggle"
          aria-expanded={menuOpen}
          aria-label="Menu"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          ☰
        </button>
        <div className={`head-actions${menuOpen ? ' open' : ''}`}>
          <ThemePicker compact />
          <button type="button" className="ghost" onClick={onBack}>
            Back
          </button>
        </div>
      </header>

      <aside className="players" aria-label="Players">
        {state.players.map((p) => {
          const t = theme.players[p.seat]!;
          return (
            <div
              key={p.seat}
              className={`player${state.turn.player === p.seat ? ' active' : ''}`}
              style={{ borderColor: t.color }}
            >
              <div className="player-name">
                <PlayerBadge color={t.color} shape={t.shape} />
                <strong>{p.name}</strong>
                <span className="vp" title="Victory points">
                  {publicVp(ctx, p.seat)}
                  <small> VP</small>
                </span>
              </div>
              <div className="player-stats">
                {Object.entries(p.hand)
                  .filter(([, n]) => n > 0)
                  .map(([card, n]) => (
                    <span key={card} title={nameOf(card).name}>
                      {nameOf(card).icon ?? nameOf(card).name} {n}
                    </span>
                  ))}
                <span title="Longest road">🛣️ {ctx.longestRoute(p.seat)}</span>
              </div>
            </div>
          );
        })}
      </aside>

      <main className="board-wrap">
        <Board
          state={state}
          targets={noTargets}
          onAction={() => undefined}
          rolled={lastRoll?.total ?? null}
        />
        {lastRoll && (
          <DiceTray
            dice={lastRoll.dice}
            rollKey={`${state.turn.number}-${lastRoll.total}-${JSON.stringify(lastRoll.dice)}`}
            icons={{ ship: '⛵', science: '🟢', trade: '🟡', politics: '🔵' }}
          />
        )}
      </main>

      <section className="controls" aria-label="Replay controls">
        <div className="replay-controls">
          <input
            type="range"
            min={0}
            max={last}
            value={step}
            onChange={(e) => {
              setPlaying(false);
              setStep(Number(e.target.value));
            }}
            aria-label="Move"
          />
          <div className="row">
            <button type="button" onClick={() => setStep(0)} aria-label="Start" title="Start">
              ⏮
            </button>
            <button
              type="button"
              onClick={() => setStep(prevTurn)}
              aria-label="Previous turn"
              title="Previous turn"
            >
              ⏪
            </button>
            <button
              type="button"
              onClick={() => setStep(Math.max(0, step - 1))}
              aria-label="Previous move"
              title="Previous move"
            >
              ◀
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => {
                if (step >= last) setStep(0);
                setPlaying(!playing);
              }}
            >
              {playing ? 'Pause' : 'Play'}
            </button>
            <button
              type="button"
              onClick={() => setStep(Math.min(last, step + 1))}
              aria-label="Next move"
              title="Next move"
            >
              ▶
            </button>
            <button
              type="button"
              onClick={() => setStep(nextTurn)}
              aria-label="Next turn"
              title="Next turn"
            >
              ⏩
            </button>
            <button type="button" onClick={() => setStep(last)} aria-label="End" title="End">
              ⏭
            </button>
          </div>
          <label>
            Speed{' '}
            <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
              <option value={0}>Slow</option>
              <option value={1}>Normal</option>
              <option value={2}>Fast</option>
            </select>
          </label>
        </div>
        <details className="log-wrap" open>
          <summary>What happened (newest first)</summary>
          <ol className="log">
            {lines.map((l, i) => (
              <li key={i} className={l.event.type === 'turnStarted' ? 'turn-line' : ''}>
                {l.text}
              </li>
            ))}
          </ol>
        </details>
      </section>
    </div>
  );
}
