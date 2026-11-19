import { Ctx } from './context.ts';
import { RuleError } from './errors.ts';
import { hexId, type HexId } from './hex.ts';
import { buildRegistry, resolveModules, type GameModule, type Registry } from './module.ts';
import { Rng } from './rng.ts';
import {
  HIDDEN_CARD,
  type Action,
  type GameEvent,
  type GameState,
  type MapSpec,
  type PlayerState,
} from './types.ts';

export { HIDDEN_CARD };

export interface GameConfig {
  seed: string;
  players: string[];
  /** Module ids, e.g. ['base'] or ['base', 'seafarers']. Dependencies are added automatically. */
  modules: string[];
  map: MapSpec;
  settings?: Record<string, unknown>;
  /** Keep the given seat order instead of shuffling. */
  fixedSeats?: boolean;
}

/** All modules the engine knows about. Module packages register themselves here. */
export class ModuleLibrary {
  private readonly byId = new Map<string, GameModule>();
  private readonly registries = new Map<string, Registry>();

  constructor(modules: GameModule[] = []) {
    modules.forEach((m) => this.add(m));
  }

  add(module: GameModule): this {
    if (this.byId.has(module.id)) throw new Error(`Module "${module.id}" is already registered`);
    this.byId.set(module.id, module);
    this.registries.clear();
    return this;
  }

  get(id: string): GameModule | undefined {
    return this.byId.get(id);
  }

  /** Returns the merged registry for a set of modules (cached). */
  registry(ids: readonly string[]): Registry {
    const key = ids.join(',');
    let reg = this.registries.get(key);
    if (!reg) {
      reg = buildRegistry(resolveModules(ids, this.byId));
      this.registries.set(key, reg);
    }
    return reg;
  }

  // ---- Running games ----

  createGame(config: GameConfig): { state: GameState; events: GameEvent[] } {
    if (config.players.length < 1) throw new Error('A game needs at least one player');
    const resolved = resolveModules(config.modules, this.byId).map((m) => m.id);
    const registry = this.registry(resolved);
    const rng = Rng.fromSeed(config.seed);
    const names = config.fixedSeats ? [...config.players] : rng.shuffle(config.players);
    const n = names.length;

    const players: PlayerState[] = names.map((name, seat) => ({
      seat,
      name,
      hand: {},
      held: {},
      played: {},
      data: {},
    }));
    const bank: Record<string, number> = {};
    for (const [card, def] of Object.entries(registry.cardTypes)) bank[card] = def.bank(n);
    const decks: Record<string, string[]> = {};
    for (const [id, def] of Object.entries(registry.decks)) {
      const cards = Object.entries(def.cards(n)).flatMap(([c, k]) => Array<string>(k).fill(c));
      decks[id] = rng.shuffle(cards);
    }
    const hexes: GameState['hexes'] = {};
    for (const h of config.map.hexes) {
      if (!registry.hexTypes[h.type]) throw new Error(`Map uses unknown hex type "${h.type}"`);
      const id = hexId(h.q, h.r);
      hexes[id] = {
        id,
        q: h.q,
        r: h.r,
        type: h.type,
        ...(h.token !== undefined && { token: h.token }),
        ...(h.hidden && { hidden: true }),
        ...(h.props && { props: structuredClone(h.props) }),
      };
    }

    const state: GameState = {
      schema: 1,
      modules: resolved,
      settings: { ...registry.settings, ...config.settings },
      seed: config.seed,
      rng: rng.getState(),
      players,
      bank,
      decks,
      hexes,
      harbors: [...(config.map.harbors ?? [])],
      pieces: {},
      nextPieceId: 1,
      turn: { number: 0, player: 0, round: 0 },
      phase: { id: 'start' },
      data: {},
      seq: 0,
      winner: null,
    };
    const ctx = new Ctx(state, registry);
    for (const p of config.map.pieces ?? []) ctx.place(p.type, null, p.at, p.props ?? {});
    ctx.hook('init');
    ctx.commit();
    return { state, events: [{ type: 'gameCreated', seats: names }, ...ctx.events] };
  }

  /** Returns the reason an action is illegal, or null if it is legal. */
  check(state: GameState, action: Action): string | null {
    const registry = this.registry(state.modules);
    return checkWith(new Ctx(state, registry), registry, action);
  }

  /**
   * Applies an action and returns the new state and the events it caused. The
   * input state is never changed. Throws RuleError for illegal actions.
   */
  apply(state: GameState, action: Action): { state: GameState; events: GameEvent[] } {
    const registry = this.registry(state.modules);
    const next = structuredClone(state);
    const ctx = new Ctx(next, registry);
    const reason = checkWith(ctx, registry, action);
    if (reason) throw new RuleError(reason);
    const def = registry.actions[action.type];
    def?.apply(ctx, action);
    ctx.hook('afterAction', action);
    if (next.winner === null) ctx.checkWin();
    next.seq += 1;
    ctx.commit();
    return { state: next, events: ctx.events };
  }

  /** Lists every legal action for a player right now. */
  legalActions(state: GameState, player: number): Action[] {
    if (state.winner !== null) return [];
    const registry = this.registry(state.modules);
    const ctx = new Ctx(state, registry);
    const out: Action[] = [];
    for (const def of Object.values(registry.actions)) {
      if (def.phases && !def.phases.includes(state.phase.id)) continue;
      for (const a of def.enumerate?.(ctx, player) ?? []) {
        if (checkWith(ctx, registry, a) === null) out.push(a);
      }
    }
    return out;
  }

