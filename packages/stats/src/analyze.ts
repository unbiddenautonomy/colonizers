import {
  Ctx,
  type Action,
  type GameConfig,
  type GameEvent,
  type GameState,
  type ModuleLibrary,
} from '@colonizers/engine';

/** Bump when the analysis changes, so stored games are worked out again. */
export const STATS_VERSION = 1;

/** What one seat did in one game. */
export interface SeatStats {
  seat: number;
  vp: number;
  won: boolean;
  /** Cards that came into the hand, from any source. */
  gained: Record<string, number>;
  /** Cards from dice rolls. */
  produced: number;
  /** Cards the dice should have paid on average, given the buildings at the time. */
  expected: number;
  /** Pieces built, by type (free roads included). */
  built: Record<string, number>;
  devCards: number;
  knights: number;
  /** Most cards taken with one Monopoly. */
  monopolyBest: number;
  longestRoad: number;
  /** Island bonuses (Seafarers). */
  islands: number;
  /** Times named defender against the barbarians (Cities & Knights). */
  defender: number;
  trades: number;
  steals: number;
  robbed: number;
  discarded: number;
  turns: number;
}

export interface GameAnalysis {
  version: number;
  winner: number | null;
  turns: number;
  /** How often each total came up, by total (index 2 to 12). */
  dice: number[];
  seats: SeatStats[];
}

const CHANCE: Record<number, number> = {
  2: 1,
  3: 2,
  4: 3,
  5: 4,
  6: 5,
  8: 5,
  9: 4,
  10: 3,
  11: 2,
  12: 1,
};

function emptySeat(seat: number): SeatStats {
  return {
    seat,
    vp: 0,
    won: false,
    gained: {},
    produced: 0,
    expected: 0,
    built: {},
    devCards: 0,
    knights: 0,
    monopolyBest: 0,
    longestRoad: 0,
    islands: 0,
    defender: 0,
    trades: 0,
    steals: 0,
    robbed: 0,
    discarded: 0,
    turns: 0,
  };
}

/** Cards each seat should get from one roll, on average, with the board as it is. */
function expectedYield(state: GameState, ctx: Ctx): number[] {
  const out = state.players.map(() => 0);
  const robber = Object.values(state.pieces).find((p) => p.type === 'robber')?.at;
  for (const hex of Object.values(state.hexes)) {
    const chance = hex.token ? (CHANCE[hex.token] ?? 0) / 36 : 0;
    if (!chance || hex.hidden) continue;
    if (robber?.kind === 'hex' && robber.id === hex.id) continue;
    const def = ctx.registry.hexTypes[hex.type];
    if (!def?.produces) continue;
    for (const corner of ctx.geometry.hexCorners.get(hex.id) ?? []) {
      for (const piece of ctx.piecesAt({ kind: 'corner', id: corner })) {
        if (piece.owner === null) continue;
        const n = ctx.registry.pieceTypes[piece.type]?.production ?? 0;
        out[piece.owner] = (out[piece.owner] ?? 0) + n * chance;
      }
    }
  }
  return out;
}

function count(events: GameEvent[], seats: SeatStats[], dice: number[]): void {
  const s = (seat: unknown) => (typeof seat === 'number' ? seats[seat] : undefined);
  for (const e of events) {
    switch (e.type) {
      case 'rolled':
        if (typeof e.total === 'number') dice[e.total] = (dice[e.total] ?? 0) + 1;
        break;
      case 'production':
        for (const [seat, cards] of Object.entries(
          e.received as Record<string, Record<string, number>>,
        )) {
          const row = s(Number(seat));
          if (row) row.produced += Object.values(cards).reduce((a, b) => a + b, 0);
        }
        break;
      case 'built': {
        const row = s(e.player);
        if (row) row.built[e.piece as string] = (row.built[e.piece as string] ?? 0) + 1;
        break;
      }
      case 'boughtDevCard':
        if (s(e.player)) s(e.player)!.devCards++;
        break;
      case 'playedDevCard':
        if (e.card === 'knight' && s(e.player)) s(e.player)!.knights++;
        break;
      case 'monopoly': {
        const row = s(e.player);
        if (row) row.monopolyBest = Math.max(row.monopolyBest, Number(e.taken) || 0);
        break;
      }
      case 'award':
        if (e.award === 'longestRoad' && s(e.to))
          s(e.to)!.longestRoad = Math.max(s(e.to)!.longestRoad, Number(e.length) || 0);
        break;
      case 'islandBonus':
        if (s(e.player)) s(e.player)!.islands++;
        break;
      case 'defender':
        if (s(e.player)) s(e.player)!.defender++;
        break;
      case 'traded':
        if (s(e.from)) s(e.from)!.trades++;
        if (s(e.to)) s(e.to)!.trades++;
        break;
      case 'bankTrade':
        if (s(e.player)) s(e.player)!.trades++;
        break;
      case 'stole':
        if (s(e.thief)) s(e.thief)!.steals++;
        if (s(e.victim)) s(e.victim)!.robbed++;
        break;
      case 'discarded': {
        const row = s(e.player);
        if (row)
          row.discarded += Object.values((e.cards ?? {}) as Record<string, number>).reduce(
            (a, b) => a + b,
            0,
          );
        break;
      }
      case 'turnStarted':
        if (s(e.player)) s(e.player)!.turns++;
        break;
    }
  }
}

/**
 * Replays a game from its config and moves and works out what every seat did.
 * Runs on the server with the full state, so hidden cards count too.
 */
export function analyzeGame(
  lib: ModuleLibrary,
  config: GameConfig,
  actions: Action[],
): GameAnalysis {
  const created = lib.createGame(config);
  let state = created.state;
  const registry = lib.registry(state.modules);
  const seats = state.players.map((p) => emptySeat(p.seat));
  const dice: number[] = Array.from({ length: 13 }, () => 0);
  const gain = (before: GameState, after: GameState) => {
    for (const p of after.players) {
      const old = before.players[p.seat]?.hand ?? {};
      const row = seats[p.seat]!;
      for (const [card, n] of Object.entries(p.hand)) {
        const d = n - (old[card] ?? 0);
        if (d > 0) row.gained[card] = (row.gained[card] ?? 0) + d;
      }
    }
  };
  count(created.events, seats, dice);
  for (const action of actions) {
    if (action.type === 'roll') {
      const exp = expectedYield(state, new Ctx(state, registry));
      exp.forEach((v, seat) => (seats[seat]!.expected += v));
    }
    const r = lib.apply(state, action);
    gain(state, r.state);
    count(r.events, seats, dice);
    state = r.state;
  }
  const ctx = new Ctx(state, registry);
  for (const row of seats) {
    row.vp = ctx.vp(row.seat);
    row.won = state.winner === row.seat;
    row.longestRoad = Math.max(row.longestRoad, ctx.longestRoute(row.seat));
    row.expected = Math.round(row.expected * 10) / 10;
  }
  return { version: STATS_VERSION, winner: state.winner, turns: state.turn.number, dice, seats };
}
