import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  AVATARS,
  createCrew,
  crewByInvite,
  crewDetail,
  crewInviteLink,
  describeModules,
  forgotPassword,
  googleSignInUrl,
  history,
  joinCrew,
  leaveCrew,
  logIn,
  logOut,
  myCrews,
  renewInvite,
  resendVerify,
  resetPassword,
  setPassword,
  signUp,
  updateProfile,
  useAccount,
  type CrewDetail,
  type CrewSummary,
  type HistoryGame,
} from '../online/account.ts';
import { Modal } from '../ui/Modal.tsx';

function message(e: unknown): string {
  return e instanceof Error ? e.message : 'Something went wrong. Try again.';
}

function when(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: new Date(ms).getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  });
}

/** Runs an async action with a busy flag and an error line. */
function useTask() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      return true;
    } catch (e) {
      setError(message(e));
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, setError, run };
}

function ErrorLine({ error }: { error: string | null }) {
  return error ? (
    <p className="error" role="alert">
      {error}
    </p>
  ) : null;
}

// ---- Header button on the home page ----

export function AccountBar({
  onSignIn,
  onProfile,
}: {
  onSignIn: () => void;
  onProfile: () => void;
}) {
  const { loaded, user } = useAccount();
  if (!loaded) return <div className="account-bar" aria-hidden="true" />;
  return (
    <div className="account-bar">
      {user ? (
        <button type="button" className="ghost account-chip" onClick={onProfile}>
          <span className="avatar">{user.avatar}</span> {user.name}
        </button>
      ) : (
        <button type="button" className="ghost" onClick={onSignIn}>
          Sign in
        </button>
      )}
    </div>
  );
}

// ---- Sign in, sign up, forgot password ----

type AuthMode = 'signin' | 'signup' | 'forgot';

export function SignInDialog({
  onClose,
  onDone,
  intro,
  initial = 'signin',
}: {
  onClose: () => void;
  onDone?: () => void;
  intro?: ReactNode;
  initial?: AuthMode;
}) {
  const { google } = useAccount();
  const [mode, setMode] = useState<AuthMode>(initial);
  const [email, setEmail] = useState('');
  const [password, setPw] = useState('');
  const [name, setName] = useState('');
  const [sent, setSent] = useState(false);
  const { busy, error, setError, run } = useTask();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (mode === 'forgot') {
      if (await run(() => forgotPassword(email))) setSent(true);
      return;
    }
    const good = await run(() =>
      mode === 'signin' ? logIn(email, password) : signUp(email, password, name),
    );
    if (good) (onDone ?? onClose)();
  };

  const switchTo = (m: AuthMode) => {
    setMode(m);
    setError(null);
    setSent(false);
  };

  const title =
    mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create an account' : 'Reset your password';
  return (
    <Modal title={title} onClose={onClose}>
      {intro}
      {mode !== 'forgot' && google && (
        <>
          <a
            className="button google"
            href={googleSignInUrl(window.location.pathname + window.location.search)}
          >
            <span aria-hidden="true">G</span> Continue with Google
          </a>
          <p className="or">or with email</p>
        </>
      )}
      {sent ? (
        <p>
          If there is an account for <strong>{email}</strong>, a reset link is on its way. It works
          for 2 hours.
        </p>
      ) : (
        <form className="auth-form" onSubmit={submit}>
          {mode === 'signup' && (
            <label className="field">
              <span>Name shown to others</span>
              <input
                value={name}
                maxLength={20}
                onChange={(e) => setName(e.target.value)}
                autoComplete="nickname"
              />
            </label>
          )}
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              value={email}
              required
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </label>
          {mode !== 'forgot' && (
            <label className="field">
              <span>Password</span>
              <input
                type="password"
                value={password}
                required
                minLength={mode === 'signup' ? 8 : undefined}
                onChange={(e) => setPw(e.target.value)}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              />
              {mode === 'signup' && <small className="muted">At least 8 characters.</small>}
            </label>
          )}
          <ErrorLine error={error} />
          <button type="submit" className="primary big" disabled={busy}>
            {busy
              ? 'One moment…'
              : mode === 'signin'
                ? 'Sign in'
                : mode === 'signup'
                  ? 'Create account'
                  : 'Send reset link'}
          </button>
        </form>
      )}
      <p className="auth-switch">
        {mode === 'signin' ? (
          <>
            New here?{' '}
            <button type="button" className="link" onClick={() => switchTo('signup')}>
              Create an account
            </button>
            ·
            <button type="button" className="link" onClick={() => switchTo('forgot')}>
              Forgot password?
            </button>
          </>
        ) : (
          <>
            Have an account?{' '}
            <button type="button" className="link" onClick={() => switchTo('signin')}>
              Sign in
            </button>
          </>
        )}
      </p>
      <p className="muted small">
        Accounts are optional. They keep your games in one history, let you sit down from any
        device, and let you join crews with friends.
      </p>
    </Modal>
  );
}

