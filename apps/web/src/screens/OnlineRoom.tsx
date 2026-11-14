import { useState } from 'react';
import { MODES, PRESETS, SEA_SCENARIOS, SPECIAL_MAPS } from '@colonizers/maps';
import {
  TURN_TIMERS,
  VP_TARGETS,
  type ClientMessage,
  type MapChoice,
  type RoomInfo,
  type RoomSettings,
} from '../../../server/src/protocol.ts';
import {
  adoptSeatFromUrl,
  inviteLink,
  saveName,
  savedName,
  seatLink,
  tokenFor,
} from '../online/identity.ts';
import { mySeat } from '../online/roomState.ts';
import { useOnlineRoom } from '../online/useOnlineRoom.ts';
import { useTheme } from '../theme/themes.tsx';
import { NotifyButton } from '../ui/NotifyButton.tsx';
import { Chat } from '../ui/Chat.tsx';
import { PlayerBadge } from '../ui/PlayerBadge.tsx';
import { Rulebook } from '../ui/Rulebook.tsx';
import { Game } from './Game.tsx';
import {
  describeOptions,
  OptionsPanel,
  PRESET_ICON,
  SEA_ICON,
  SpecialMapButtons,
} from '../ui/OptionsPanel.tsx';
import { DEFAULT_VP_BASE, defaultOptionsFor, hasRobber, vpBonus } from '../game/defaults.ts';
import { loadCustomMaps } from '../game/customMaps.ts';
import { currentUser } from '../online/account.ts';
import { LEVEL_INFO, LEVELS, STYLE_INFO, STYLES, type Level, type Style } from '@colonizers/bots';

type Room = ReturnType<typeof useOnlineRoom>;

export function OnlineRoom({ code, onHome }: { code: string; onHome: () => void }) {
  const [name, setName] = useState(() => {
    adoptSeatFromUrl(code);
    return savedName() || currentUser()?.name || '';
  });
  if (!name) {
    return <NamePrompt code={code} onName={(n) => (saveName(n), setName(n))} onHome={onHome} />;
  }
  return <Connected key={code} code={code} name={name} onRename={setName} onHome={onHome} />;
}

function NamePrompt({
  code,
  onName,
  onHome,
}: {
  code: string;
  onName: (n: string) => void;
  onHome: () => void;
}) {
  const [value, setValue] = useState('');
  return (
    <main className="setup-page narrow">
      <h1>Join room {code}</h1>
      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) onName(value.trim().slice(0, 20));
        }}
      >
        <label>
          Your name{' '}
          <input
            autoFocus
            value={value}
            maxLength={20}
            onChange={(e) => setValue(e.target.value)}
            aria-label="Your name"
          />
        </label>
        <p className="muted">You play as a guest. Accounts come later and keep your history.</p>
        <div className="row">
          <button type="submit" className="primary" disabled={!value.trim()}>
            Join
          </button>
          <button type="button" className="ghost" onClick={onHome}>
            Back
          </button>
        </div>
      </form>
    </main>
  );
}

function Connected({
  code,
  name,
  onRename,
  onHome,
}: {
  code: string;
  name: string;
  onRename: (n: string) => void;
  onHome: () => void;
}) {
  const r = useOnlineRoom(code, name);

  if (r.conn === 'missing' || r.conn === 'removed') {
    return (
      <main className="setup-page narrow">
        <h1>{r.conn === 'missing' ? 'Room not found' : 'You left the room'}</h1>
        <p className="muted">
          {r.conn === 'missing'
            ? `There is no room called "${code}". Check the code or ask for a new invite link.`
            : r.notice}
        </p>
        <button type="button" className="primary" onClick={onHome}>
          Home
        </button>
      </main>
    );
  }
  if (!r.room) {
    return (
      <main className="setup-page narrow">
        <h1>Room {code}</h1>
        <p className="muted" role="status">
          {r.conn === 'connecting' ? 'Connecting…' : 'Reconnecting…'}
        </p>
      </main>
    );
  }

  const room = r.room;
  const isHost = room.hostId === r.you;
  if (room.status === 'lobby' || !r.game) {
    return <Lobby r={r} room={room} isHost={isHost} onRename={onRename} onHome={onHome} />;
  }
  const seat = mySeat(r);
  return (
    <Game
      key={room.code + (r.game.state.seed ?? '')}
      g={{
        state: r.game.state,
        log: r.log,
        act: r.act,
        error: r.error,
        clearError: r.clearError,
      }}
      seat={seat}
      online={{
        code: room.code,
        conn: r.conn,
        you: r.you,
        members: room.members,
        isHost,
        deadline: r.game.deadline,
        chat: r.chat,
        sendChat: (text) => r.send({ type: 'chat', text }),
        nudge: (s) => r.send({ type: 'nudge', seat: s }),
        rematch: () => r.send({ type: 'rematch' }),
      }}
      onQuit={onHome}
    />
  );
}

