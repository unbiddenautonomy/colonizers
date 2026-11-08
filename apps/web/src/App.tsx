import { useState } from 'react';
import { clearSavedGame, loadSavedGame, type SavedGame } from './game/useLocalGame.ts';
import { Game } from './screens/Game.tsx';
import { NewGame } from './screens/NewGame.tsx';
import { Rulebook } from './ui/Rulebook.tsx';

export function App() {
  const [game, setGame] = useState<SavedGame | null>(null);
  const [saved, setSaved] = useState(() => loadSavedGame());
  const [rules, setRules] = useState(false);

  if (game) {
    return (
      <Game
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
      />
      {rules && <Rulebook state={null} viewer={null} onClose={() => setRules(false)} />}
    </>
  );
}
