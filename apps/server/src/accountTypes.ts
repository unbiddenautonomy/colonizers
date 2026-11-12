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
}

export interface HistoryGame {
  id: string;
  room: string;
  modules: string[];
  started: number;
  ended: number | null;
  players: { seat: number; name: string; vp: number | null; won: boolean; userId: string | null }[];
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
  leaderboard: { id: string; name: string; games: number; wins: number }[];
  games: HistoryGame[];
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string; status: number };
