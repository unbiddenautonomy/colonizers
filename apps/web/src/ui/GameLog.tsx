import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { GameEvent } from '@colonizers/engine';
import { describe } from '../game/describe.ts';
import type { PlayerShape } from '../theme/clean.ts';
import { PlayerBadge } from './PlayerBadge.tsx';

interface Line {
  key: number;
  text: string;
  player: number | null;
}

interface Turn {
  key: number;
  /** Whose turn, or null for the setup before the first turn. */
  player: number | null;
  lines: Line[];
}

/** Splits the log into turns, one group per turnStarted. */
export function groupTurns(log: { event: GameEvent }[], names: string[]): Turn[] {
  const turns: Turn[] = [];
  let current: Turn = { key: -1, player: null, lines: [] };
  log.forEach((l, i) => {
    if (l.event.type === 'turnStarted') {
      if (current.lines.length > 0 || current.player !== null) turns.push(current);
      current = {
        key: i,
        player: typeof l.event.player === 'number' ? l.event.player : null,
        lines: [],
      };
      return;
    }
    const text = describe(l.event, names);
    if (!text) return;
    const player = typeof l.event.player === 'number' ? l.event.player : null;
    current.lines.push({ key: i, text, player });
  });
  if (current.lines.length > 0 || current.player !== null) turns.push(current);
  return turns;
}

/** A line of the log with each player's name written in that player's colour. */
function Named({
  text,
  names,
  players,
}: {
  text: string;
  names: string[];
  players: { color: string }[];
}) {
  const seats = names
    .map((n, seat) => ({ n, seat }))
    .filter(({ n, seat }) => n && players[seat])
    .sort((a, b) => b.n.length - a.n.length);
  if (!seats.length) return <>{text}</>;
  const escape = (n: string) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${seats.map(({ n }) => escape(n)).join('|')})`, 'g'));
  return (
    <>
      {parts.map((part, i) => {
        const hit = i % 2 === 1 ? seats.find(({ n }) => n === part) : undefined;
        return hit ? (
          <span key={i} className="log-name" style={{ color: players[hit.seat]!.color }}>
            {part}
          </span>
        ) : (
          part
        );
      })}
    </>
  );
}

/**
 * The game log as a chat you can scroll back through: one group per turn, each line marked with
 * the player who did it, and a filter to follow one player.
 */
export function GameLog({
  log,
  names,
  players,
}: {
  log: { event: GameEvent }[];
  names: string[];
  players: { color: string; shape: PlayerShape }[];
}) {
  const [who, setWho] = useState<number | 'all'>('all');
  const [atEnd, setAtEnd] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);
  // The log is capped, so its length stops growing: watch its last entry instead.
  const last = log[log.length - 1];
  const seen = useRef(last);
  const [readTo, setReadTo] = useState(last);
  const unseen = !atEnd && readTo !== last;

  const turns = groupTurns(log, names)
    .map((t) => (who === 'all' ? t : { ...t, lines: t.lines.filter((l) => l.player === who) }))
    .filter((t) => who === 'all' || t.player === who || t.lines.length > 0);

  const toEnd = () => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight });
  };

  // Follow new lines only while you are at the bottom, so reading back is never interrupted.
  useLayoutEffect(() => {
    if (seen.current === last) return;
    seen.current = last;
    const el = listRef.current;
    if (atEnd && el) el.scrollTo({ top: el.scrollHeight });
  }, [last, atEnd]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight });
  }, [who]);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const end = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    setAtEnd(end);
    if (end) setReadTo(last);
  };

  return (
    <section className="game-log" aria-label="Game log">
      <header className="game-log-head">
        <h2>Game log</h2>
        <label className="game-log-filter">
          <span className="sr-only">Show moves by</span>
          <select
            value={who}
            onChange={(e) => setWho(e.target.value === 'all' ? 'all' : Number(e.target.value))}
          >
            <option value="all">Everyone</option>
            {names.map((n, i) => (
              <option key={i} value={i}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </header>
      <div className="game-log-list" ref={listRef} onScroll={onScroll}>
        {turns.length === 0 && <p className="muted">Nothing yet.</p>}
        {turns.map((t) => (
          <div className="game-log-turn" key={t.key}>
            <p className="game-log-divider">
              {t.player !== null && players[t.player] && (
                <PlayerBadge
                  color={players[t.player]!.color}
                  shape={players[t.player]!.shape}
                  size={12}
                />
              )}
              <span>
                {t.player === null ? (
                  'Setup'
                ) : (
                  <Named
                    text={`${names[t.player] ?? 'Someone'}'s turn`}
                    names={names}
                    players={players}
                  />
                )}
              </span>
            </p>
            <ol>
              {t.lines.map((l) => (
                <li
                  key={l.key}
                  className={l.player === null ? 'game-log-line system' : 'game-log-line'}
                  style={
                    l.player !== null && players[l.player]
                      ? { borderLeftColor: players[l.player]!.color }
                      : undefined
                  }
                >
                  <Named text={l.text} names={names} players={players} />
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
      {!atEnd && (
        <button type="button" className="game-log-latest" onClick={toEnd}>
          {unseen ? 'New moves below' : 'Back to latest'} ↓
        </button>
      )}
    </section>
  );
}
