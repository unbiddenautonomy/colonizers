import { buildGeometry, type Geometry } from './board.ts';
import { RuleError } from './errors.ts';
import type { CornerId, EdgeId, HexId } from './hex.ts';
import { plainDice, type DiceResult, type Hooks, type Reducers, type Registry } from './module.ts';
import { Rng } from './rng.ts';
import type {
  Action,
  Cards,
  GameEvent,
  GameState,
  Location,
  Phase,
  Piece,
  PlayerState,
} from './types.ts';

type HookArgs<K extends keyof Hooks> = Hooks[K] extends (ctx: Ctx, ...args: infer A) => void
  ? A
  : never;
type ReducerArgs<K extends keyof Reducers> = Reducers[K] extends (
  ctx: Ctx,
  ...args: infer A
) => unknown
  ? A
  : never;
type ReducerValue<K extends keyof Reducers> = ReturnType<Reducers[K]>;

function sameLocation(a: Location, b: Location): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'supply' || b.kind === 'supply') return true;
  return a.id === b.id;
}

/**
 * Everything a module needs while applying an action: the (mutable, already
 * copied) state, the registry, the RNG, event output and rule helpers.
 */
export class Ctx {
  readonly events: GameEvent[] = [];
  readonly rng: Rng;
  readonly geometry: Geometry;

  constructor(
    readonly state: GameState,
    readonly registry: Registry,
  ) {
    this.rng = Rng.fromState(state.rng);
    this.geometry = buildGeometry(Object.keys(state.hexes) as HexId[]);
  }

  /** Writes the RNG position back into the state. */
  commit(): void {
    this.state.rng = this.rng.getState();
  }

  // ---- Events, hooks, reducers ----

  emit(event: GameEvent): void {
    this.events.push(event);
  }

  hook<K extends keyof Hooks>(name: K, ...args: HookArgs<K>): void {
    for (const m of this.registry.modules) {
      const fn = m.hooks?.[name] as ((ctx: Ctx, ...a: HookArgs<K>) => void) | undefined;
      fn?.(this, ...args);
    }
  }

  reduce<K extends keyof Reducers>(name: K, ...args: ReducerArgs<K>): ReducerValue<K> {
    const value = args[args.length - 1] as ReducerValue<K>;
    const rest = args.slice(0, -1);
    let v = value;
    for (const m of this.registry.modules) {
      const fn = m.reducers?.[name] as ((ctx: Ctx, ...a: unknown[]) => ReducerValue<K>) | undefined;
      if (fn) v = fn(this, ...rest, v);
    }
    return v;
  }

  setting<T>(key: string): T {
    return (this.state.settings[key] ?? this.registry.settings[key]) as T;
  }

  data<T extends Record<string, unknown>>(moduleId: string): T {
    this.state.data[moduleId] ??= {};
    return this.state.data[moduleId] as T;
  }

  // ---- Players and turn ----

  get active(): number {
    return this.state.turn.player;
  }

  player(seat: number): PlayerState {
    const p = this.state.players[seat];
    if (!p) throw new RuleError(`No player in seat ${seat}`);
    return p;
  }

  get playerCount(): number {
    return this.state.players.length;
  }

  setPhase(phase: Phase): void {
    const from = this.state.phase.id;
    this.state.phase = phase;
    if (from !== phase.id) this.emit({ type: 'phase', from, to: phase.id });
  }

  /**
   * Whether a seat has a legal move right now, asking every move its own
   * check and stopping at the first one. A move that throws on a redacted
   * player view (where other hands are hidden) is treated as unavailable, so
   * this is safe to call in a browser. Last-resort rescue moves don't count.
   */
  canAct(seat: number): boolean {
    if (this.state.winner !== null) return false;
    for (const def of Object.values(this.registry.actions)) {
      if (def.rescue) continue;
      if (def.phases && !def.phases.includes(this.state.phase.id)) continue;
      let options: Action[];
      try {
        options = def.enumerate?.(this, seat) ?? [];
      } catch {
        continue;
      }
      for (const a of options) {
        try {
          if (def.check(this, a) === null) return true;
        } catch (e) {
          if (!(e instanceof RuleError)) throw e;
        }
      }
    }
    return false;
  }

