import { useMemo, useState, type ReactNode } from 'react';
import {
  analyzeMap,
  generateBoard,
  generateSeaBoard,
  MODES,
  PRESETS,
  SEA_SCENARIOS,
  SPECIAL_MAPS,
  generateSpecialBoard,
  type FairnessReport,
  type Mode,
} from '@colonizers/maps';
import type { MapSpec } from '@colonizers/engine';
import { ThemePicker, useTheme } from '../theme/themes.tsx';
import { DicePicker } from '../ui/Dice.tsx';
import { PlayerBadge } from '../ui/PlayerBadge.tsx';
import { RESOURCE_ICON } from '../theme/clean.ts';
import type { SavedGame } from '../game/useLocalGame.ts';
import {
  LEVEL_INFO,
  LEVELS,
  STYLE_INFO,
  STYLES,
  type BotConfig,
  type Level,
  type Style,
} from '@colonizers/bots';
import { createRoom, parseRoomCode } from '../online/api.ts';
import { saveName, savedName } from '../online/identity.ts';
import {
  describeOptions,
  OptionsPanel,
  PRESET_ICON,
  SEA_ICON,
  SpecialMapButtons,
} from '../ui/OptionsPanel.tsx';
import {
  moduleList,
  optionSettings,
  VP_TARGETS,
  type GameOptions,
} from '../../../server/src/protocol.ts';
import { useAccount } from '../online/account.ts';
import { loadCustomMaps } from '../game/customMaps.ts';
import {
  changedOptions,
  DEFAULT_VP_BASE,
  defaultOptionsFor,
  hasRobber,
  vpBonus,
} from '../game/defaults.ts';

const DEFAULT_NAMES = ['Alex', 'Blair', 'Casey', 'Devon', 'Emery', 'Finley', 'Gray', 'Harper'];

function randomSeed(): string {
  return Math.random().toString(36).slice(2, 8);
}

type MapChoice =
  | { kind: 'preset'; id: string }
  | { kind: 'custom'; id: string }
  | { kind: 'random'; mode: Mode }
  | { kind: 'scenario'; id: string }
  | { kind: 'special'; id: string };