export function ResetDialog({ token, onClose }: { token: string; onClose: () => void }) {
  const [password, setPw] = useState('');
  const { busy, error, run } = useTask();
  return (
    <Modal title="Set a new password" onClose={onClose}>
      <form
        className="auth-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await run(() => resetPassword(token, password))) onClose();
        }}
      >
        <label className="field">
          <span>New password</span>
          <input
            type="password"
            value={password}
            minLength={8}
            required
            onChange={(e) => setPw(e.target.value)}
            autoComplete="new-password"
          />
          <small className="muted">At least 8 characters. You will be signed out elsewhere.</small>
        </label>
        <ErrorLine error={error} />
        <button type="submit" className="primary big" disabled={busy}>
          {busy ? 'Saving…' : 'Save and sign in'}
        </button>
      </form>
    </Modal>
  );
}

export function Notice({
  title,
  text,
  onClose,
}: {
  title: string;
  text: string;
  onClose: () => void;
}) {
  return (
    <Modal title={title} onClose={onClose}>
      <p>{text}</p>
      <button type="button" className="primary" onClick={onClose}>
        OK
      </button>
    </Modal>
  );
}

// ---- Crew invite ----

export function JoinCrewDialog({
  invite,
  onClose,
  onJoined,
}: {
  invite: string;
  onClose: () => void;
  onJoined: (id: string) => void;
}) {
  const { user, loaded } = useAccount();
  const [crew, setCrew] = useState<{ name: string; members: number } | null>(null);
  const [lookup, setLookup] = useState<string | null>(null);
  const { busy, error, run } = useTask();

  useEffect(() => {
    crewByInvite(invite).then(setCrew, (e: unknown) => setLookup(message(e)));
  }, [invite]);

  if (lookup) return <Notice title="Crew invite" text={lookup} onClose={onClose} />;
  if (!crew || !loaded) return null;
  const intro = (
    <p>
      Sign in or create an account to join <strong>{crew.name}</strong>.
    </p>
  );
  if (!user) return <SignInDialog onClose={onClose} onDone={() => undefined} intro={intro} />;
  return (
    <Modal title={`Join ${crew.name}?`} onClose={onClose}>
      <p>
        {crew.members} {crew.members === 1 ? 'member' : 'members'}. A crew keeps a shared
        leaderboard of the games its members play together.
      </p>
      <ErrorLine error={error} />
      <div className="row">
        <button
          type="button"
          className="primary"
          disabled={busy}
          onClick={async () => {
            let id = '';
            if (await run(async () => (id = (await joinCrew(invite)).id))) onJoined(id);
          }}
        >
          Join crew
        </button>
        <button type="button" onClick={onClose}>
          Not now
        </button>
      </div>
    </Modal>
  );
}

// ---- Profile page ----

export function ProfilePage({
  onHome,
  onCrew,
  onRoom,
}: {
  onHome: () => void;
  onCrew: (id: string) => void;
  onRoom: (code: string) => void;
}) {
  const { user, loaded } = useAccount();
  const [signIn, setSignIn] = useState(false);

  if (!loaded) return <main className="setup-page" />;
  if (!user)
    return (
      <main className="setup-page">
        <TopBar onHome={onHome} title="Your profile" />
        <section className="card">
          <p>Sign in to see your profile, your crews and your game history.</p>
          <button type="button" className="primary" onClick={() => setSignIn(true)}>
            Sign in
          </button>
        </section>
        {signIn && <SignInDialog onClose={() => setSignIn(false)} />}
      </main>
    );

  return (
    <main className="setup-page">
      <TopBar onHome={onHome} title="Your profile" />
      <ProfileCard />
      <CrewsCard onCrew={onCrew} />
      <HistoryCard onRoom={onRoom} />
      <button
        type="button"
        className="ghost"
        onClick={async () => {
          await logOut().catch(() => undefined);
          onHome();
        }}
      >
        Sign out
      </button>
    </main>
  );
}

function TopBar({ onHome, title }: { onHome: () => void; title: string }) {
  return (
    <header className="page-top">
      <button type="button" className="ghost" onClick={onHome}>
        ← Home
      </button>
      <h1>{title}</h1>
    </header>
  );
}

