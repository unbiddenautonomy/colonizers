import { useMemo, useState } from 'react';
import {
  analyzeMap,
  generateBoard,
  generateSeaBoard,
  MODES,
  PRESETS,
  SEA_SCENARIOS,
  type FairnessReport,
  type Mode,
} from '@colonizers/maps';
import type { MapSpec } from '@colonizers/engine';
import { cleanTheme } from '../theme/clean.ts';
import { PlayerBadge } from '../ui/PlayerBadge.tsx';
import { RESOURCE_ICON } from '../theme/clean.ts';
import type { SavedGame } from '../game/useLocalGame.ts';
import { createRoom, parseRoomCode } from '../online/api.ts';
import { saveName, savedName } from '../online/identity.ts';

const DEFAULT_NAMES = ['Alex', 'Blair', 'Casey', 'Devon', 'Emery', 'Finley', 'Gray', 'Harper'];

function randomSeed(): string {
  return Math.random().toString(36).slice(2, 8);
}

type MapChoice =
  | { kind: 'preset'; id: string }
  | { kind: 'random'; mode: Mode }
  | { kind: 'scenario'; id: string };

export function NewGame({
  onStart,
  onResume,
  canResume,
  onRules,
  onOnline,
}: {
  onOnline: (code: string) => void;
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
  const scenarios = SEA_SCENARIOS.filter((x) => count >= x.players.min && count <= x.players.max);
  const effective: MapChoice =
    (choice.kind === 'preset' && !presets.some((p) => p.id === choice.id)) ||
    (choice.kind === 'scenario' && !scenarios.some((x) => x.id === choice.id))
      ? { kind: 'random', mode: 'classic' }
      : choice;

  const sea = useMemo(
    () =>
      effective.kind === 'scenario'
        ? generateSeaBoard({ seed, players: count, scenario: effective.id })
        : null,
    [effective.kind, effective.kind === 'scenario' ? effective.id : '', seed, count], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const board = useMemo((): { map: MapSpec; report: FairnessReport } => {
    if (effective.kind === 'scenario') {
      // Fairness grading is for land boards; Seafarers boards are checked by the generator.
      const b = generateBoard({ seed, players: count, mode: 'classic' });
      return { map: b.map, report: b.report };
    }
    if (effective.kind === 'preset') {
      const p = PRESETS.find((x) => x.id === effective.id)!;
      return { map: p, report: analyzeMap(p, count) };
    }
    const b = generateBoard({ seed, players: count, mode: effective.mode });
    return { map: b.map, report: b.report };
  }, [effective.kind, effective.kind === 'random' ? effective.mode : effective.id, seed, count]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = () => {
    if (sea) {
      onStart({
        config: {
          seed: `${seed}-${Date.now().toString(36)}`,
          players: names.slice(0, count).map((n, i) => n.trim() || `Player ${i + 1}`),
          modules: ['base', 'seafarers'],
          map: sea.map,
          settings: { ...sea.settings },
          fixedSeats: true,
        },
        actions: [],
      });
      return;
    }
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
        <p className="muted">Play online with friends, or on one device passed around the table.</p>
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

      <OnlinePanel onOnline={onOnline} />

      <h2 className="section-title">Play on this device</h2>

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
        {scenarios.length > 0 && (
          <>
            <h3 className="subhead">Seafarers</h3>
            <div className="row wrap">
              {scenarios.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  className={effective.kind === 'scenario' && effective.id === x.id ? 'on' : ''}
                  onClick={() => setChoice({ kind: 'scenario', id: x.id })}
                  title={x.description}
                >
                  ⛵ {x.name}
                </button>
              ))}
            </div>
          </>
        )}
        <p className="muted">
          {effective.kind === 'random'
            ? MODES[effective.mode].description
            : effective.kind === 'scenario'
              ? SEA_SCENARIOS.find((x) => x.id === effective.id)?.description
              : PRESETS.find((p) => p.id === effective.id)?.description}
        </p>
        {effective.kind !== 'preset' && (
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
        {sea ? (
          <p className="muted">
            {sea.info.islands.length} islands, {sea.info.gold.length} gold fields
            {sea.map.hexes.some((h) => h.hidden) ? ', fog' : ''}. First to{' '}
            {String(sea.settings.vpTarget)} points wins.
          </p>
        ) : (
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
        )}
      </section>

      {!sea && (
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
      )}

      <button type="button" className="primary big" onClick={start}>
        Start game
      </button>
    </main>
  );
}

function OnlinePanel({ onOnline }: { onOnline: (code: string) => void }) {
  const [name, setName] = useState(savedName);
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = name.trim().length > 0;

  const go = (code: string) => {
    saveName(name.trim().slice(0, 20));
    onOnline(code);
  };

  return (
    <section className="card online-card">
      <h2>Play online</h2>
      <label>
        Your name{' '}
        <input
          value={name}
          maxLength={20}
          onChange={(e) => setName(e.target.value)}
          aria-label="Your name"
          placeholder="Name shown to others"
        />
      </label>
      <div className="row wrap">
        <button
          type="button"
          className="primary"
          disabled={!ready || busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              go(await createRoom());
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Could not create a room');
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Creating…' : 'Create a room'}
        </button>
        <form
          className="inline"
          onSubmit={(e) => {
            e.preventDefault();
            const code = parseRoomCode(joinCode);
            if (!code) return setError('That does not look like a room code or invite link.');
            go(code);
          }}
        >
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            placeholder="Room code or link"
            aria-label="Room code or invite link"
            size={14}
          />
          <button type="submit" disabled={!ready || !joinCode.trim()}>
            Join
          </button>
        </form>
      </div>
      {!ready && <p className="muted">Pick a name first.</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
