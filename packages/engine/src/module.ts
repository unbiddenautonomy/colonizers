import type { Ctx } from './context.ts';
import type { Action, Cards, HexState, Location, Piece } from './types.ts';

export interface HexTypeDef {
  /** 'land' hexes take settlements and roads; 'sea' hexes take ships. */
  terrain: 'land' | 'sea';
  /** Card produced when the hex's number is rolled. */
  produces?: string;
  /** Can the robber be placed here? Defaults to true for land. */
  robber?: boolean;
}

export interface CardTypeDef {
  /** Resource, commodity, etc. Bots and the UI group cards by category. */
  category: string;
  /** Counts toward the hand limit on a 7. */
  countsForHandLimit: boolean;
  /** How many the bank holds for a given number of players. */
  bank: (playerCount: number) => number;
}

export interface DeckDef {
  /** Card counts for a given number of players. Shuffled at game start. */
  cards: (playerCount: number) => Cards;
}

export interface PieceTypeDef {
  on: 'corner' | 'edge' | 'hex';
  /** Pieces each player has in their supply, if limited. */
  perPlayer?: (playerCount: number) => number;
  /** Buildings block the distance rule and break opponents' routes. */
  building?: boolean;
  /** Not a building, but still breaks opponents' routes (e.g. knights). */
  blocksRoutes?: boolean;
  /** Pieces that make up a trade route ('land' for roads, 'sea' for ships). */
  route?: string;
  /** Victory points this piece is worth to its owner. */
  vp?: number;
  /** How many of the hex's cards this piece collects on production. */
  production?: number;
}

export interface ActionDef<A extends Action = Action> {
  /** Phases in which this action can be taken. Omit to allow any phase. */
  phases?: string[];
  /**
   * Returns a reason the action is illegal, or null if it is legal. Must not
   * change the state.
   */
  check(ctx: Ctx, action: A): string | null;
  /** Applies a legal action. */
  apply(ctx: Ctx, action: A): void;
  /**
   * Lists candidate actions for a player (they are filtered with `check`).
   * Used by bots, tests and UI hints. Large spaces can be sampled.
   */
  enumerate?(ctx: Ctx, player: number): Action[];
}

/** Hooks are called in module order. Reducers pass a value through every module. */
export interface Hooks {
  /** Game created and pieces placed; set up module data. */
  init(ctx: Ctx): void;
  /** After any action is applied. */
  afterAction(ctx: Ctx, action: Action): void;
  /** A new turn has begun for ctx.state.turn.player. */
  turnStarted(ctx: Ctx): void;
  /** The active player's turn is ending. */
  turnEnded(ctx: Ctx): void;
  /** A piece was placed, moved or replaced. */
  piecePlaced(ctx: Ctx, piece: Piece, previous: Location | null): void;
  /** A hex was revealed or changed. */
  hexChanged(ctx: Ctx, hex: HexState): void;
}

export interface Reducers {
  /** Victory points for a player. */
  vp(ctx: Ctx, player: number, value: number): number;
  /** Max cards a player may hold when a 7 is rolled before discarding. */
  handLimit(ctx: Ctx, player: number, value: number): number;
  /** Cost of a buildable item ('road', 'settlement', 'city', 'devCard', ...). */
  cost(ctx: Ctx, item: string, player: number, value: Cards): Cards;
  /** Cards a piece collects from a hex on production. */
  hexYield(ctx: Ctx, hex: HexState, piece: Piece, value: Cards): Cards;
  /** Best bank trade ratio for giving a card type. */
  tradeRatio(ctx: Ctx, player: number, card: string, value: number): number;
  /**
   * Bank trade ratio for one exact swap. Starts from tradeRatio for the card
   * given; lets a module offer a better rate only for some cards received.
   */
  swapRatio(ctx: Ctx, player: number, give: string, get: string, value: number): number;
  /** Victory points needed to win. */
  vpTarget(ctx: Ctx, value: number): number;
  /** How much one route piece counts toward the longest route (normally 1). */
  routeWeight(ctx: Ctx, piece: Piece, value: number): number;
  /** How many pieces of a type a player has in all (from the piece type's perPlayer). */
  supply(ctx: Ctx, player: number, type: string, value: number): number;
}

export interface DiceResult {
  /** Named dice, e.g. { white1: 3, white2: 4 } or { red: 2, yellow: 5, event: 'ship' }. */
  dice: Record<string, number | string>;
  /** Sum of the number dice that drive production. */
  total: number;
}

