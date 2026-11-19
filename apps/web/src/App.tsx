import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { clearSavedGame, loadSavedGame, type SavedGame } from './game/useLocalGame.ts';
import { afterGoogle, loadAccount, loadSite, verifyEmail } from './online/account.ts';
import {
  AccountBar,
  CrewPage,
  JoinCrewDialog,
  Notice,
  ProfilePage,
  ResetDialog,
  SignInDialog,
} from './screens/Account.tsx';
import { NewGame } from './screens/NewGame.tsx';

/**
 * The screens behind the home page are fetched when they are opened, not
 * before the first visit draws. The board, every expansion's rules and screens,
 * the rulebook and the map editor are most of the app's weight, and someone
 * arriving at the home page needs none of it yet.
 */
const LocalGame = lazy(() => import('./screens/Game.tsx').then((m) => ({ default: m.LocalGame })));
const MapEditor = lazy(() =>
  import('./screens/MapEditor.tsx').then((m) => ({ default: m.MapEditor })),
);
const OnlineRoom = lazy(() =>
  import('./screens/OnlineRoom.tsx').then((m) => ({ default: m.OnlineRoom })),
);
const ReplayPage = lazy(() =>
  import('./screens/Replay.tsx').then((m) => ({ default: m.ReplayPage })),
);
const Rulebook = lazy(() => import('./ui/Rulebook.tsx').then((m) => ({ default: m.Rulebook })));
const LocalStatsPage = lazy(() =>
  import('./screens/LocalStats.tsx').then((m) => ({ default: m.LocalStatsPage })),
);

/** What a screen shows while it is being fetched. */
function Loading() {
  return (
    <main className="setup-page narrow" aria-busy="true">
      <p className="muted">Loading…</p>
    </main>
  );
}

const page = (node: ReactNode) => <Suspense fallback={<Loading />}>{node}</Suspense>;

function roomFromPath(path: string): string | null {
  const m = path.match(/^\/r\/([a-z0-9-]{1,40})\/?$/i);
  return m?.[1]?.toLowerCase() ?? null;
}

type Popup =
  | { kind: 'signin' }
  | { kind: 'reset'; token: string }
  | { kind: 'crew'; invite: string }
  | { kind: 'notice'; title: string; text: string };

const SIGNIN_ERRORS: Record<string, string> = {
  'google-off': 'Google sign-in is not set up on this server yet. Use email instead.',
  'google-failed': 'Google sign-in did not finish. Try again, or use email.',
};

/** Reads one-time links (?verify, ?reset, ?crew, ?signin) and clears them from the address bar. */
function takeLinkParams(): Record<'verify' | 'reset' | 'crew' | 'signin', string | undefined> {
  const params = new URLSearchParams(window.location.search);
  const out = {
    verify: params.get('verify') ?? undefined,
    reset: params.get('reset') ?? undefined,
    crew: params.get('crew') ?? undefined,
    signin: params.get('signin') ?? params.get('signedin') ?? undefined,
  };
  if (Object.values(out).some(Boolean)) {
    for (const k of ['verify', 'reset', 'crew', 'signin', 'signedin']) params.delete(k);
    const rest = params.toString();
    window.history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : ''));
  }
  return out;
}

let linkCache: ReturnType<typeof takeLinkParams> | null = null;
/** Read once per page load, so React's double render in development sees the same links. */
function linkParams() {
  return (linkCache ??= takeLinkParams());
}

function firstPopup(): Popup | null {
  const link = linkParams();
  if (link.reset) return { kind: 'reset', token: link.reset };
  if (link.crew) return { kind: 'crew', invite: link.crew };
  if (link.signin && SIGNIN_ERRORS[link.signin])
    return { kind: 'notice', title: 'Sign in', text: SIGNIN_ERRORS[link.signin]! };
  return null;
}

