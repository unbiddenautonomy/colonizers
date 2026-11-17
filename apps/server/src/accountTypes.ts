import type { Action, GameConfig } from '@colonizers/engine';
import type { CareerStats } from '@colonizers/stats';

/**
 * Account data sent to the browser. The browser imports this file too, so
 * keep it free of Worker-only code.
 */

export interface PublicUser {
  id: string;
  name: string;
  avatar: string;
  email: string | null;
  emailVerified: boolean;
  hasPassword: boolean;
  google: boolean;
  created: number;
  /** Shown on the global leaderboard (on unless the player turns it off). */
  onLeaderboard: boolean;
  /** Listed in ADMIN_EMAILS (with a verified email or Google sign-in). */
  admin?: boolean;
}

export interface HistoryGame {
  id: string;
  room: string;
  modules: string[];
  started: number;
  ended: number | null;
  /** Map key, like "special:volcano". Null for games from before maps were saved. */
  map: string | null;
  /** Saved moves, so the game can be replayed. */
  replay: boolean;
  players: {
    seat: number;
    name: string;
    vp: number | null;
    won: boolean;
    userId: string | null;
    bot: string | null;
  }[];
  /** Your seat in it, when the list is for one person. */
  seat?: number | null;
}

export interface CrewSummary {
  id: string;
  name: string;
  invite: string;
  members: number;
  owner: boolean;
}

export interface CrewDetail {
  id: string;
  name: string;
  invite: string;
  owner: string;
  members: { id: string; name: string; avatar: string; joined: number }[];
  /** Wins and games among crew games: games with at least two members playing. */
  leaderboard: {
    id: string;
    name: string;
    games: number;
    wins: number;
    averageVp: number | null;
    achievements: number;
  }[];
  games: HistoryGame[];
}

/** One player's line on a leaderboard. */
export interface LeaderRow {
  rank: number;
  id: string;
  name: string;
  avatar: string;
  games: number;
  wins: number;
  averageVp: number | null;
}

/** Everyone's results in games that count: finished, with at least two signed-in players. */
export interface GlobalLeaderboard {
  rows: LeaderRow[];
  /** Your own line, even below the top rows; null when you have no counted games or are hidden. */
  you: LeaderRow | null;
  /** How many players are on the board in all. */
  players: number;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string; status: number };

export interface EarnedAchievement {
  id: string;
  gameId: string;
  at: number;
}

export interface MyStats {
  career: CareerStats;
  achievements: EarnedAchievement[];
}

/** Everything needed to step through a finished game in the browser. */
export interface Replay {
  id: string;
  room: string;
  map: string | null;
  config: GameConfig;
  actions: Action[];
}

/** Achievements a game just unlocked, by seat. */
export interface Unlocked {
  seat: number;
  ids: string[];
}

/** Site-wide choices an admin makes. A null look lets each player pick their own. */
export interface SiteSettings {
  look: string | null;
  board: string | null;
}
