import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { nameOf } from '@colonizers/rulebook';
import { ACHIEVEMENTS, type CareerStats } from '@colonizers/stats';
import {
  AVATARS,
  createCrew,
  crewByInvite,
  crewDetail,
  crewInviteLink,
  describeModules,
  forgotPassword,
  globalLeaderboard,
  googleSignInUrl,
  history,
  joinCrew,
  mapName,
  myStats,
  leaveCrew,
  logIn,
  deleteAccount,
  logOut,
  myCrews,
  renewInvite,
  resendVerify,
  resetPassword,
  saveSite,
  loadSite,
  setPassword,
  signUp,
  updateProfile,
  useAccount,
  type CrewDetail,
  type CrewSummary,
  type GlobalLeaderboard,
  type HistoryGame,
  type LeaderRow,
  type MyStats,
} from '../online/account.ts';
import { Modal } from '../ui/Modal.tsx';
import { Confirm } from '../ui/Confirm.tsx';
import { LOOKS } from '../theme/looks.tsx';
import { NotifyButton } from '../ui/NotifyButton.tsx';

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
  onReplay,
}: {
  onHome: () => void;
  onCrew: (id: string) => void;
  onRoom: (code: string) => void;
  onReplay: (gameId: string) => void;
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
      <SiteLookCard />
      <StatsCards />
      <LeaderboardCard />
      <CrewsCard onCrew={onCrew} />
      <HistoryCard onRoom={onRoom} onReplay={onReplay} />
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
      <DeleteAccountCard onDone={onHome} />
    </main>
  );
}