export interface GameModule {
  id: string;
  name: string;
  /** Modules that must also be in the game. They are loaded first. */
  requires?: string[];
  /** Modules that can't be in the same game. */
  conflicts?: string[];
  /** Default settings this module adds (players can override). */
  settings?: Record<string, unknown>;
  hexTypes?: Record<string, HexTypeDef>;
  cardTypes?: Record<string, CardTypeDef>;
  decks?: Record<string, DeckDef>;
  pieceTypes?: Record<string, PieceTypeDef>;
  costs?: Record<string, Cards>;
  actions?: Record<string, ActionDef>;
  /**
   * Replace an action defined by an earlier module. The wrapper receives the
   * previous definition, so it can call through and add behaviour.
   */
  wrapActions?: Record<string, (previous: ActionDef) => ActionDef>;
  /**
   * Like wrapActions, but skipped when no module in the game defines the
   * action, so an options module can cover expansions it doesn't require.
   */
  wrapActionsIfPresent?: Record<string, (previous: ActionDef) => ActionDef>;
  hooks?: Partial<Hooks>;
  reducers?: Partial<Reducers>;
  /** Replaces the dice. The last module that provides dice wins. */
  dice?: (ctx: Ctx) => DiceResult;
  /** Hides secret module data from players in their view. */
  redact?: (data: Record<string, unknown>, viewer: number | null) => Record<string, unknown>;
}

export interface Registry {
  modules: GameModule[];
  hexTypes: Record<string, HexTypeDef>;
  cardTypes: Record<string, CardTypeDef>;
  decks: Record<string, DeckDef>;
  pieceTypes: Record<string, PieceTypeDef>;
  costs: Record<string, Cards>;
  actions: Record<string, ActionDef>;
  settings: Record<string, unknown>;
  dice: ((ctx: Ctx) => DiceResult) | null;
}

/** Orders modules so dependencies load first, and checks conflicts. */
export function resolveModules(
  wanted: readonly string[],
  available: ReadonlyMap<string, GameModule>,
): GameModule[] {
  const ordered: GameModule[] = [];
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (id: string, from: string | null) => {
    const mark = state.get(id);
    if (mark === 'done') return;
    if (mark === 'visiting') throw new Error(`Module dependency cycle at "${id}"`);
    const mod = available.get(id);
    if (!mod) {
      throw new Error(
        from ? `Module "${from}" needs "${id}", which is not available` : `Unknown module "${id}"`,
      );
    }
    state.set(id, 'visiting');
    for (const dep of mod.requires ?? []) visit(dep, id);
    state.set(id, 'done');
    ordered.push(mod);
  };
  for (const id of wanted) visit(id, null);

  const ids = new Set(ordered.map((m) => m.id));
  for (const mod of ordered) {
    for (const c of mod.conflicts ?? []) {
      if (ids.has(c)) throw new Error(`Module "${mod.id}" can't be combined with "${c}"`);
    }
  }
  return ordered;
}

function mergeUnique<T>(
  target: Record<string, T>,
  source: Record<string, T> | undefined,
  what: string,
  mod: string,
) {
  for (const [k, v] of Object.entries(source ?? {})) {
    if (k in target) throw new Error(`Module "${mod}" redefines ${what} "${k}"`);
    target[k] = v;
  }
}

export function buildRegistry(modules: GameModule[]): Registry {
  const reg: Registry = {
    modules,
    hexTypes: {},
    cardTypes: {},
    decks: {},
    pieceTypes: {},
    costs: {},
    actions: {},
    settings: {},
    dice: null,
  };
  for (const m of modules) {
    mergeUnique(reg.hexTypes, m.hexTypes, 'hex type', m.id);
    mergeUnique(reg.cardTypes, m.cardTypes, 'card type', m.id);
    mergeUnique(reg.decks, m.decks, 'deck', m.id);
    mergeUnique(reg.pieceTypes, m.pieceTypes, 'piece type', m.id);
    mergeUnique(reg.actions, m.actions, 'action', m.id);
    // Costs and settings may be overridden by later modules on purpose.
    Object.assign(reg.costs, m.costs);
    Object.assign(reg.settings, m.settings);
    for (const [type, wrap] of Object.entries(m.wrapActions ?? {})) {
      const prev = reg.actions[type];
      if (!prev) throw new Error(`Module "${m.id}" wraps unknown action "${type}"`);
      reg.actions[type] = wrap(prev);
    }
    for (const [type, wrap] of Object.entries(m.wrapActionsIfPresent ?? {})) {
      const prev = reg.actions[type];
      if (prev) reg.actions[type] = wrap(prev);
    }
    if (m.dice) reg.dice = m.dice;
  }
  return reg;
}