export function App() {
  const [path, setPath] = useState(() => window.location.pathname);
  const [game, setGame] = useState<SavedGame | null>(null);
  const [saved, setSaved] = useState(() => loadSavedGame());
  const [rules, setRules] = useState(false);
  const [popup, setPopup] = useState<Popup | null>(firstPopup);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    const link = linkParams();
    if (link.signin === 'google') void afterGoogle();
    else void loadAccount();
    void loadSite();
    if (link.verify)
      verifyEmail(link.verify).then(
        () =>
          setPopup({
            kind: 'notice',
            title: 'Email confirmed',
            text: 'Thanks, your email is confirmed.',
          }),
        (e: unknown) =>
          setPopup({
            kind: 'notice',
            title: 'Email link',
            text: e instanceof Error ? e.message : 'That link did not work.',
          }),
      );
  }, []);

  const go = (to: string) => {
    window.history.pushState(null, '', to);
    setPath(to);
  };

  const popups = popup && (
    <>
      {popup.kind === 'signin' && <SignInDialog onClose={() => setPopup(null)} />}
      {popup.kind === 'reset' && <ResetDialog token={popup.token} onClose={() => setPopup(null)} />}
      {popup.kind === 'crew' && (
        <JoinCrewDialog
          invite={popup.invite}
          onClose={() => setPopup(null)}
          onJoined={(id) => {
            setPopup(null);
            go(`/crew/${id}`);
          }}
        />
      )}
      {popup.kind === 'notice' && (
        <Notice title={popup.title} text={popup.text} onClose={() => setPopup(null)} />
      )}
    </>
  );

  const room = roomFromPath(path);
  if (room)
    return (
      <>
        {page(<OnlineRoom key={room} code={room} onHome={() => go('/')} />)}
        {popups}
      </>
    );

  if (path === '/me')
    return (
      <>
        <ProfilePage
          onHome={() => go('/')}
          onCrew={(id) => go(`/crew/${id}`)}
          onRoom={(code) => go(`/r/${code}`)}
          onReplay={(id) => go(`/replay/${id}`)}
        />
        {popups}
      </>
    );

  if (path === '/stats')
    return (
      <>
        {page(<LocalStatsPage onHome={() => go('/')} />)}
        {popups}
      </>
    );

  const crew = path.match(/^\/crew\/([a-z0-9-]{1,40})\/?$/)?.[1];
  if (crew)
    return (
      <>
        <CrewPage
          key={crew}
          id={crew}
          onHome={() => go('/')}
          onProfile={() => go('/me')}
          onReplay={(id) => go(`/replay/${id}`)}
        />
        {popups}
      </>
    );

  const replay = path.match(/^\/replay\/([a-z0-9-]{1,60})\/?$/)?.[1];
  if (replay)
    return (
      <>
        {page(<ReplayPage key={replay} id={replay} onBack={() => go('/me')} />)}
        {popups}
      </>
    );

  const editor = path.match(/^\/editor(?:\/([a-z0-9-]{1,40}))?\/?$/);
  if (editor)
    return (
      <>
        {page(<MapEditor key={path} editId={editor[1] ?? null} onHome={() => go('/')} />)}
        {popups}
      </>
    );

  if (game) {
    return page(
      <LocalGame
        key={game.config.seed}
        saved={game}
        onQuit={() => {
          setSaved(loadSavedGame());
          setGame(null);
        }}
      />,
    );
  }
  return (
    <>
      <NewGame
        account={
          <AccountBar onSignIn={() => setPopup({ kind: 'signin' })} onProfile={() => go('/me')} />
        }
        canResume={!!saved}
        onResume={() => saved && setGame(saved)}
        onStart={(g) => {
          clearSavedGame();
          setGame(g);
        }}
        onRules={() => setRules(true)}
        onOnline={(code) => go(`/r/${code}`)}
        onEditor={(id) => go(id ? `/editor/${id}` : '/editor')}
        onStats={() => go('/stats')}
      />
      {rules && page(<Rulebook state={null} viewer={null} onClose={() => setRules(false)} />)}
      {popups}
    </>
  );
}