  /** Nobody can move and nobody has won: the game has dead-ended. */
  get stuck(): boolean {
    // One player's view can't tell: it hides the others' cards, so their moves
    // look unavailable. Only the server's own state answers this.
    if (this.state.viewer !== undefined) return false;
    return this.state.winner === null && !this.state.players.some((p) => this.canAct(p.seat));
  }

  /** Whether anyone could act if the game were in `phase`. Changes nothing. */
  canActIn(phase: Phase): boolean {
    const before = this.state.phase;
    this.state.phase = phase;
    try {
      return this.state.players.some((p) => this.canAct(p.seat));
    } finally {
      this.state.phase = before;
    }
  }

  rollDice(): DiceResult {
    return (this.registry.dice ?? plainDice)(this);
  }

  vp(seat: number): number {
    let base = 0;
    for (const piece of this.piecesOf(seat)) base += this.registry.pieceTypes[piece.type]?.vp ?? 0;
    return this.reduce('vp', seat, base);
  }

  vpTarget(): number {
    return this.reduce('vpTarget', this.setting<number>('vpTarget') ?? 10);
  }

  /** Ends the game if the active player has enough points. */
  checkWin(): boolean {
    if (this.state.winner !== null) return true;
    const seat = this.active;
    if (this.vp(seat) >= this.vpTarget() && this.reduce('canWin', seat, true)) {
      this.state.winner = seat;
      this.setPhase({ id: 'gameOver' });
      this.emit({
        type: 'gameOver',
        winner: seat,
        vp: this.state.players.map((_, i) => this.vp(i)),
      });
      return true;
    }
    return false;
  }

  // ---- Cards ----

  handSize(seat: number, onlyHandLimit = true): number {
    let n = 0;
    for (const [card, count] of Object.entries(this.player(seat).hand)) {
      if (!onlyHandLimit || this.registry.cardTypes[card]?.countsForHandLimit) n += count;
    }
    return n;
  }

  has(seat: number, cards: Cards): boolean {
    const hand = this.player(seat).hand;
    return Object.entries(cards).every(([c, n]) => (hand[c] ?? 0) >= n);
  }

  bankHas(cards: Cards): boolean {
    return Object.entries(cards).every(([c, n]) => (this.state.bank[c] ?? 0) >= n);
  }

  /** Moves cards from a player to the bank. */
  pay(seat: number, cards: Cards): void {
    if (!this.has(seat, cards)) throw new RuleError('Not enough cards');
    const hand = this.player(seat).hand;
    for (const [c, n] of Object.entries(cards)) {
      if (!n) continue;
      hand[c] = (hand[c] ?? 0) - n;
      this.state.bank[c] = (this.state.bank[c] ?? 0) + n;
    }
  }

  /** Moves cards from the bank to a player. */
  grant(seat: number, cards: Cards): void {
    if (!this.bankHas(cards)) throw new RuleError('The bank does not have those cards');
    const hand = this.player(seat).hand;
    for (const [c, n] of Object.entries(cards)) {
      if (!n) continue;
      this.state.bank[c] = (this.state.bank[c] ?? 0) - n;
      hand[c] = (hand[c] ?? 0) + n;
    }
  }

  /** Moves cards between players. */
  transfer(from: number, to: number, cards: Cards): void {
    if (!this.has(from, cards)) throw new RuleError('Not enough cards');
    const a = this.player(from).hand;
    const b = this.player(to).hand;
    for (const [c, n] of Object.entries(cards)) {
      if (!n) continue;
      a[c] = (a[c] ?? 0) - n;
      b[c] = (b[c] ?? 0) + n;
    }
  }

