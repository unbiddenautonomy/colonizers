import type { RngState } from './rng.ts';
import type { CornerId, EdgeId, HexId } from './hex.ts';

/** Card counts, e.g. { brick: 1, lumber: 1 }. */
export type Cards = Record<string, number>;

export type Location =
  | { kind: 'corner'; id: CornerId }
  | { kind: 'edge'; id: EdgeId }
  | { kind: 'hex'; id: HexId }
  | { kind: 'supply' };

export interface Piece {
  id: string;
  type: string;
  /** Seat index of the owner, or null for neutral pieces like the robber. */
  owner: number | null;
  at: Location;
  /** Module-defined properties, e.g. a knight's level or whether it is active. */
  props: Record<string, unknown>;
  /** Turn number the piece was placed. */
  placedTurn: number;
}

export interface HexState {
  id: HexId;
  q: number;
  r: number;
  type: string;
  token?: number;
  /** Face down (fog of war). Hidden hexes are redacted in player views. */
  hidden?: boolean;
  props?: Record<string, unknown>;
}

export interface Harbor {
  edge: EdgeId;
  /** 'any' for a generic harbor, or a card type for a specific one. */
  resource: string;
  ratio: number;
}

/** A non-fungible card in a player's hand (development or progress card). */
export interface HeldCard {
  card: string;
  acquiredTurn: number;
}

export interface PlayerState {
  seat: number;
  name: string;
  hand: Cards;
  held: Record<string, HeldCard[]>;
  /** Cards that have been played face up (e.g. knights for Largest Army). */
  played: Record<string, number>;
  data: Record<string, unknown>;
}

export interface Phase {
  id: string;
  [key: string]: unknown;
}

export interface TurnState {
  /** Increases by one every turn, starting at 0 during setup. */
  number: number;
  /** Seat whose turn it is. */
  player: number;
  /** Full rounds completed after setup. */
  round: number;
}

export interface GameState {
  schema: 1;
  modules: string[];
  settings: Record<string, unknown>;
  seed: string;
  rng: RngState;
  players: PlayerState[];
  bank: Cards;
  /** Card decks in draw order (hidden). */
  decks: Record<string, string[]>;
  hexes: Record<HexId, HexState>;
  harbors: Harbor[];
  pieces: Record<string, Piece>;
  nextPieceId: number;
  turn: TurnState;
  phase: Phase;
  /** Per-module state, keyed by module id. */
  data: Record<string, Record<string, unknown>>;
  /** Number of actions applied so far. */
  seq: number;
  winner: number | null;
  /**
   * The seat this state was built for, when it came from one player's view
   * (see `stateFromView`). Other players' cards are hidden in it, so it can
   * answer what the viewer may do but not what everyone else may.
   */
  viewer?: number;
}

export interface Action {
  type: string;
  /** Seat of the player taking the action. */
  player: number;
  [key: string]: unknown;
}

/**
 * Something that happened, for logs, animations and replays. Events seen only
 * by some players (like which card was stolen) list them in `visibleTo`.
 */
export interface GameEvent {
  type: string;
  visibleTo?: number[];
  /** What everyone else sees instead, if anything. */
  redacted?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface MapSpec {
  hexes: {
    q: number;
    r: number;
    type: string;
    token?: number;
    hidden?: boolean;
    props?: Record<string, unknown>;
  }[];
  harbors?: Harbor[];
  /** Neutral pieces to place at the start, e.g. the robber on the desert. */
  pieces?: { type: string; at: Location; props?: Record<string, unknown> }[];
}