function ProfileCard() {
  const { user } = useAccount();
  const [name, setName] = useState(user?.name ?? '');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [saved, setSaved] = useState<string | null>(null);
  const task = useTask();
  if (!user) return null;

  const done = (text: string) => {
    setSaved(text);
    setTimeout(() => setSaved(null), 2500);
  };

  return (
    <section className="card">
      <h2>Profile</h2>
      <div className="avatars" role="radiogroup" aria-label="Avatar">
        {AVATARS.map((a) => (
          <button
            key={a}
            type="button"
            role="radio"
            aria-checked={user.avatar === a}
            className={`avatar-pick${user.avatar === a ? ' on' : ''}`}
            onClick={() => task.run(() => updateProfile({ avatar: a }))}
          >
            {a}
          </button>
        ))}
      </div>
      <form
        className="row"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await task.run(() => updateProfile({ name }))) done('Name saved');
        }}
      >
        <label>
          Name <input value={name} maxLength={20} onChange={(e) => setName(e.target.value)} />
        </label>
        <button type="submit" disabled={task.busy || !name.trim() || name === user.name}>
          Save
        </button>
      </form>
      <p>
        {user.email ? (
          <>
            {user.email}{' '}
            {user.emailVerified ? (
              <span className="pill ok">confirmed</span>
            ) : (
              <>
                <span className="pill">not confirmed</span>
                <button
                  type="button"
                  className="link"
                  onClick={async () => {
                    if (await task.run(resendVerify)) done('Confirmation email sent');
                  }}
                >
                  Send the link again
                </button>
              </>
            )}
          </>
        ) : (
          <span className="muted">No email on this account.</span>
        )}
        {user.google && <span className="pill">Google</span>}
      </p>
      {user.email && (
        <form
          className="row wrap"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await task.run(() => setPassword(current, next))) {
              setCurrent('');
              setNext('');
              done('Password saved');
            }
          }}
        >
          {user.hasPassword && (
            <input
              type="password"
              placeholder="Current password"
              aria-label="Current password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
            />
          )}
          <input
            type="password"
            placeholder={user.hasPassword ? 'New password' : 'Set a password'}
            aria-label="New password"
            value={next}
            minLength={8}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
          />
          <button type="submit" disabled={task.busy || next.length < 8}>
            {user.hasPassword ? 'Change password' : 'Set password'}
          </button>
        </form>
      )}
      <ErrorLine error={task.error} />
      {saved && (
        <p className="ok-line" role="status">
          ✓ {saved}
        </p>
      )}
    </section>
  );
}

function CrewsCard({ onCrew }: { onCrew: (id: string) => void }) {
  const [crews, setCrews] = useState<CrewSummary[] | null>(null);
  const [name, setName] = useState('');
  const [link, setLink] = useState('');
  const task = useTask();

  useEffect(() => {
    myCrews().then(setCrews, (e: unknown) => task.setError(message(e)));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="card">
      <h2>Crews</h2>
      <p className="muted">
        A crew is your regular group. It keeps a leaderboard of the games its members play together.
      </p>
      {crews?.length ? (
        <ul className="crew-list">
          {crews.map((c) => (
            <li key={c.id}>
              <button type="button" className="link" onClick={() => onCrew(c.id)}>
                {c.name}
              </button>{' '}
              <span className="muted">
                {c.members} {c.members === 1 ? 'member' : 'members'}
              </span>
            </li>
          ))}
        </ul>
      ) : crews ? (
        <p>You are not in a crew yet.</p>
      ) : null}
      <form
        className="row"
        onSubmit={async (e) => {
          e.preventDefault();
          let id = '';
          if (await task.run(async () => (id = (await createCrew(name)).id))) onCrew(id);
        }}
      >
        <input
          value={name}
          maxLength={40}
          placeholder="New crew name"
          aria-label="New crew name"
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" disabled={task.busy || !name.trim()}>
          Start a crew
        </button>
      </form>
      <form
        className="row"
        onSubmit={async (e) => {
          e.preventDefault();
          const invite = link.trim().match(/crew=([A-Za-z0-9_-]+)/)?.[1] ?? link.trim();
          let id = '';
          if (await task.run(async () => (id = (await joinCrew(invite)).id))) onCrew(id);
        }}
      >
        <input
          value={link}
          placeholder="Invite link"
          aria-label="Crew invite link"
          onChange={(e) => setLink(e.target.value)}
        />
        <button type="submit" disabled={task.busy || !link.trim()}>
          Join
        </button>
      </form>
      <ErrorLine error={task.error} />
    </section>
  );
}

function HistoryCard({ onRoom }: { onRoom: (code: string) => void }) {
  const [games, setGames] = useState<HistoryGame[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    history().then(setGames, (e: unknown) => setError(message(e)));
  }, []);
  const finished = games?.filter((g) => g.ended !== null) ?? [];
  const wins = finished.filter((g) => g.players.find((p) => p.seat === g.seat)?.won).length;
  return (
    <section className="card">
      <h2>Your games</h2>
      {games && finished.length > 0 && (
        <p className="muted">
          {wins} {wins === 1 ? 'win' : 'wins'} in {finished.length} finished{' '}
          {finished.length === 1 ? 'game' : 'games'}.
        </p>
      )}
      <ErrorLine error={error} />
      {games?.length === 0 && (
        <p>No games yet. Online games you play while signed in show up here.</p>
      )}
      {games && games.length > 0 && <GameList games={games} mySeat onRoom={onRoom} />}
    </section>
  );
}