  /** Picks one random card (by count) from a player's hand. */
  randomCard(seat: number): string | null {
    const entries = Object.entries(this.player(seat).hand).filter(([, n]) => n > 0);
    const total = entries.reduce((s, [, n]) => s + n, 0);
    if (!total) return null;
    let k = this.rng.int(0, total - 1);
    for (const [c, n] of entries) {
      if (k < n) return c;
      k -= n;
    }
    return null;
  }

  cost(item: string, seat: number): Cards {
    const base = this.registry.costs[item];
    if (!base) throw new RuleError(`Unknown item "${item}"`);
    return this.reduce('cost', item, seat, { ...base });
  }

  drawCard(deck: string): string | null {
    return this.state.decks[deck]?.shift() ?? null;
  }

  // ---- Board and pieces ----

  hexType(hex: HexId) {
    const h = this.state.hexes[hex];
    return h ? this.registry.hexTypes[h.type] : undefined;
  }

  isLand(hex: HexId): boolean {
    const h = this.state.hexes[hex];
    return !!h && !h.hidden && this.registry.hexTypes[h.type]?.terrain === 'land';
  }

  isSea(hex: HexId): boolean {
    const h = this.state.hexes[hex];
    return !!h && !h.hidden && this.registry.hexTypes[h.type]?.terrain === 'sea';
  }

  /** A corner touching at least one land hex. */
  isLandCorner(corner: CornerId): boolean {
    return (this.geometry.cornerHexes.get(corner) ?? []).some((h) => this.isLand(h));
  }

  /** An edge with land on at least one side. */
  isLandEdge(edge: EdgeId): boolean {
    return (this.geometry.edgeHexes.get(edge) ?? []).some((h) => this.isLand(h));
  }

  /** An edge with sea on at least one side, or the board's outer rim. */
  isSeaEdge(edge: EdgeId): boolean {
    const hexes = this.geometry.edgeHexes.get(edge) ?? [];
    return hexes.some((h) => this.isSea(h));
  }

  private index: Map<string, Piece[]> | null = null;

  private locationKey(at: Location): string {
    return at.kind === 'supply' ? 'supply' : at.id;
  }

  /** Pieces at a location. Uses an index rebuilt after pieces change. */
  piecesAt(at: Location): Piece[] {
    if (!this.index) {
      this.index = new Map();
      for (const p of Object.values(this.state.pieces)) {
        const k = this.locationKey(p.at);
        const list = this.index.get(k);
        if (list) list.push(p);
        else this.index.set(k, [p]);
      }
    }
    return (this.index.get(this.locationKey(at)) ?? []).filter((p) => sameLocation(p.at, at));
  }

  /** Call after changing piece locations directly. */
  invalidatePieces(): void {
    this.index = null;
  }

  piecesOf(seat: number, type?: string): Piece[] {
    return Object.values(this.state.pieces).filter(
      (p) => p.owner === seat && p.at.kind !== 'supply' && (type === undefined || p.type === type),
    );
  }

  piecesOfType(type: string): Piece[] {
    return Object.values(this.state.pieces).filter(
      (p) => p.type === type && p.at.kind !== 'supply',
    );
  }

  /** The building (settlement, city, ...) on a corner, if any. */
  buildingAt(corner: CornerId): Piece | undefined {
    return this.piecesAt({ kind: 'corner', id: corner }).find(
      (p) => this.registry.pieceTypes[p.type]?.building,
    );
  }

  /** Another player's building or route-blocking piece (like a knight) sits on the corner. */
  blocksRouteAt(corner: CornerId, seat: number): boolean {
    return this.piecesAt({ kind: 'corner', id: corner }).some((p) => {
      // Unowned pieces don't block, except a neutral builder's (two-player duel rules).
      if (p.owner === seat || (p.owner === null && p.props.neutral === undefined)) return false;
      const def = this.registry.pieceTypes[p.type];
      return !!def?.building || !!def?.blocksRoutes;
    });
  }

  /** Pieces left in a player's supply. */
  supplyLeft(seat: number, type: string): number {
    const def = this.registry.pieceTypes[type];
    const limit = def?.perPlayer?.(this.playerCount);
    if (limit === undefined) return Infinity;
    return this.reduce('supply', seat, type, limit) - this.piecesOf(seat, type).length;
  }