  /** Whether a seat has a legal move right now. Cheaper than `legalActions`. */
  canAct(state: GameState, player: number): boolean {
    return new Ctx(state, this.registry(state.modules)).canAct(player);
  }

  /** Seats that can act right now (several players can act during discards or trades). */
  waitingOn(state: GameState): number[] {
    return state.players.map((p) => p.seat).filter((seat) => this.canAct(state, seat));
  }

  /**
   * Nobody can move and nobody has won. A game only gets here through a bug,
   * so the room and the game screen check after every move and play the
   * `skipStep` rescue, which leaves the dead-ended step.
   */
  stuck(state: GameState): boolean {
    return new Ctx(state, this.registry(state.modules)).stuck;
  }

  /**
   * What one player is allowed to see. Other players' hands become counts,
   * decks become sizes, hidden hexes lose their terrain, and the RNG is removed.
   * Pass null for a spectator.
   */
  view(state: GameState, viewer: number | null): GameView {
    const registry = this.registry(state.modules);
    const players = state.players.map((p) => {
      const handCount = Object.values(p.hand).reduce((s, n) => s + n, 0);
      const heldCount = Object.fromEntries(Object.entries(p.held).map(([d, cs]) => [d, cs.length]));
      if (p.seat === viewer || state.winner !== null)
        return { ...structuredClone(p), handCount, heldCount };
      return { ...structuredClone(p), hand: {}, held: {}, handCount, heldCount };
    });
    const hexes: GameState['hexes'] = {};
    for (const [id, h] of Object.entries(state.hexes) as [HexId, GameState['hexes'][HexId]][]) {
      hexes[id] = h.hidden
        ? { id: h.id, q: h.q, r: h.r, type: 'hidden', hidden: true }
        : structuredClone(h);
    }
    const data: GameState['data'] = {};
    for (const m of registry.modules) {
      const d = state.data[m.id];
      if (d) data[m.id] = m.redact ? m.redact(structuredClone(d), viewer) : structuredClone(d);
    }
    return {
      ...structuredClone({ ...state, rng: undefined, decks: undefined }),
      viewer,
      players,
      hexes,
      data,
      decks: Object.fromEntries(Object.entries(state.decks).map(([k, v]) => [k, v.length])),
    } as GameView;
  }

  /** Events as one player may see them. */
  viewEvents(events: GameEvent[], viewer: number | null): GameEvent[] {
    return events.flatMap((e) => {
      if (!e.visibleTo || (viewer !== null && e.visibleTo.includes(viewer))) {
        const { visibleTo: _v, redacted: _r, ...rest } = e;
        return [rest as GameEvent];
      }
      return e.redacted ? [{ type: e.type, ...e.redacted } as GameEvent] : [];
    });
  }

  /** Replays a game from its config and action list. */
  replay(config: GameConfig, actions: Action[]): GameState {
    let { state } = this.createGame(config);
    for (const a of actions) state = this.apply(state, a).state;
    return state;
  }
}

export type GameView = Omit<GameState, 'rng' | 'decks' | 'players'> & {
  viewer: number | null;
  decks: Record<string, number>;
  players: (PlayerState & { handCount: number; heldCount: Record<string, number> })[];
};

function checkWith(ctx: Ctx, registry: Registry, action: Action): string | null {
  if (ctx.state.winner !== null) return 'The game is over';
  const def = registry.actions[action.type];
  if (!def) return `Unknown action "${action.type}"`;
  if (!Number.isInteger(action.player) || !ctx.state.players[action.player])
    return 'Unknown player';
  if (def.phases && !def.phases.includes(ctx.state.phase.id)) {
    return `Can't ${action.type} during ${ctx.state.phase.id}`;
  }
  try {
    return def.check(ctx, action);
  } catch (e) {
    if (e instanceof RuleError) return e.message;
    throw e;
  }
}

/**
 * Turns a player's view back into a full GameState shape so the same rules
 * code (legal moves, costs, scores) can run in the browser. Cards the viewer
 * can't see become placeholder "hidden" cards, so counts stay right. The
 * result can't be passed to `apply`, because it has no RNG and no real decks.
 */
export function stateFromView(view: GameView): GameState {
  const { viewer, ...rest } = view;
  const open = view.winner !== null;
  const players: PlayerState[] = view.players.map(({ handCount, heldCount, ...p }) => {
    if (p.seat === viewer || open) return p;
    return {
      ...p,
      hand: handCount > 0 ? { [HIDDEN_CARD]: handCount } : {},
      held: Object.fromEntries(
        Object.entries(heldCount).map(([deck, n]) => [
          deck,
          Array.from({ length: n }, () => ({ card: HIDDEN_CARD, acquiredTurn: -1 })),
        ]),
      ),
    };
  });
  const decks = Object.fromEntries(
    Object.entries(view.decks).map(([id, n]) => [id, Array<string>(n).fill(HIDDEN_CARD)]),
  );
  return { ...rest, viewer, players, decks, rng: [0, 0, 0, 0] } as GameState;
}
