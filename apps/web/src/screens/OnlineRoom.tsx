import { useState } from 'react';
import { MODES, PRESETS, SEA_SCENARIOS } from '@colonizers/maps';
import {
  TURN_TIMERS,
  VP_TARGETS,
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
import { cleanTheme } from '../theme/clean.ts';
import { Chat } from '../ui/Chat.tsx';
import { PlayerBadge } from '../ui/PlayerBadge.tsx';
import { Rulebook } from '../ui/Rulebook.tsx';
import { Game } from './Game.tsx';

type Room = ReturnType<typeof useOnlineRoom>;

export function OnlineRoom({ code, onHome }: { code: string; onHome: () => void }) {
  const [name, setName] = useState(() => {
    adoptSeatFromUrl(code);
    return savedName();
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

  const share = async (link: string, what: string) => {
    const res = await copy(link, 'Join my Colonizers game');
    setCopied(
      res === 'failed' ? `Copy this link: ${link}` : res === 'copied' ? `${what} copied` : null,
    );
  };

  const presets = PRESETS.filter(
    (p) => players.length >= p.players.min && players.length <= p.players.max,
  );
  const scenarios = SEA_SCENARIOS.filter((x) => players.length <= x.players.max);
  const mapLabel = (m: MapChoice) =>
    m.kind === 'random'
      ? `${MODES[m.mode].name} (random)`
      : m.kind === 'scenario'
        ? `Seafarers: ${SEA_SCENARIOS.find((x) => x.id === m.id)?.name ?? m.id}`
        : (PRESETS.find((p) => p.id === m.id)?.name ?? m.id);
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
      </header>

      <section className="card">
        <h2>
          Players {players.length}/{s.maxPlayers}
        </h2>
        <ul className="members">
          {players.map((m, i) => (
            <li key={m.id}>
              <PlayerBadge
                color={cleanTheme.players[i]!.color}
                shape={cleanTheme.players[i]!.shape}
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
                    onClick={() => set({ map: { kind: 'random', mode } })}
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
                    onClick={() => set({ map: { kind: 'preset', id: p.id } })}
                  >
                    🗺️ {p.name}
                  </button>
                ))}
              </div>
            </div>
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
                      onClick={() => set({ map: { kind: 'scenario', id: x.id } })}
                    >
                      ⛵ {x.name}
                    </button>
                  ))}
                </div>
                {seaPick && <p className="muted">{seaPick.description}</p>}
              </div>
            )}
            <label className="toggle">
              <input
                type="checkbox"
                checked={s.citiesKnights}
                onChange={(e) => set({ citiesKnights: e.target.checked })}
              />{' '}
              ⚔️ Cities &amp; Knights (knights, barbarians, city improvements; +3 points to win)
            </label>
            <div className="row wrap">
              <label>
                Points to win{' '}
                <select
                  value={s.vpTarget}
                  onChange={(e) => set({ vpTarget: Number(e.target.value) })}
                >
                  {VP_TARGETS.map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <label>
                Turn timer{' '}
                <select
                  value={s.turnTimer}
                  onChange={(e) => set({ turnTimer: Number(e.target.value) })}
                >
                  {TURN_TIMERS.map((t) => (
                    <option key={t} value={t}>
                      {t === 0 ? 'Off' : `${t / 60} min`}
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
              {[seaPick && 'Seafarers', s.citiesKnights && 'Cities & Knights']
                .filter(Boolean)
                .join(' + ') || 'none'}
            </li>
            <li>
              Points to win: {seaPick ? 'set by the scenario' : s.vpTarget}
              {s.citiesKnights ? ' + 3' : ''}
            </li>
            <li>Turn timer: {s.turnTimer ? `${s.turnTimer / 60} min` : 'off'}</li>
          </ul>
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
          {players.length < 2 ? 'Waiting for players…' : `Start game with ${players.length}`}
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