export function NewGame({
  onStart,
  onResume,
  canResume,
  onRules,
  onOnline,
  onEditor,
  account,
}: {
  account?: ReactNode;
  /** Opens the map editor, on a saved map or a new one. */
  onEditor: (id: string | null) => void;
  onOnline: (code: string) => void;
  onStart: (g: SavedGame) => void;
  onResume: () => void;
  canResume: boolean;
  onRules: () => void;
}) {
  const theme = useTheme();
  const [count, setCount] = useState(4);
  const [names, setNames] = useState(DEFAULT_NAMES);
  const [choice, setChoice] = useState<MapChoice>({ kind: 'random', mode: 'classic' });
  const [seed, setSeed] = useState(randomSeed);
  const [ckWanted, setCk] = useState(false);
  const [gwpWanted, setGwp] = useState(false);
  const [wondersWanted, setWonders] = useState(false);
  // Points and options belong to one game type: picking another map or
  // expansion starts again from that type's defaults.
  const [vpPick, setVpPick] = useState({ key: '', base: DEFAULT_VP_BASE });
  const [optPick, setOptPick] = useState({ key: '', options: defaultOptionsFor() });
  const admin = useAccount().user?.admin === true;
  const [seatKind, setSeatKind] = useState<('human' | Level)[]>(() =>
    DEFAULT_NAMES.map(() => 'human'),
  );
  const [botStyle, setBotStyle] = useState<Style | 'mixed'>('mixed');
  const anyBots = seatKind.slice(0, count).some((k) => k !== 'human');
  const botsFor = (): Record<number, BotConfig> => {
    const out: Record<number, BotConfig> = {};
    seatKind.slice(0, count).forEach((k, i) => {
      if (k === 'human') return;
      const style = botStyle === 'mixed' ? STYLES[(i * 3 + count) % STYLES.length]! : botStyle;
      out[i] = { level: k, style };
    });
    return out;
  };

  const presets = PRESETS.filter((p) => count >= p.players.min && count <= p.players.max);
  const [allCustom] = useState(loadCustomMaps);
  const customMaps = allCustom.filter((m) => count >= m.players.min && count <= m.players.max);
  const scenarios = SEA_SCENARIOS.filter((x) => count >= x.players.min && count <= x.players.max);
  const effective: MapChoice =
    (choice.kind === 'preset' && !presets.some((p) => p.id === choice.id)) ||
    (choice.kind === 'custom' && !customMaps.some((p) => p.id === choice.id)) ||
    (choice.kind === 'scenario' && !scenarios.some((x) => x.id === choice.id)) ||
    (choice.kind === 'special' &&
      !SPECIAL_MAPS.some(
        (x) => x.id === choice.id && count >= x.players.min && count <= x.players.max,
      ))
      ? { kind: 'random', mode: 'classic' }
      : choice;
  const specialId = effective.kind === 'special' ? effective.id : null;
  const noCk = SPECIAL_MAPS.find((x) => x.id === specialId)?.noCitiesKnights === true;
  const needsCk = SPECIAL_MAPS.find((x) => x.id === specialId)?.needsCitiesKnights === true;
  const ck = (ckWanted || needsCk) && !noCk;
  // Greed, Wealth & Power goes on top of Cities & Knights, on the usual maps and Seafarers.
  const gwp = ck && gwpWanted && !specialId;
  // World Wonders goes on the usual maps and Seafarers, with or without Cities & Knights.
  const wonders = wondersWanted && !specialId;
  const extraVp = gwp ? 8 : ck ? 3 : 0;
  const gameKey = `${effective.kind}:${effective.kind === 'random' ? effective.mode : effective.id}:${ck}:${gwp}:${wonders}`;
  const vpTarget = vpPick.key === gameKey ? vpPick.base : DEFAULT_VP_BASE;
  const setVpTarget = (base: number) => setVpPick({ key: gameKey, base });
  const options = optPick.key === gameKey ? optPick.options : defaultOptionsFor();
  const setOptions = (o: GameOptions) => setOptPick({ key: gameKey, options: o });
  const bonus = vpBonus(ck, specialId, gwp);
  const isTraders = SPECIAL_MAPS.find((x) => x.id === specialId)?.group === 'traders';
  const isTreasures = SPECIAL_MAPS.find((x) => x.id === specialId)?.group === 'treasures';
  const isExplorers = SPECIAL_MAPS.find((x) => x.id === specialId)?.group === 'explorers';
  const special = useMemo(
    () => (specialId ? generateSpecialBoard({ seed, players: count, map: specialId }) : null),
    [specialId, seed, count],
  );

  const sea = useMemo(
    () =>
      effective.kind === 'scenario'
        ? generateSeaBoard({ seed, players: count, scenario: effective.id })
        : null,
    [effective.kind, effective.kind === 'scenario' ? effective.id : '', seed, count], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const board = useMemo((): { map: MapSpec; report: FairnessReport } => {
    if (effective.kind === 'scenario' || effective.kind === 'special') {
      // Fairness grading is for land boards; Seafarers boards are checked by the generator.
      const b = generateBoard({ seed, players: count, mode: 'classic' });
      return { map: b.map, report: b.report };
    }
    if (effective.kind === 'preset' || effective.kind === 'custom') {
      const list = effective.kind === 'preset' ? PRESETS : customMaps;
      const p = list.find((x) => x.id === effective.id)!;
      return { map: p, report: analyzeMap(p, count) };
    }
    const b = generateBoard({ seed, players: count, mode: effective.mode });
    return { map: b.map, report: b.report };
  }, [effective.kind, effective.kind === 'random' ? effective.mode : effective.id, seed, count]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = () => {
    const players = names.slice(0, count).map((n, i) => n.trim() || `Player ${i + 1}`);
    const opts = optionSettings(options, count);
    const make = (extraModules: string[], map: MapSpec, own: Record<string, unknown>) =>
      onStart({
        config: {
          seed: `${seed}-${Date.now().toString(36)}`,
          players,
          modules: moduleList(extraModules, ck, gwp, wonders),
          map,
          settings: { ...opts, ...own },
          fixedSeats: true,
        },
        actions: [],
        bots: botsFor(),
      });
    if (sea)
      return make(['seafarers'], sea.map, {
        ...sea.settings,
        vpTarget: Number(sea.settings.vpTarget) + extraVp,
      });
    if (special)
      return make(special.modules, special.map, {
        ...special.settings,
        vpTarget: vpTarget + extraVp,
      });
    make([], board.map, { vpTarget: vpTarget + extraVp });
  };

  const r = board.report;
  return (
    <main className="setup-page">
      <header>
        {account}
        <h1 className="brand">
          <img className="brand-mark" src="/logo.svg" alt="" width="56" height="56" />
          Colonizers
        </h1>
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
          <ThemePicker />
          <DicePicker />
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
            5–8 players use the bigger boards. Pick how turns work under Rules.
          </p>
        )}
        <div className="names">
          {names.slice(0, count).map((n, i) => (
            <label key={i} className="name-row">
              <PlayerBadge
                color={theme.players[i]!.color}
                shape={theme.players[i]!.shape}
                size={20}
              />
              <input
                value={n}
                maxLength={20}
                onChange={(e) => setNames(names.map((x, j) => (j === i ? e.target.value : x)))}
                aria-label={`Player ${i + 1} name`}
              />
              <select
                value={seatKind[i]}
                aria-label={`Who plays ${n || `player ${i + 1}`}`}
                onChange={(e) =>
                  setSeatKind(
                    seatKind.map((x, j) => (j === i ? (e.target.value as 'human' | Level) : x)),
                  )
                }
              >
                <option value="human">Person</option>
                {LEVELS.map((l) => (
                  <option key={l} value={l} title={LEVEL_INFO[l].text}>
                    {LEVEL_INFO[l].name} bot
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <div className="row">
          <button
            type="button"
            onClick={() => setSeatKind(seatKind.map((_, i) => (i === 0 ? 'human' : 'medium')))}
          >
            🤖 Play against bots
          </button>
          {anyBots && (
            <label>
              Bot style{' '}
              <select
                value={botStyle}
                onChange={(e) => setBotStyle(e.target.value as Style | 'mixed')}
              >
                <option value="mixed">Mixed</option>
                {STYLES.map((st) => (
                  <option key={st} value={st} title={STYLE_INFO[st].text}>
                    {STYLE_INFO[st].name}
                  </option>
                ))}
              </select>
            </label>
          )}
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
              {PRESET_ICON[p.id] ?? '🗺️'} {p.name}
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
                  {SEA_ICON[x.id] ?? '⛵'} {x.name}
                </button>
              ))}
            </div>
          </>
        )}
        <h3 className="subhead">Your maps</h3>
        <div className="row wrap">
          {customMaps.map((m) => (
            <button
              key={m.id}
              type="button"
              className={effective.kind === 'custom' && effective.id === m.id ? 'on' : ''}
              onClick={() => setChoice({ kind: 'custom', id: m.id })}
              title={m.description || m.name}
            >
              ✏️ {m.name}
            </button>
          ))}
          {effective.kind === 'custom' && (
            <button type="button" className="ghost" onClick={() => onEditor(effective.id)}>
              Edit this map
            </button>
          )}
          <button type="button" className="ghost" onClick={() => onEditor(null)}>
            ＋ Make a map
          </button>
        </div>
        {allCustom.length > customMaps.length && (
          <p className="muted small">
            {allCustom.length - customMaps.length} of your maps don't fit {count} players.
          </p>
        )}
        <SpecialMapButtons
          players={count}
          selected={specialId}
          onPick={(id) => setChoice({ kind: 'special', id })}
        />
        <p className="muted">
          {effective.kind === 'random'
            ? MODES[effective.mode].description
            : effective.kind === 'scenario'
              ? SEA_SCENARIOS.find((x) => x.id === effective.id)?.description
              : effective.kind === 'special'
                ? SPECIAL_MAPS.find((x) => x.id === effective.id)?.description
                : effective.kind === 'custom'
                  ? customMaps.find((p) => p.id === effective.id)?.description ||
                    'A map you drew in the map editor.'
                  : PRESETS.find((p) => p.id === effective.id)?.description}
        </p>
        {effective.kind !== 'preset' && effective.kind !== 'custom' && (
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
        {special ? null : sea ? (
          <p className="muted">
            {sea.info.islands.length} islands, {sea.info.gold.length} gold fields
            {sea.map.hexes.some((h) => h.hidden) ? ', fog' : ''}. First to{' '}
            {Number(sea.settings.vpTarget) + extraVp} points wins.
          </p>
        ) : !admin ? null : (
          <div className="fairness" title="Shown to admins only">
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

      <section className="card">
        <h2>Rules</h2>
        <h3 className="subhead">Expansions</h3>
        <div className="expansions">
          <button
            type="button"
            className={`expansion ${sea || isTreasures ? 'on' : ''}`}
            aria-pressed={!!sea || isTreasures}
            disabled={!scenarios.length}
            onClick={() =>
              sea
                ? setChoice({ kind: 'random', mode: 'classic' })
                : scenarios[0] && setChoice({ kind: 'scenario', id: scenarios[0].id })
            }
          >
            <strong>⛵ Seafarers</strong>
            <small>Ships, islands, gold fields and the pirate. Pick a Seafarers map above.</small>
          </button>
          <button
            type="button"
            className={`expansion ${ck ? 'on' : ''}`}
            aria-pressed={ck}
            disabled={noCk || needsCk}
            onClick={() => setCk(!ck)}
          >
            <strong>⚔️ Cities &amp; Knights</strong>
            <small>
              {needsCk
                ? 'This scenario is played with Cities & Knights.'
                : noCk
                  ? isTreasures
                    ? 'Not with these Treasures, Dragons & Adventurers scenarios yet.'
                    : isExplorers
                      ? 'Not with Explorers & Pirates, which has its own rules.'
                      : 'Not with Traders & Barbarians scenarios, which use the base game.'
                  : 'Knights, barbarians, commodities and city improvements. Works with every map.'}
            </small>
          </button>
          <button
            type="button"
            className={`expansion ${gwp ? 'on' : ''}`}
            aria-pressed={gwp}
            disabled={!ck || !!specialId}
            onClick={() => setGwp(!gwp)}
          >
            <strong>👑 Greed, Wealth &amp; Power</strong>
            <small>
              {ck && !specialId
                ? 'Fan expansion for Cities & Knights: Magic, Religion and Wealth tracks, special buildings and Beer. 18 points.'
                : 'Fan expansion that goes on top of Cities & Knights, on the usual maps or Seafarers.'}
            </small>
          </button>
          <button
            type="button"
            className={`expansion ${wonders ? 'on' : ''}`}
            aria-pressed={wonders}
            disabled={!!specialId}
            onClick={() => setWonders(!wonders)}
          >
            <strong>🏛️ World Wonders</strong>
            <small>
              {specialId
                ? 'Fan expansion for the usual maps and Seafarers, not the special maps.'
                : 'Fan expansion: fourteen wonders to build in four stages. You need a finished one to win.'}
            </small>
          </button>
          <button
            type="button"
            className={`expansion ${isTraders ? 'on' : ''}`}
            aria-pressed={isTraders}
            onClick={() =>
              isTraders
                ? setChoice({ kind: 'random', mode: 'classic' })
                : setChoice({ kind: 'special', id: 'fishermen' })
            }
          >
            <strong>🛒 Traders &amp; Barbarians</strong>
            <small>Five scenarios, each adding one idea. Pick one under Map above.</small>
          </button>
          <button
            type="button"
            className={`expansion ${isTreasures ? 'on' : ''}`}
            aria-pressed={isTreasures}
            disabled={count < 3 || count > 6}
            onClick={() =>
              isTreasures
                ? setChoice({ kind: 'random', mode: 'classic' })
                : setChoice({ kind: 'special', id: 'treasure-islands' })
            }
          >
            <strong>🧰 Treasures, Dragons &amp; Adventurers</strong>
            <small>
              Treasure chests, fog and dragons on Seafarers maps, for 3 to 6 players. Pick one under
              Map above.
            </small>
          </button>
          <button
            type="button"
            className={`expansion ${isExplorers ? 'on' : ''}`}
            aria-pressed={isExplorers}
            disabled={count < 2 || count > 4}
            onClick={() =>
              isExplorers
                ? setChoice({ kind: 'random', mode: 'classic' })
                : setChoice({ kind: 'special', id: 'land-ho' })
            }
          >
            <strong>🔭 Explorers &amp; Pirates</strong>
            <small>
              Harbor settlements, ships that carry settlers into the fog, and gold, for 2 to 4
              players. No cities or robber.
            </small>
          </button>
        </div>
        <h3 className="subhead">Winning</h3>
        {sea ? (
          <p>
            First to <strong>{Number(sea.settings.vpTarget) + extraVp}</strong> points, set by the
            scenario
            {gwp ? ' (+8 for Greed, Wealth & Power)' : ck ? ' (+3 for Cities & Knights)' : ''}.
          </p>
        ) : (
          <label>
            Points to win{' '}
            <select
              value={vpTarget + bonus}
              onChange={(e) => setVpTarget(Number(e.target.value) - bonus)}
            >
              {VP_TARGETS.map((v) => (
                <option key={v} value={v + bonus}>
                  {v + bonus}
                  {v === DEFAULT_VP_BASE ? ' (standard)' : ''}
                </option>
              ))}
            </select>
            {bonus !== 0 && (
              <small className="muted">
                {' '}
                {[
                  ck && '+3 for Cities & Knights',
                  bonus - extraVp > 0 && `+${bonus - extraVp} for the scenario`,
                  bonus - extraVp < 0 && `${bonus - extraVp} for the scenario`,
                ]
                  .filter(Boolean)
                  .join(', ')}{' '}
                are included
              </small>
            )}
          </label>
        )}
        <OptionsPanel
          options={options}
          players={count}
          citiesKnights={ck}
          gwp={gwp}
          wonders={wonders}
          robber={hasRobber(specialId)}
          onChange={setOptions}
        />
        {(vpTarget !== DEFAULT_VP_BASE || changedOptions(options).length > 0) && (
          <p className="row wrap changed">
            <span className="muted">
              Changed from the standard rules:{' '}
              {[
                vpTarget !== DEFAULT_VP_BASE && !sea && `${vpTarget + bonus} points to win`,
                ...describeOptions(options, count, gwp, wonders),
              ]
                .filter(Boolean)
                .join(', ') || 'turn style'}
              .
            </span>
            <button
              type="button"
              className="link"
              onClick={() => {
                setVpTarget(DEFAULT_VP_BASE);
                setOptions(defaultOptionsFor());
              }}
            >
              Reset to defaults
            </button>
          </p>
        )}
      </section>

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
