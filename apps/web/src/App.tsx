import { useEffect, useState } from 'react';
import { clearSavedGame, loadSavedGame, type SavedGame } from './game/useLocalGame.ts';
import { LocalGame } from './screens/Game.tsx';
import { NewGame } from './screens/NewGame.tsx';
import { OnlineRoom } from './screens/OnlineRoom.tsx';
import { Rulebook } from './ui/Rulebook.tsx';

function roomFromPath(path: string): string | null {
  const m = path.match(/^\/r\/([a-z0-9-]{1,40})\/?$/i);
  return m?.[1]?.toLowerCase() ?? null;
}

export function App() {
  const [path, setPath] = useState(() => window.location.pathname);
  const [game, setGame] = useState<SavedGame | null>(null);
  const [saved, setSaved] = useState(() => loadSavedGame());
  const [rules, setRules] = useState(false);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const go = (to: string) => {
    window.history.pushState(null, '', to);
    setPath(to);
  };

  const room = roomFromPath(path);
  if (room) return <OnlineRoom key={room} code={room} onHome={() => go('/')} />;

  if (game) {
    return (
      <LocalGame
        key={game.config.seed}
        saved={game}
        onQuit={() => {
          setSaved(loadSavedGame());
          setGame(null);
        }}
      />
    );
  }
  return (
    <>
      <NewGame
        canResume={!!saved}
        onResume={() => saved && setGame(saved)}
        onStart={(g) => {
          clearSavedGame();
          setGame(g);
        }}
        onRules={() => setRules(true)}
        onOnline={(code) => go(`/r/${code}`)}
      />
      {rules && <Rulebook state={null} viewer={null} onClose={() => setRules(false)} />}
    </>
  );
}