  /** Places a new piece. */
  place(
    type: string,
    owner: number | null,
    at: Location,
    props: Record<string, unknown> = {},
  ): Piece {
    const def = this.registry.pieceTypes[type];
    if (!def) throw new RuleError(`Unknown piece type "${type}"`);
    if (at.kind !== 'supply' && at.kind !== def.on)
      throw new RuleError(`A ${type} goes on a ${def.on}`);
    if (owner !== null && this.supplyLeft(owner, type) <= 0)
      throw new RuleError(`No ${type}s left`);
    const piece: Piece = {
      id: `p${this.state.nextPieceId++}`,
      type,
      owner,
      at,
      props,
      placedTurn: this.state.turn.number,
    };
    this.state.pieces[piece.id] = piece;
    this.index = null;
    this.hook('piecePlaced', piece, null);
    return piece;
  }

  move(piece: Piece, to: Location): void {
    const previous = piece.at;
    piece.at = to;
    this.index = null;
    this.hook('piecePlaced', piece, previous);
  }

  remove(piece: Piece): void {
    delete this.state.pieces[piece.id];
    this.index = null;
  }

  /** Swaps a piece for one of another type in the same place (settlement → city). */
  upgrade(piece: Piece, type: string): Piece {
    const at = piece.at;
    const owner = piece.owner;
    this.remove(piece);
    try {
      return this.place(type, owner, at, { ...piece.props });
    } catch (e) {
      this.state.pieces[piece.id] = piece;
      this.index = null;
      throw e;
    }
  }

  /** Card types a player can trade at a better rate, from harbors they touch. */
  harborsOf(seat: number): { resource: string; ratio: number }[] {
    const out: { resource: string; ratio: number }[] = [];
    for (const h of this.state.harbors) {
      const corners = this.geometry.edgeCorners.get(h.edge) ?? [];
      if (corners.some((c) => this.buildingAt(c)?.owner === seat))
        out.push({ resource: h.resource, ratio: h.ratio });
    }
    return out;
  }

  /** Continuous route length for a player (Longest Road / Longest Trade Route). */
  longestRoute(seat: number): number {
    const routePieces = this.piecesOf(seat).filter(
      (p) => this.registry.pieceTypes[p.type]?.route && p.at.kind === 'edge',
    );
    if (!routePieces.length) return 0;
    const edgeRoute = new Map<EdgeId, string>();
    const weight = new Map<EdgeId, number>();
    for (const p of routePieces) {
      const id = (p.at as { id: EdgeId }).id;
      edgeRoute.set(id, this.registry.pieceTypes[p.type]?.route as string);
      weight.set(id, this.reduce('routeWeight', p, 1));
    }
    const blocked = (c: CornerId) => this.blocksRouteAt(c, seat);
    const ownBuilding = (c: CornerId) => this.buildingAt(c)?.owner === seat;

    let best = 0;
    const used = new Set<EdgeId>();
    const dfs = (corner: CornerId, lastRoute: string | null, length: number) => {
      if (length > best) best = length;
      if (length > 0 && blocked(corner)) return;
      for (const e of this.geometry.cornerEdges.get(corner) ?? []) {
        const route = edgeRoute.get(e);
        if (!route || used.has(e)) continue;
        // Roads and ships only join through the player's own building.
        if (lastRoute !== null && route !== lastRoute && !ownBuilding(corner)) continue;
        const [a, b] = this.geometry.edgeCorners.get(e) as [CornerId, CornerId];
        used.add(e);
        dfs(a === corner ? b : a, route, length + (weight.get(e) ?? 1));
        used.delete(e);
      }
    };
    const starts = new Set<CornerId>();
    for (const e of edgeRoute.keys())
      for (const c of this.geometry.edgeCorners.get(e) ?? []) starts.add(c);
    for (const c of starts) dfs(c, null, 0);
    return best;
  }
}
