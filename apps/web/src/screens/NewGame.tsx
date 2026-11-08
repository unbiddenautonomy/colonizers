import { useMemo, useState } from 'react';
import {
  analyzeMap,
  generateBoard,
  MODES,
  PRESETS,
  type FairnessReport,
  type Mode,
} from '@colonizers/maps';
import type { MapSpec } from '@colonizers/engine';
import { cleanTheme } from '../theme/clean.ts';
import { PlayerBadge } from '../ui/PlayerBadge.tsx';
import { RESOURCE_ICON } from '../theme/clean.ts';
import type { SavedGame } from '../game/useLocalGame.ts';

const DEFAULT_NAMES = ['Alex', 'Blair', 'Casey', 'Devon', 'Emery', 'Finley', 'Gray', 'Harper'];

function randomSeed(): string {
  return Math.random().toString(36).slice(2, 8);
}

type MapChoice = { kind: 'preset'; id: string } | { kind: 'random'; mode: Mode };

export function NewGame({
  onStart,
  onResume,
  canResume,
  onRules,
}: {
  onStart: (g: SavedGame) => void;
  onResume: () => void;
  canResume: boolean;
  onRules: () => void;
}) {
  const [count, setCount] = useState(4);
  const [names, setNames] = useState(DEFAULT_NAMES);
  const [choice, setChoice] = useState<MapChoice>({ kind: 'random', mode: 'classic' });
  const [seed, setSeed] = useState(randomSeed);
  const [vpTarget, setVpTarget] = useState(10);

  const presets = PRESETS.filter((p) => count >= p.players.min && count <= p.players.max);
  const effective: MapChoice =
    choice.kind === 'preset' && !presets.some((p) => p.id === choice.id)
      ? { kind: 'random', mode: 'classic' }
      : choice;

  const board = useMemo((): { map: MapSpec; report: FairnessReport } => {
    if (effective.kind === 'preset') {
      const p = PRESETS.find((x) => x.id === effective.id)!;
      return { map: p, report: analyzeMap(p, count) };
    }
    const b = generateBoard({ seed, players: count, mode: effective.mode });
    return { map: b.map, report: b.report };
  }, [effective.kind, effective.kind === 'preset' ? effective.id : effective.mode, seed, count]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = () => {
    onStart({
      config: {
        seed: `${seed}-${Date.now().toString(36)}`,
        players: names.slice(0, count).map((n, i) => n.trim() || `Player ${i + 1}`),
        modules: ['base'],
        map: board.map,
        settings: { vpTarget },
        fixedSeats: true,
      },
      actions: [],
    });
  };

  const r = board.report;
  return (
    <main className="setup-page">
      <header>
        <h1>Colonizers</h1>
        <p className="muted">
          Play on one device, passing it around the table. Online play comes next.
        </p>
        <div className="row">
          {canResume && (
            <button type="button" className="primary" onClick={onResume}>
              Resume saved game
            </button>
          )}
          <button type="button" className="ghost" onClick={onRules}>
            📖 Rulebook
          </button>
        </div>
      </header>

      <section className="card">
        <h2>Players</h2>
        <div className="row">
          {[2, 3, 4, 5, 6, 7, 8].map((n) => (
            <button
              key={n}
              type="button"
              className={count === n ? 'on' : ''}
              onClick={() => setCount(n)}
              aria-pressed={count === n}
            >
              {n}
            </button>
          ))}
        </div>
        {count > 4 && (
          <p className="muted">
            5–8 players use the bigger boards. The Special Building Phase arrives in a later update.
          </p>
        )}
        <div className="names">
          {names.slice(0, count).map((n, i) => (
            <label key={i} className="name-row">
              <PlayerBadge
                color={cleanTheme.players[i]!.color}
                shape={cleanTheme.players[i]!.shape}
                size={20}
              />
              <input
                value={n}
                maxLength={20}
                onChange={(e) => setNames(names.map((x, j) => (j === i ? e.target.value : x)))}
                aria-label={`Player ${i + 1} name`}
              />
            </label>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Map</h2>
        <div className="row wrap">
          {(Object.keys(MODES) as Mode[])
            .filter((m) => m !== 'custom')
            .map((m) => (
              <button
                key={m}
                type="button"
                className={effective.kind === 'random' && effective.mode === m ? 'on' : ''}
                onClick={() => setChoice({ kind: 'random', mode: m })}
                title={MODES[m].description}
              >
                🎲 {MODES[m].name}
              </button>
            ))}
          {presets.map((p) => (
            <button
              key={p.id}
              type="button"
              className={effective.kind === 'preset' && effective.id === p.id ? 'on' : ''}
              onClick={() => setChoice({ kind: 'preset', id: p.id })}
              title={p.description}
            >
              🗺️ {p.name}
            </button>
          ))}
        </div>
        <p className="muted">
          {effective.kind === 'random'
            ? MODES[effective.mode].description
            : PRESETS.find((p) => p.id === effective.id)?.description}
        </p>
        {effective.kind === 'random' && (
          <div className="row">
            <label>
              Seed{' '}
              <input
                value={seed}
                onChange={(e) => setSeed(e.target.value.slice(0, 24))}
                size={10}
                aria-label="Board seed"
              />
            </label>
            <button type="button" onClick={() => setSeed(randomSeed())}>
              Reroll
            </button>
          </div>
        )}
        <div className="fairness">
          <span className={`grade grade-${r.grade}`} title="Fairness grade">
            {r.grade}
          </span>
          <div>
            <div className="pips">
              {Object.entries(r.pipsPerResource).map(([res, n]) => (
                <span
                  key={res}
                  title={`${res}: ${n} pips (fair share ${r.fairShare[res]?.toFixed(1)})`}
                >
                  {RESOURCE_ICON[res]} {n}
                </span>
              ))}
            </div>
            <small className="muted">
              Best starting spots: {r.startingSpots.join(', ')} pips. Best corner {r.bestCorner}.
            </small>
          </div>
        </div>
      </section>

      <section className="card">
        <h2>Rules</h2>
        <label>
          Points to win{' '}
          <select value={vpTarget} onChange={(e) => setVpTarget(Number(e.target.value))}>
            {[8, 9, 10, 11, 12, 13, 14, 15].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
      </section>

      <button type="button" className="primary big" onClick={start}>
        Start game
      </button>
    </main>
  );
}