function GameList({
  games,
  mySeat,
  onRoom,
}: {
  games: HistoryGame[];
  mySeat?: boolean;
  onRoom?: (code: string) => void;
}) {
  return (
    <ul className="game-list">
      {games.map((g) => {
        const me = mySeat ? g.players.find((p) => p.seat === g.seat) : undefined;
        const winner = g.players.find((p) => p.won);
        return (
          <li key={g.id} className={me?.won ? 'won' : ''}>
            <div className="game-line">
              <strong>{when(g.started)}</strong>{' '}
              <span className="muted">{describeModules(g.modules)}</span>
              {g.ended === null ? (
                onRoom ? (
                  <button type="button" className="link" onClick={() => onRoom(g.room)}>
                    in progress, open
                  </button>
                ) : (
                  <span className="pill">in progress</span>
                )
              ) : me ? (
                <span className={`pill${me.won ? ' ok' : ''}`}>
                  {me.won ? '🏆 Won' : `${me.vp ?? 0} points`}
                </span>
              ) : null}
            </div>
            <div className="small">
              {g.players.map((p, i) => (
                <span key={p.seat}>
                  {i > 0 && ', '}
                  <span className={p === winner ? 'winner' : ''}>
                    {p.name}
                    {p.vp !== null ? ` ${p.vp}` : ''}
                  </span>
                </span>
              ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ---- Crew page ----

export function CrewPage({
  id,
  onHome,
  onProfile,
}: {
  id: string;
  onHome: () => void;
  onProfile: () => void;
}) {
  const { user, loaded } = useAccount();
  const [crew, setCrew] = useState<CrewDetail | null>(null);
  const [copied, setCopied] = useState(false);
  const task = useTask();

  useEffect(() => {
    if (!user) return;
    crewDetail(id).then(setCrew, (e: unknown) => task.setError(message(e)));
  }, [id, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!loaded) return <main className="setup-page" />;
  if (!user)
    return <ProfilePage onHome={onHome} onCrew={() => undefined} onRoom={() => undefined} />;

  const link = crew ? crewInviteLink(crew.invite) : '';
  return (
    <main className="setup-page">
      <header className="page-top">
        <button type="button" className="ghost" onClick={onProfile}>
          ← Profile
        </button>
        <h1>{crew?.name ?? 'Crew'}</h1>
      </header>
      <ErrorLine error={task.error} />
      {crew && (
        <>
          <section className="card">
            <h2>Leaderboard</h2>
            <p className="muted">Finished games where at least two crew members played.</p>
            <table className="leaderboard">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Player</th>
                  <th>Wins</th>
                  <th>Games</th>
                  <th>Win rate</th>
                </tr>
              </thead>
              <tbody>
                {crew.leaderboard.map((row, i) => {
                  const m = crew.members.find((x) => x.id === row.id);
                  return (
                    <tr key={row.id} className={row.id === user.id ? 'me' : ''}>
                      <td>{i + 1}</td>
                      <td>
                        {m?.avatar} {row.name}
                      </td>
                      <td>{row.wins}</td>
                      <td>{row.games}</td>
                      <td>{row.games ? `${Math.round((100 * row.wins) / row.games)}%` : '–'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          <section className="card">
            <h2>Invite friends</h2>
            <p className="muted">Anyone with this link can join after signing in.</p>
            <div className="row">
              <input readOnly value={link} aria-label="Crew invite link" className="grow" />
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(link).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  });
                }}
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
              {crew.owner === user.id && (
                <button
                  type="button"
                  className="ghost"
                  title="The old link stops working"
                  onClick={() =>
                    task.run(async () => {
                      const invite = await renewInvite(crew.id);
                      setCrew({ ...crew, invite });
                    })
                  }
                >
                  New link
                </button>
              )}
            </div>
          </section>

          <section className="card">
            <h2>Recent crew games</h2>
            {crew.games.length ? (
              <GameList games={crew.games} />
            ) : (
              <p>No crew games yet. Play an online game together while signed in.</p>
            )}
          </section>

          <button
            type="button"
            className="ghost danger"
            onClick={async () => {
              if (!window.confirm(`Leave ${crew.name}?`)) return;
              if (await task.run(() => leaveCrew(crew.id))) onProfile();
            }}
          >
            Leave crew
          </button>
        </>
      )}
    </main>
  );
}
