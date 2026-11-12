import type { PlayedGame } from './achievements.ts';

export interface CareerStats {
  games: number;
  wins: number;
  /** Average points at the end of a game. */
  averageVp: number | null;
  bySeat: { seat: number; games: number; wins: number }[];
  byMap: { map: string; games: number; wins: number }[];
  /** The resource you collected most of. */
  favoriteResource: string | null;
  /** Cards the dice paid you, against what they should have on average. */
  diceLuck: { produced: number; expected: number } | null;
  records: {
    mostVp: number | null;
    fastestWin: number | null;
    longestRoad: number | null;
    mostKnights: number | null;
  };
}

const RESOURCES = ['brick', 'lumber', 'wool', 'grain', 'ore'];

function tally<K>(map: Map<K, { games: number; wins: number }>, key: K, won: boolean): void {
  const row = map.get(key) ?? { games: 0, wins: 0 };
  row.games++;
  if (won) row.wins++;
  map.set(key, row);
}

const best = (xs: (number | null | undefined)[], pick: (a: number, b: number) => number) => {
  const ok = xs.filter((x): x is number => typeof x === 'number');
  return ok.length ? ok.reduce(pick) : null;
};

/** Totals and records across finished games. */
export function careerStats(games: PlayedGame[]): CareerStats {
  const seats = new Map<number, { games: number; wins: number }>();
  const maps = new Map<string, { games: number; wins: number }>();
  const gained: Record<string, number> = {};
  let produced = 0;
  let expected = 0;
  let withStats = 0;
  for (const g of games) {
    tally(seats, g.seat, g.won);
    tally(maps, g.map, g.won);
    if (!g.stats) continue;
    withStats++;
    produced += g.stats.produced;
    expected += g.stats.expected;
    for (const r of RESOURCES) gained[r] = (gained[r] ?? 0) + (g.stats.gained[r] ?? 0);
  }
  const vps = games.map((g) => g.vp).filter((v): v is number => v !== null);
  const fav = Object.entries(gained).sort((a, b) => b[1] - a[1])[0];
  return {
    games: games.length,
    wins: games.filter((g) => g.won).length,
    averageVp: vps.length
      ? Math.round((vps.reduce((a, b) => a + b, 0) / vps.length) * 10) / 10
      : null,
    bySeat: [...seats.entries()]
      .map(([seat, r]) => ({ seat, ...r }))
      .sort((a, b) => a.seat - b.seat),
    byMap: [...maps.entries()]
      .map(([map, r]) => ({ map, ...r }))
      .sort((a, b) => b.games - a.games || a.map.localeCompare(b.map)),
    favoriteResource: fav && fav[1] > 0 ? fav[0] : null,
    diceLuck: withStats ? { produced, expected: Math.round(expected * 10) / 10 } : null,
    records: {
      mostVp: best(vps, Math.max),
      fastestWin: best(
        games.filter((g) => g.won).map((g) => g.turns),
        Math.min,
      ),
      longestRoad: best(
        games.map((g) => g.stats?.longestRoad),
        Math.max,
      ),
      mostKnights: best(
        games.map((g) => g.stats?.knights),
        Math.max,
      ),
    },
  };
}
