import { useMemo, useState } from 'react';
import { mapName } from '../online/account.ts';
import {
  clearLocalGames,
  loadLocalGames,
  localCareer,
  localPlayers,
  type LocalGameRecord,
} from '../game/localStats.ts';
import { AchievementsCard, CareerCard } from './Account.tsx';

const pct = (wins: number, games: number) => (games ? `${Math.round((100 * wins) / games)}%` : '–');

const day = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/** Stats for games played on this device, kept in the browser, no account needed. */
export function LocalStatsPage({ onHome }: { onHome: () => void }) {
  const [games, setGames] = useState<LocalGameRecord[]>(loadLocalGames);
  const players = useMemo(() => localPlayers(games), [games]);
  const [pick, setPick] = useState<string | null>(null);
  const who = players.find((p) => p.name === pick)?.name ?? players[0]?.name ?? null;
  const mine = useMemo(() => (who ? localCareer(games, who) : null), [games, who]);
  const [clearing, setClearing] = useState(false);
  const recent = [...games].sort((a, b) => b.ended - a.ended).slice(0, 10);

  return (
    <main className="setup-page">
      <header className="page-top">
        <button type="button" className="ghost" onClick={onHome}>
          ← Home
        </button>
        <h1>Games on this device</h1>
      </header>

      {games.length === 0 ? (
        <section className="card">
          <p>
            No finished games here yet. Finish a game on this device and everyone&apos;s results
            show up here, no account needed.
          </p>
        </section>
      ) : (
        <>
          <section className="card">
            <h2>Players</h2>
            <p className="muted">
              Everyone who finished a game here, by name. Bots are left out. Pick a name to see
              their stats.
            </p>
            <table className="leaderboard">
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Wins</th>
                  <th>Games</th>
                  <th>Win rate</th>
                  <th title="Average points">Avg</th>
                </tr>
              </thead>
              <tbody>
                {players.map((p) => (
                  <tr key={p.name} className={p.name === who ? 'me' : ''}>
                    <td>
                      <button
                        type="button"
                        className="link"
                        aria-pressed={p.name === who}
                        onClick={() => setPick(p.name)}
                      >
                        {p.name}
                      </button>
                    </td>
                    <td>{p.wins}</td>
                    <td>{p.games}</td>
                    <td>{pct(p.wins, p.games)}</td>
                    <td>{p.averageVp ?? '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {who && mine && (
            <>
              <CareerCard career={mine.career} title={`${who}'s stats`} empty="" />
              <AchievementsCard earned={mine.achievements} />
            </>
          )}

          <section className="card">
            <h2>Recent games</h2>
            <ul className="game-list">
              {recent.map((g) => {
                const winner = g.seats.find((s) => s.won);
                return (
                  <li key={g.id}>
                    <strong>{mapName(g.map)}</strong>{' '}
                    <span className="muted">
                      {day(g.ended)} · {g.seats.length} players · {g.turns} turns
                    </span>
                    <br />
                    {g.seats
                      .slice()
                      .sort((a, b) => b.vp - a.vp)
                      .map((s) => (
                        <span key={s.seat} className={s === winner ? 'winner' : ''}>
                          {s.bot ? '🤖 ' : ''}
                          {s.name} {s.vp}
                        </span>
                      ))
                      .flatMap((el, i) => (i ? [', ', el] : [el]))}
                  </li>
                );
              })}
            </ul>
          </section>

          <div className="row">
            {clearing ? (
              <>
                <span>Forget every game on this device?</span>
                <button
                  type="button"
                  className="danger"
                  onClick={() => {
                    clearLocalGames();
                    setGames([]);
                    setClearing(false);
                  }}
                >
                  Yes, clear
                </button>
                <button type="button" className="ghost" onClick={() => setClearing(false)}>
                  Keep them
                </button>
              </>
            ) : (
              <button type="button" className="ghost danger" onClick={() => setClearing(true)}>
                Clear this device&apos;s stats
              </button>
            )}
          </div>
        </>
      )}
    </main>
  );
}