/** Closing an account for good. Nothing brings it back, so say what goes and what stays. */
function DeleteAccountCard({ onDone }: { onDone: () => void }) {
  const [asking, setAsking] = useState(false);
  const task = useTask();
  return (
    <section className="card danger-card">
      <h2>Delete your account</h2>
      <p className="muted">
        Your name, email, crews, achievements and stats go for good, and you leave every
        leaderboard. The games you played stay in the other players&rsquo; histories, under the name
        that sat in your seat, but they no longer point at you.
      </p>
      <ErrorLine error={task.error} />
      <button
        type="button"
        className="ghost danger"
        disabled={task.busy}
        onClick={() => setAsking(true)}
      >
        Delete account
      </button>
      {asking && (
        <Confirm
          title="Delete your account?"
          confirmLabel="Delete it"
          danger
          onCancel={() => setAsking(false)}
          onConfirm={() => {
            setAsking(false);
            void task.run(deleteAccount).then((ok) => ok && onDone());
          }}
        >
          This cannot be undone: nothing brings the account back, and signing up again starts from
          nothing.
        </Confirm>
      )}
    </section>
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

/** For admins: one look for everyone, or let each player choose. */
function SiteLookCard() {
  const { user } = useAccount();
  const [look, setLook] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(false);
  const task = useTask();
  useEffect(() => {
    if (!user?.admin) return;
    void loadSite().then((s) => {
      setLook(s.look);
      setLoaded(true);
    });
  }, [user?.admin]);
  if (!user?.admin) return null;
  const pick = (id: string | null) =>
    void task
      .run(async () => {
        // Board skins per look come later; until then the look leaves the board to each player.
        const s = await saveSite({ look: id, board: null });
        setLook(s.look);
      })
      .then((ok) => {
        setSaved(ok);
        if (ok) setTimeout(() => setSaved(false), 2500);
      });
  return (
    <section className="card">
      <h2>Site look</h2>
      <p className="muted">
        Let each player pick their own look and board, or set one for everyone. A set look hides the
        pickers and comes with its own board skin.
      </p>
      <label>
        Look for everyone{' '}
        <select
          value={look ?? ''}
          disabled={!loaded || task.busy}
          onChange={(e) => pick(e.target.value || null)}
        >
          <option value="">Players choose their own</option>
          {LOOKS.map((l) => (
            <option key={l.id} value={l.id}>
              {l.familyName} · {l.name}
            </option>
          ))}
        </select>
      </label>
      {saved && <p className="muted">Saved for everyone.</p>}
      {task.error && <p className="error">{task.error}</p>}
    </section>
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
      <NotifyButton />
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
      <p className="muted">
        The look, board and dice you pick follow you to every device you sign in on.
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

/** Everyone who plays here, ranked by wins in games with at least two signed-in players. */
function LeaderboardCard() {
  const { user } = useAccount();
  const [board, setBoard] = useState<GlobalLeaderboard | null>(null);
  const task = useTask();
  const listed = user?.onLeaderboard ?? false;

  useEffect(() => {
    globalLeaderboard().then(setBoard, (e: unknown) => task.setError(message(e)));
  }, [listed]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!user) return null;
  const youBelow = board?.you && !board.rows.some((r) => r.id === board.you?.id);
  const line = (row: LeaderRow) => (
    <tr key={row.id} className={row.id === user.id ? 'me' : ''}>
      <td>{row.rank}</td>
      <td>
        {row.avatar} {row.name}
      </td>
      <td>{row.wins}</td>
      <td>{row.games}</td>
      <td>{pct(row.wins, row.games)}</td>
      <td>{row.averageVp ?? '–'}</td>
    </tr>
  );
  return (
    <section className="card">
      <h2>Leaderboard</h2>
      <p className="muted">
        Players who chose to be listed. Only finished games with at least two signed-in players
        count, so games against bots alone don&apos;t.
      </p>
      {board === null ? (
        !task.error && <p className="muted">Loading…</p>
      ) : board.rows.length === 0 ? (
        <p className="muted">No games count yet. Play a game with a friend who is signed in.</p>
      ) : (
        <table className="leaderboard">
          <thead>
            <tr>
              <th>#</th>
              <th>Player</th>
              <th>Wins</th>
              <th>Games</th>
              <th>Win rate</th>
              <th title="Average points">Avg</th>
            </tr>
          </thead>
          <tbody>
            {board.rows.map(line)}
            {youBelow && board.you && (
              <>
                <tr className="gap" aria-hidden="true">
                  <td colSpan={6}>⋯</td>
                </tr>
                {line(board.you)}
              </>
            )}
          </tbody>
        </table>
      )}
      {board && board.players > board.rows.length && (
        <p className="muted">
          Top {board.rows.length} of {board.players} players.
        </p>
      )}
      <label className="toggle">
        <input
          type="checkbox"
          checked={listed}
          disabled={task.busy}
          onChange={(e) => {
            const on = e.target.checked;
            void task.run(() => updateProfile({ onLeaderboard: on }));
          }}
        />{' '}
        Show me on the leaderboard
      </label>
      <ErrorLine error={task.error} />
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

function pct(wins: number, games: number): string {
  return games ? `${Math.round((100 * wins) / games)}%` : '–';
}

/** Career stats and achievements. */
function StatsCards() {
  const [stats, setStats] = useState<MyStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    myStats().then(setStats, (e: unknown) => setError(message(e)));
  }, []);
  if (error)
    return (
      <section className="card">
        <ErrorLine error={error} />
      </section>
    );
  if (!stats) return null;
  return (
    <>
      <CareerCard
        career={stats.career}
        title="Your stats"
        empty="Finish an online game while signed in to start your stats."
      />
      <AchievementsCard earned={stats.achievements} />
    </>
  );
}

/** Totals, records and win rates by seat and map. */
export function CareerCard({
  career: c,
  title,
  empty,
}: {
  career: CareerStats;
  title: ReactNode;
  empty: string;
}) {
  const luck = c.diceLuck;
  const fav = c.favoriteResource ? nameOf(c.favoriteResource) : null;
  return (
    <section className="card">
      <h2>{title}</h2>
      {c.games === 0 ? (
        <p>{empty}</p>
      ) : (
        <>
          <div className="stat-tiles">
            <div className="stat">
              <strong>{c.games}</strong>
              <span>game{c.games === 1 ? '' : 's'}</span>
            </div>
            <div className="stat">
              <strong>{c.wins}</strong>
              <span>win{c.wins === 1 ? '' : 's'}</span>
            </div>
            <div className="stat">
              <strong>{pct(c.wins, c.games)}</strong>
              <span>win rate</span>
            </div>
            <div className="stat">
              <strong>{c.averageVp ?? '–'}</strong>
              <span>average points</span>
            </div>
          </div>
          <ul className="stat-lines">
            {fav && (
              <li>
                Favorite resource: {fav.icon} {fav.name}
              </li>
            )}
            {luck && luck.expected > 0 && (
              <li>
                Dice luck: the dice paid you {luck.produced} cards against {luck.expected} on
                average ({luck.produced >= luck.expected ? '+' : ''}
                {Math.round((100 * (luck.produced - luck.expected)) / luck.expected)}%).
              </li>
            )}
            {c.records.mostVp !== null && <li>Most points in a game: {c.records.mostVp}</li>}
            {c.records.fastestWin !== null && (
              <li>
                Fastest win: {c.records.fastestWin} turn{c.records.fastestWin === 1 ? '' : 's'}
              </li>
            )}
            {c.records.longestRoad !== null && <li>Longest road: {c.records.longestRoad}</li>}
            {!!c.records.mostKnights && <li>Most knights in a game: {c.records.mostKnights}</li>}
          </ul>
          <div className="stat-tables">
            <table className="leaderboard">
              <thead>
                <tr>
                  <th>Seat</th>
                  <th>Games</th>
                  <th>Win rate</th>
                </tr>
              </thead>
              <tbody>
                {c.bySeat.map((r) => (
                  <tr key={r.seat}>
                    <td>{r.seat + 1}</td>
                    <td>{r.games}</td>
                    <td>{pct(r.wins, r.games)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <table className="leaderboard">
              <thead>
                <tr>
                  <th>Map</th>
                  <th>Games</th>
                  <th>Win rate</th>
                </tr>
              </thead>
              <tbody>
                {c.byMap.map((r) => (
                  <tr key={r.map}>
                    <td>{mapName(r.map)}</td>
                    <td>{r.games}</td>
                    <td>{pct(r.wins, r.games)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

/** Every achievement, with the ones earned lit up. */
export function AchievementsCard({ earned: list }: { earned: { id: string; at: number }[] }) {
  const earned = new Map(list.map((a) => [a.id, a]));
  return (
    <section className="card">
      <h2>
        Achievements{' '}
        <small className="muted">
          {earned.size} of {ACHIEVEMENTS.length}
        </small>
      </h2>
      <ul className="achievements">
        {ACHIEVEMENTS.map((a) => {
          const got = earned.get(a.id);
          return (
            <li key={a.id} className={got ? 'got' : 'locked'}>
              <span className="achievement-icon" aria-hidden="true">
                {a.icon}
              </span>
              <span>
                <strong>{a.name}</strong>
                <small>{a.text}</small>
                {got && <small className="muted">Unlocked {when(got.at)}</small>}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function HistoryCard({
  onRoom,
  onReplay,
}: {
  onRoom: (code: string) => void;
  onReplay: (gameId: string) => void;
}) {
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
      {games && games.length > 0 && (
        <GameList games={games} mySeat onRoom={onRoom} onReplay={onReplay} />
      )}
    </section>
  );
}

function GameList({
  games,
  mySeat,
  onRoom,
  onReplay,
}: {
  games: HistoryGame[];
  mySeat?: boolean;
  onRoom?: (code: string) => void;
  onReplay?: (gameId: string) => void;
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
              <span className="muted">
                {g.map ? `${mapName(g.map)}, ` : ''}
                {describeModules(g.modules)}
              </span>
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
                    {p.bot ? ' 🤖' : ''}
                    {p.vp !== null ? ` ${p.vp}` : ''}
                  </span>
                </span>
              ))}
              {g.replay && onReplay && (
                <>
                  {' · '}
                  <button type="button" className="link" onClick={() => onReplay(g.id)}>
                    ▶ Watch replay
                  </button>
                </>
              )}
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
  onReplay,
}: {
  id: string;
  onHome: () => void;
  onProfile: () => void;
  onReplay: (gameId: string) => void;
}) {
  const { user, loaded } = useAccount();
  const [crew, setCrew] = useState<CrewDetail | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [copied, setCopied] = useState(false);
  /** A new invite quietly swaps the text in the box, so say what just happened. */
  const [renewed, setRenewed] = useState(false);
  const task = useTask();

  useEffect(() => {
    if (!user) return;
    crewDetail(id).then(setCrew, (e: unknown) => task.setError(message(e)));
  }, [id, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!loaded) return <main className="setup-page" />;
  if (!user)
    return (
      <>
        <p className="muted sign-in-note">Sign in to see this crew.</p>
        <ProfilePage
          onHome={onHome}
          onCrew={() => undefined}
          onRoom={() => undefined}
          onReplay={onReplay}
        />
      </>
    );
  // A link to a crew that is gone, or one this player is not in.
  if (task.error === 'Unknown crew')
    return (
      <main className="setup-page narrow">
        <h1>Crew not found</h1>
        <p className="muted">
          This link may be old, the crew may have been deleted, or you may not be a member of it.
        </p>
        <div className="row">
          <button type="button" className="primary" onClick={onProfile}>
            Your crews
          </button>
          <button type="button" className="ghost" onClick={onHome}>
            Home
          </button>
        </div>
      </main>
    );

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
                  <th title="Average points">Avg</th>
                  <th title="Achievements">🏅</th>
                </tr>
              </thead>
              <tbody>
                {crew.leaderboard.map((row) => {
                  const m = crew.members.find((x) => x.id === row.id);
                  return (
                    <tr key={row.id} className={row.id === user.id ? 'me' : ''}>
                      <td>{row.rank}</td>
                      <td>
                        {m?.avatar} {row.name}
                      </td>
                      <td>{row.wins}</td>
                      <td>{row.games}</td>
                      <td>{pct(row.wins, row.games)}</td>
                      <td>{row.averageVp ?? '–'}</td>
                      <td>{row.achievements}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          <section className="card">
            <h2>Invite friends</h2>
            <p className="muted">Anyone with this link can join after signing in.</p>
            {renewed && (
              <p className="ok-line" role="status">
                ✓ A new link is ready. The old one has stopped working, so send this one instead.
              </p>
            )}
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
                    void task.run(async () => {
                      const invite = await renewInvite(crew.id);
                      setCrew({ ...crew, invite });
                      setCopied(false);
                      setRenewed(true);
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
              <GameList games={crew.games} onReplay={onReplay} />
            ) : (
              <p>No crew games yet. Play an online game together while signed in.</p>
            )}
          </section>

          <button type="button" className="ghost danger" onClick={() => setLeaving(true)}>
            Leave crew
          </button>

          {leaving && (
            <Confirm
              title={`Leave ${crew.name}?`}
              confirmLabel="Leave crew"
              cancelLabel="Stay"
              danger
              onConfirm={async () => {
                setLeaving(false);
                if (await task.run(() => leaveCrew(crew.id))) onProfile();
              }}
              onCancel={() => setLeaving(false)}
            >
              Your games stay in your own history. You need a new invite to come back.
            </Confirm>
          )}
        </>
      )}
    </main>
  );
}
