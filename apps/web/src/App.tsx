import { useEffect, useState } from 'react';
import { ENGINE_VERSION } from '@colonizers/engine';
import { useRoom } from './useRoom.ts';

interface Health {
  ok: boolean;
  engine: string;
}

const DIE_FACES = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

function useHealth() {
  const [health, setHealth] = useState<Health | 'error' | null>(null);
  useEffect(() => {
    fetch('/api/health')
      .then((r) =>
        r.ok ? (r.json() as Promise<Health>) : Promise.reject(new Error(String(r.status))),
      )
      .then(setHealth)
      .catch(() => setHealth('error'));
  }, []);
  return health;
}

function initialRoomId(): string {
  const fromUrl = new URLSearchParams(window.location.search).get('room');
  return fromUrl && /^[a-z0-9-]{1,40}$/.test(fromUrl) ? fromUrl : 'test-room';
}

export function App() {
  const health = useHealth();
  const [roomId] = useState(initialRoomId);
  const [name, setName] = useState(() => localStorageGet('name') ?? '');
  const { state, roll } = useRoom(roomId);
  const latest = state.events.at(-1);

  return (
    <main className="page">
      <header>
        <h1>Colonizers</h1>
        <p className="muted">Phase 0 test page. If you can see this, the deploy works.</p>
      </header>

      <section className="card">
        <h2>Status</h2>
        <ul className="status">
          <li>
            Web app: <strong>ok</strong> (engine {ENGINE_VERSION})
          </li>
          <li>
            API:{' '}
            <strong>
              {health === null
                ? 'checking…'
                : health === 'error'
                  ? 'unreachable'
                  : `ok (engine ${health.engine})`}
            </strong>
          </li>
          <li>
            Room <code>{roomId}</code>: <strong>{state.status}</strong>, {state.online} online
          </li>
        </ul>
      </section>

      <section className="card">
        <h2>Test room</h2>
        <p className="muted">
          Open this page on two devices. Rolls show up on both, and a refresh catches up on what you
          missed.
        </p>
        <div className="row">
          <input
            aria-label="Your name"
            placeholder="Your name"
            value={name}
            maxLength={32}
            onChange={(e) => {
              setName(e.target.value);
              localStorageSet('name', e.target.value);
            }}
          />
          <button type="button" disabled={state.status !== 'open'} onClick={() => roll(name)}>
            Roll dice
          </button>
        </div>
        {latest && (
          <p className="latest" aria-live="polite">
            <span className="dice">
              {DIE_FACES[latest.dice[0]]} {DIE_FACES[latest.dice[1]]}
            </span>{' '}
            {latest.name} rolled <strong>{latest.total}</strong>
          </p>
        )}
        <ol className="log" reversed>
          {[...state.events].reverse().map((e) => (
            <li key={e.seq}>
              #{e.seq} {e.name}: {e.dice[0]} + {e.dice[1]} = {e.total}
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}

function localStorageGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function localStorageSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage blocked; the name just won't be remembered.
  }
}
