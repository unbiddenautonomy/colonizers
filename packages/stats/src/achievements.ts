import { SPECIAL_MAPS } from '@colonizers/maps';
import type { SeatStats } from './analyze.ts';

/** One finished game from one player's side, as stored with their account. */
export interface PlayedGame {
  gameId: string;
  ended: number;
  /** Map key, like "random:balanced", "preset:starter", "scenario:new-shores", "special:volcano". */
  map: string;
  modules: string[];
  players: number;
  seat: number;
  won: boolean;
  vp: number | null;
  /** Turns the game took, when known. */
  turns: number | null;
  /** Null for games without saved moves. */
  stats: SeatStats | null;
  /** Bot level of every other seat that was a bot. */
  botLevels: string[];
}

export interface Achievement {
  id: string;
  name: string;
  text: string;
  icon: string;
  /** Finds the game that unlocked it, given games oldest first. */
  unlockedBy(games: PlayedGame[]): PlayedGame | null;
}

const inGame =
  (test: (g: PlayedGame, s: SeatStats | null) => boolean) =>
  (games: PlayedGame[]): PlayedGame | null =>
    games.find((g) => test(g, g.stats)) ?? null;

/** Unlocks at the game where a running total first reaches `target`. */
const total =
  (target: number, add: (g: PlayedGame) => number) =>
  (games: PlayedGame[]): PlayedGame | null => {
    let sum = 0;
    for (const g of games) {
      sum += add(g);
      if (sum >= target) return g;
    }
    return null;
  };

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first-win',
    name: 'First win',
    text: 'Win a game.',
    icon: '🏆',
    unlockedBy: inGame((g) => g.won),
  },
  {
    id: 'regular',
    name: 'Regular',
    text: 'Finish 10 games.',
    icon: '🎖️',
    unlockedBy: total(10, () => 1),
  },
  {
    id: 'hat-trick',
    name: 'Hat trick',
    text: 'Win 3 games in a row.',
    icon: '🎩',
    unlockedBy(games) {
      let run = 0;
      for (const g of games) {
        run = g.won ? run + 1 : 0;
        if (run >= 3) return g;
      }
      return null;
    },
  },
  {
    id: 'last-seat',
    name: 'Last to go, first to finish',
    text: 'Win from the last seat.',
    icon: '🪑',
    unlockedBy: inGame((g) => g.won && g.players > 1 && g.seat === g.players - 1),
  },
  {
    id: 'no-ore',
    name: 'Who needs ore?',
    text: 'Win without ever holding ore.',
    icon: '⛏️',
    unlockedBy: inGame((g, s) => g.won && !!s && !s.gained.ore),
  },
  {
    id: 'long-road',
    name: 'The long way round',
    text: 'Have a road 12 or more long.',
    icon: '🛣️',
    unlockedBy: inGame((_, s) => (s?.longestRoad ?? 0) >= 12),
  },
  {
    id: 'standing-army',
    name: 'Standing army',
    text: 'Play 5 knight cards in one game.',
    icon: '⚔️',
    unlockedBy: inGame((_, s) => (s?.knights ?? 0) >= 5),
  },
  {
    id: 'cornered',
    name: 'Cornered the market',
    text: 'Take 6 or more cards with one Monopoly.',
    icon: '💰',
    unlockedBy: inGame((_, s) => (s?.monopolyBest ?? 0) >= 6),
  },
  {
    id: 'island-hopper',
    name: 'Island hopper',
    text: 'Settle 4 new islands in one game.',
    icon: '🏝️',
    unlockedBy: inGame((_, s) => (s?.islands ?? 0) >= 4),
  },
  {
    id: 'shield',
    name: 'Shield of the island',
    text: 'Be the top defender against the barbarians 3 times.',
    icon: '🛡️',
    unlockedBy: total(3, (g) => g.stats?.defender ?? 0),
  },
  {
    id: 'beat-hard',
    name: 'Better than the machine',
    text: 'Win a game against a Hard bot.',
    icon: '🤖',
    unlockedBy: inGame((g) => g.won && g.botLevels.includes('hard')),
  },
  {
    id: 'against-the-odds',
    name: 'Against the odds',
    text: 'Win while the dice paid you at least 20% less than they should have.',
    icon: '🎲',
    unlockedBy: inGame(
      (g, s) => g.won && !!s && s.expected >= 10 && s.produced <= s.expected * 0.8,
    ),
  },
  {
    id: 'full-house',
    name: 'Full house',
    text: 'Finish a game with 7 or 8 players.',
    icon: '👥',
    unlockedBy: inGame((g) => g.players >= 7),
  },
  {
    id: 'world-traveller',
    name: 'World traveller',
    text: 'Win on every special map.',
    icon: '🗺️',
    unlockedBy(games) {
      const left = new Set(SPECIAL_MAPS.map((m) => `special:${m.id}`));
      for (const g of games) {
        if (g.won) left.delete(g.map);
        if (!left.size) return g;
      }
      return null;
    },
  },
];

export function achievementById(id: string): Achievement | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}

/** Every achievement these games earn, with the game that earned it. Games oldest first. */
export function earnedAchievements(games: PlayedGame[]): { id: string; game: PlayedGame }[] {
  const out: { id: string; game: PlayedGame }[] = [];
  for (const a of ACHIEVEMENTS) {
    const g = a.unlockedBy(games);
    if (g) out.push({ id: a.id, game: g });
  }
  return out;
}