async function copy(text: string, title: string): Promise<'shared' | 'copied' | 'failed'> {
  try {
    if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
      await navigator.share({ title, url: text });
      return 'shared';
    }
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}

function Lobby({
  r,
  room,
  isHost,
  onRename,
  onHome,
}: {
  r: Room;
  room: RoomInfo;
  isHost: boolean;
  onRename: (n: string) => void;
  onHome: () => void;
}) {
  const theme = useTheme();
  const [copied, setCopied] = useState<string | null>(null);
  const [rules, setRules] = useState(false);
  const [editing, setEditing] = useState(false);
  const me = room.members.find((m) => m.id === r.you);
  const [draftName, setDraftName] = useState(me?.name ?? '');
  const players = room.members.filter((m) => m.role === 'player');
  const watchers = room.members.filter((m) => m.role === 'spectator');
  const s = room.settings;
  const set = (patch: Partial<RoomSettings>) =>
    r.send({ type: 'settings', settings: { ...s, ...patch } });
  // A new map or expansion starts from that game type's standard points and options.
  const setGame = (patch: Partial<RoomSettings>) =>
    set({ ...patch, vpTarget: DEFAULT_VP_BASE, options: defaultOptionsFor() });

  const share = async (link: string, what: string) => {
    const res = await copy(link, 'Join my Colonizers game');
    setCopied(
      res === 'failed' ? `Copy this link: ${link}` : res === 'copied' ? `${what} copied` : null,
    );
  };

  const [customMaps] = useState(loadCustomMaps);
  const presets = PRESETS.filter(
    (p) => players.length >= p.players.min && players.length <= p.players.max,
  );
  const scenarios = SEA_SCENARIOS.filter((x) => players.length <= x.players.max);
  const mapLabel = (m: MapChoice) =>
    m.kind === 'random'
      ? `${MODES[m.mode].name} (random)`
      : m.kind === 'scenario'
        ? `Seafarers: ${SEA_SCENARIOS.find((x) => x.id === m.id)?.name ?? m.id}`
        : m.kind === 'special'
          ? (SPECIAL_MAPS.find((x) => x.id === m.id)?.name ?? m.id)
          : m.kind === 'custom'
            ? `${m.map.name} (custom, ${m.map.players.min}–${m.map.players.max} players)`
            : (PRESETS.find((p) => p.id === m.id)?.name ?? m.id);
  const specialPick =
    s.map.kind === 'special'
      ? (SPECIAL_MAPS.find((x) => x.id === (s.map as { id: string }).id) ?? null)
      : null;
  const noCk = specialPick?.noCitiesKnights === true;
  const needsCk = specialPick?.needsCitiesKnights === true;
  const ck = (s.citiesKnights || needsCk) && !noCk;
  const gwp = ck && s.greedWealthPower && !specialPick;
  const wonders = s.worldWonders && !specialPick;
  const civs = gwp && s.civilisations;
  const church = ck && !gwp && s.church && !specialPick;
  const witches = ck && !gwp && s.witches && !specialPick;
  const princesMap = s.map.kind !== 'special';
  const princesOk = princesMap && !gwp && !church && !witches && !wonders;
  const princes = s.princes && princesOk;
  const soldiersOk =
    !ck && !wonders && !princes && s.map.kind !== 'special' && s.map.kind !== 'scenario';
  const soldiers = s.soldiers && soldiersOk;
  const bonus = vpBonus(ck, specialPick?.id ?? null, gwp, civs, church, witches, princes, soldiers);
  const optionList = describeOptions(s.options, players.length, gwp, wonders);
  const map = s.map;
  const seaPick =
    map.kind === 'scenario' ? (SEA_SCENARIOS.find((x) => x.id === map.id) ?? null) : null;

  return (
    <main className="setup-page lobby">
      <header>
        <h1>
          Room <span className="code">{room.code}</span>
        </h1>
        <p className="muted">
          {r.conn === 'open' ? 'Share the link so friends can join.' : 'Reconnecting…'}
        </p>
        <div className="row">
          <button
            type="button"
            className="primary"
            onClick={() => share(inviteLink(room.code), 'Invite link')}
          >
            🔗 Invite friends
          </button>
          <button type="button" className="ghost" onClick={() => setRules(true)}>
            📖 Rulebook
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              r.send({ type: 'leave' });
              onHome();
            }}
          >
            Leave room
          </button>
        </div>
        {copied && (
          <p className="muted" role="status">
            {copied}
          </p>
        )}
        {r.error && (
          <p className="error" role="alert">
            {r.error}
          </p>
        )}
        <NotifyButton />
      </header>

      <section className="card">
        <h2>
          Players {players.length}/{s.maxPlayers}
        </h2>
        <ul className="members">
          {players.map((m, i) => (
            <li key={m.id}>
              <PlayerBadge
                color={theme.players[i]!.color}
                shape={theme.players[i]!.shape}
                size={20}
              />
              {m.id === r.you && editing ? (
                <form
                  className="inline"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const n = draftName.trim().slice(0, 20);
                    if (n) {
                      saveName(n);
                      onRename(n);
                      r.send({ type: 'rename', name: n });
                    }
                    setEditing(false);
                  }}
                >
                  <input
                    autoFocus
                    value={draftName}
                    maxLength={20}
                    onChange={(e) => setDraftName(e.target.value)}
                    aria-label="Your name"
                  />
                  <button type="submit" className="small">
                    Save
                  </button>
                </form>
              ) : (
                <strong>{m.name}</strong>
              )}
              {m.bot && (
                <span className="pill" title={STYLE_INFO[m.bot.style].text}>
                  🤖 {LEVEL_INFO[m.bot.level].name} · {STYLE_INFO[m.bot.style].name}
                </span>
              )}
              {m.id === room.hostId && <span title="Host">👑</span>}
              <span
                className={`presence${m.online ? ' on' : ''}`}
                aria-label={m.online ? 'Online' : 'Offline'}
                title={m.online ? 'Online' : 'Offline'}
              />
              {m.id === r.you && !editing && (
                <button type="button" className="link" onClick={() => setEditing(true)}>
                  rename
                </button>
              )}
              {isHost && m.id !== r.you && (
                <button
                  type="button"
                  className="link"
                  onClick={() => r.send({ type: 'remove', member: m.id })}
                >
                  remove
                </button>
              )}
            </li>
          ))}
        </ul>
        {isHost && players.length < s.maxPlayers && <AddBot send={r.send} />}
        {watchers.length > 0 && (
          <p className="muted">Watching: {watchers.map((m) => m.name).join(', ')}</p>
        )}
        <p className="muted">Seats are shuffled when the game starts.</p>
      </section>

      <section className="card">
        <h2>Settings</h2>
        {isHost ? (
          <>
            <div className="field">
              <span>Map</span>
              <div className="row wrap">
                {(['classic', 'balanced', 'wild'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={s.map.kind === 'random' && s.map.mode === mode ? 'on' : ''}
                    title={MODES[mode].description}
                    onClick={() => setGame({ map: { kind: 'random', mode } })}
                  >
                    🎲 {MODES[mode].name}
                  </button>
                ))}
                {presets.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={s.map.kind === 'preset' && s.map.id === p.id ? 'on' : ''}
                    title={p.description}
                    onClick={() => setGame({ map: { kind: 'preset', id: p.id } })}
                  >
                    {PRESET_ICON[p.id] ?? '🗺️'} {p.name}
                  </button>
                ))}
              </div>
            </div>
            {customMaps.length > 0 && (
              <div className="field">
                <span>Your maps</span>
                <div className="row wrap">
                  {customMaps.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className={s.map.kind === 'custom' && s.map.map.id === m.id ? 'on' : ''}
                      title={`${m.description || m.name} (${m.players.min}–${m.players.max} players)`}
                      onClick={() => setGame({ map: { kind: 'custom', map: m } })}
                    >
                      ✏️ {m.name}
                    </button>
                  ))}
                </div>
                {s.map.kind === 'custom' &&
                  (players.length < s.map.map.players.min ||
                    players.length > s.map.map.players.max) && (
                    <p className="muted">
                      This map is for {s.map.map.players.min}–{s.map.map.players.max} players. With{' '}
                      {players.length}, the game starts on a random board instead.
                    </p>
                  )}
              </div>
            )}
            {scenarios.length > 0 && (
              <div className="field">
                <span>Seafarers</span>
                <div className="row wrap">
                  {scenarios.map((x) => (
                    <button
                      key={x.id}
                      type="button"
                      className={s.map.kind === 'scenario' && s.map.id === x.id ? 'on' : ''}
                      title={x.description}
                      onClick={() => setGame({ map: { kind: 'scenario', id: x.id } })}
                    >
                      {SEA_ICON[x.id] ?? '⛵'} {x.name}
                    </button>
                  ))}
                </div>
                {seaPick && <p className="muted">{seaPick.description}</p>}
              </div>
            )}
            <SpecialMapButtons
              players={Math.max(players.length, 2)}
              selected={specialPick?.id ?? null}
              onPick={(id) => setGame({ map: { kind: 'special', id } })}
            />
            {specialPick && <p className="muted">{specialPick.description}</p>}
            <label className="toggle">
              <input
                type="checkbox"
                checked={ck}
                disabled={noCk || needsCk}
                onChange={(e) => setGame({ citiesKnights: e.target.checked })}
              />{' '}
              ⚔️ Cities &amp; Knights (knights, barbarians, city improvements; +3 points to win)
            </label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={gwp}
                disabled={!ck || !!specialPick}
                onChange={(e) => setGame({ greedWealthPower: e.target.checked })}
              />{' '}
              👑 Greed, Wealth &amp; Power (fan expansion on top of Cities &amp; Knights; 18 points)
            </label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={church}
                disabled={!ck || gwp || !!specialPick}
                onChange={(e) => setGame({ church: e.target.checked })}
              />{' '}
              ⛪ Church, Faith &amp; Reformation (fan expansion on top of Cities &amp; Knights, not
              with Greed, Wealth &amp; Power; 15 points)
            </label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={witches}
                disabled={!ck || gwp || !!specialPick}
                onChange={(e) => setGame({ witches: e.target.checked })}
              />{' '}
              🧙 Witches, Wizards &amp; Dragons (fan expansion on top of Cities &amp; Knights, not
              with Greed, Wealth &amp; Power; 15 points, 17 with Church)
            </label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={princes}
                disabled={!princesOk}
                onChange={(e) => setGame({ princes: e.target.checked })}
              />{' '}
              🤴 Princes &amp; Explorers (fan expansion for the usual maps and Seafarers, with or
              without Cities &amp; Knights, not with the special maps or the other fan expansions
              yet; 4 points more than usual)
            </label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={soldiers}
                disabled={!soldiersOk}
                onChange={(e) => setGame({ soldiers: e.target.checked })}
              />{' '}
              ⚔️ Soldiers &amp; Armies (fan expansion for the base game on the usual maps, not with
              Cities &amp; Knights, Seafarers or the other expansions yet; 3 points more than usual)
            </label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={wonders}
                disabled={!!specialPick}
                onChange={(e) => setGame({ worldWonders: e.target.checked })}
              />{' '}
              🏛️ World Wonders (fan expansion: wonders in four stages; a finished one is needed to
              win)
            </label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={civs}
                disabled={!gwp}
                onChange={(e) => setGame({ civilisations: e.target.checked })}
              />{' '}
              🏳️ Civilisations (fan expansion on top of Greed, Wealth &amp; Power; 20 points)
            </label>
            {noCk && (
              <p className="muted small">
                Traders &amp; Barbarians scenarios use the base game only.
              </p>
            )}
            <div className="row wrap">
              <label>
                Points to win{' '}
                {seaPick ? (
                  <strong>set by the scenario</strong>
                ) : (
                  <select
                    value={s.vpTarget + bonus}
                    onChange={(e) => set({ vpTarget: Number(e.target.value) - bonus })}
                  >
                    {VP_TARGETS.map((v) => (
                      <option key={v} value={v + bonus}>
                        {v + bonus}
                        {v === DEFAULT_VP_BASE ? ' (standard)' : ''}
                      </option>
                    ))}
                  </select>
                )}
              </label>
              <label>
                Turn timer{' '}
                <select
                  value={s.turnTimer}
                  onChange={(e) => set({ turnTimer: Number(e.target.value) })}
                >
                  {TURN_TIMERS.map((t) => (
                    <option key={t} value={t}>
                      {timerLabel(t)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Seats{' '}
                <select
                  value={s.maxPlayers}
                  onChange={(e) => set({ maxPlayers: Number(e.target.value) })}
                >
                  {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                    <option key={n} disabled={n < players.length}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </>
        ) : (
          <ul className="settings-list">
            <li>Map: {mapLabel(s.map)}</li>
            <li>
              Expansions:{' '}
              {[
                (seaPick || specialPick?.group === 'treasures') && 'Seafarers',
                specialPick?.group === 'traders' && 'Traders & Barbarians',
                specialPick?.group === 'treasures' && 'Treasures, Dragons & Adventurers',
                specialPick?.group === 'explorers' && 'Explorers & Pirates',
                ck && 'Cities & Knights',
                gwp && 'Greed, Wealth & Power',
                wonders && 'World Wonders',
                civs && 'Civilisations',
              ]
                .filter(Boolean)
                .join(' + ') || 'none'}
            </li>
            <li>
              Points to win:{' '}
              {seaPick
                ? `set by the scenario${gwp ? ' + 8' : ck ? ' + 3' : ''}`
                : s.vpTarget + bonus}
            </li>
            <li>Turn timer: {s.turnTimer ? `${s.turnTimer / 60} min` : 'off'}</li>
            {optionList.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
        )}
        {isHost && (
          <OptionsPanel
            options={s.options}
            players={Math.max(players.length, s.maxPlayers)}
            citiesKnights={ck}
            gwp={gwp}
            wonders={wonders}
            robber={hasRobber(specialPick?.id ?? null)}
            onChange={(options) => set({ options })}
          />
        )}
        {s.turnTimer > 0 && (
          <p className="muted">
            When time runs out, the room plays the smallest safe move (roll, discard, or end the
            turn).
          </p>
        )}
      </section>

      {me?.role === 'player' && (
        <details className="card">
          <summary>Play this seat on another device too</summary>
          <p className="muted">
            Open this private link on your phone or laptop to use the same seat there. Don't share
            it: anyone with it can play as you.
          </p>
          <button
            type="button"
            onClick={() => share(seatLink(room.code, tokenFor(room.code)), 'Seat link')}
          >
            Copy my seat link
          </button>
        </details>
      )}

      <section className="card">
        <h2>Chat</h2>
        <Chat
          messages={r.chat}
          you={r.you}
          members={room.members}
          onSend={(text) => r.send({ type: 'chat', text })}
        />
      </section>

      {isHost ? (
        <button
          type="button"
          className="primary big"
          disabled={players.length < 2}
          onClick={() => r.send({ type: 'start' })}
        >
          {players.length < 2
            ? 'Waiting for players, or add a bot…'
            : `Start game with ${players.length}`}
        </button>
      ) : (
        <p className="waiting" role="status">
          Waiting for {room.members.find((m) => m.id === room.hostId)?.name ?? 'the host'} to start…
        </p>
      )}

      {rules && <Rulebook state={null} viewer={null} onClose={() => setRules(false)} />}
    </main>
  );
}

function AddBot({ send }: { send: (msg: ClientMessage) => boolean }) {
  const [level, setLevel] = useState<Level>('medium');
  const [style, setStyle] = useState<Style>('balanced');
  return (
    <div className="row add-bot">
      <select
        value={level}
        onChange={(e) => setLevel(e.target.value as Level)}
        aria-label="Bot level"
      >
        {LEVELS.map((l) => (
          <option key={l} value={l} title={LEVEL_INFO[l].text}>
            {LEVEL_INFO[l].name}
          </option>
        ))}
      </select>
      <select
        value={style}
        onChange={(e) => setStyle(e.target.value as Style)}
        aria-label="Bot style"
      >
        {STYLES.map((st) => (
          <option key={st} value={st} title={STYLE_INFO[st].text}>
            {STYLE_INFO[st].name}
          </option>
        ))}
      </select>
      <button type="button" onClick={() => send({ type: 'addBot', level, style })}>
        🤖 Add a bot
      </button>
    </div>
  );
}

function timerLabel(seconds: number): string {
  if (seconds === 0) return 'Off';
  if (seconds < 3600) return `${seconds / 60} min`;
  if (seconds < 86400) return `${seconds / 3600} hours (async)`.replace('1 hours', '1 hour');
  return `${seconds / 86400} day${seconds === 86400 ? '' : 's'} (async)`;
}
