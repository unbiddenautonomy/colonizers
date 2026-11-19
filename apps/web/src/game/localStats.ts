import { Ctx, type GameState } from '@colonizers/engine';
import {
  analyzeGame,
  careerStats,
  earnedAchievements,
  type CareerStats,
  type PlayedGame,
  type SeatStats,
} from '@colonizers/stats';
import { library } from './library.ts';
import type { SavedGame } from './useLocalGame.ts';

/** One finished game played on this device, kept in the browser. */
export interface LocalGameRecord {
  /** The game's seed, which is unique per game. */
  id: string;
  ended: number;
  /** Map key, like "random:classic" or "scenario:new-shores". */
  map: string;
  modules: string[];
  turns: number;
  seats: {
    seat: number;
    name: string;
    /** Bot level, or null for a person. */
    bot: string | null;
    vp: number;
    won: boolean;
    stats: SeatStats | null;
  }[];
}

/** One person's line in the device's table. */
export interface LocalPlayer {
  name: string;
  games: number;
  wins: number;
  averageVp: number | null;
  last: number;
}

const KEY = 'colonizers.localStats';
/** Enough for years of game nights; the oldest drop off after this. */
const MAX_GAMES = 300;

export function loadLocalGames(): LocalGameRecord[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? (list as LocalGameRecord[]) : [];
  } catch {
    return [];
  }
}

function store(games: LocalGameRecord[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(games.slice(-MAX_GAMES)));
  } catch {
    // Storage blocked or full; stats are a nice-to-have.
  }
}

export function clearLocalGames(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}

/**
 * Works out a finished game's stats and keeps them. A game is only kept once,
 * so resuming a finished save doesn't count it twice.
 */
export function recordLocalGame(saved: SavedGame, state: GameState): LocalGameRecord | null {
  if (state.winner === null) return null;
  const games = loadLocalGames();
  if (games.some((g) => g.id === saved.config.seed)) return null;
  let seats: SeatStats[] = [];
  let turns = state.turn.number;
  try {
    const a = analyzeGame(library, saved.config, saved.actions);
    seats = a.seats;
    turns = a.turns;
  } catch {
    // A save from an older rules version: keep the result without the details.
  }
  const ctx = new Ctx(state, library.registry(state.modules));
  const record: LocalGameRecord = {
    id: saved.config.seed,
    ended: Date.now(),
    map: saved.mapKey ?? 'unknown',
    modules: state.modules,
    turns,
    seats: state.players.map((p) => ({
      seat: p.seat,
      name: p.name,
      bot: saved.bots?.[p.seat]?.level ?? null,
      vp: ctx.vp(p.seat),
      won: state.winner === p.seat,
      stats: seats[p.seat] ?? null,
    })),
  };
  store([...games, record]);
  return record;
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The people who played here (bots left out), most games first. */
export function localPlayers(games: LocalGameRecord[]): LocalPlayer[] {
  const byName = new Map<string, LocalPlayer & { vpTotal: number }>();
  for (const g of games)
    for (const s of g.seats) {
      if (s.bot) continue;
      const key = s.name.trim().toLowerCase();
      const row = byName.get(key) ?? {
        name: s.name.trim(),
        games: 0,
        wins: 0,
        averageVp: null,
        last: 0,
        vpTotal: 0,
      };
      row.games++;
      if (s.won) row.wins++;
      row.vpTotal += s.vp;
      row.last = Math.max(row.last, g.ended);
      byName.set(key, row);
    }
  return [...byName.values()]
    .map(({ vpTotal, ...row }) => ({
      ...row,
      averageVp: row.games ? Math.round((vpTotal / row.games) * 10) / 10 : null,
    }))
    .sort((a, b) => b.games - a.games || b.wins - a.wins || a.name.localeCompare(b.name));
}

/** One person's games, in the shape the stats package works with, oldest first. */
export function playedGames(games: LocalGameRecord[], name: string): PlayedGame[] {
  const out: PlayedGame[] = [];
  for (const g of [...games].sort((a, b) => a.ended - b.ended)) {
    const s = g.seats.find((x) => !x.bot && same(x.name, name));
    if (!s) continue;
    out.push({
      gameId: g.id,
      ended: g.ended,
      map: g.map,
      modules: g.modules,
      players: g.seats.length,
      seat: s.seat,
      won: s.won,
      vp: s.vp,
      turns: g.turns,
      stats: s.stats,
      botLevels: g.seats.filter((x) => x.bot && x.seat !== s.seat).map((x) => x.bot!),
    });
  }
  return out;
}

export function localCareer(
  games: LocalGameRecord[],
  name: string,
): { career: CareerStats; achievements: { id: string; at: number }[] } {
  const played = playedGames(games, name);
  return {
    career: careerStats(played),
    achievements: earnedAchievements(played).map((a) => ({ id: a.id, at: a.game.ended })),
  };
}
