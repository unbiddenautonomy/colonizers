import type {
  Action,
  ActionDef,
  Cards,
  CornerId,
  Ctx,
  GameModule,
  HexId,
  HexState,
  Piece,
} from '@colonizers/engine';
import { hexNeighbours } from '@colonizers/engine';
import { robber } from '@colonizers/module-base';

/**
 * Kingdoms & Warriors (Königreiche & Krieger, a fan expansion from
 * siedlerinsel.de), for the base game:
 *
 * - Everyone starts with a settlement and a city, and a free kingdom marker
 *   beside the city.
 * - A **kingdom marker** costs 2 ore or 2 grain. It goes on a land field
 *   beside one of your cities or your markers, never on the robber, and one
 *   of yours a field. It produces that field's resource like a settlement.
 * - Every 3 markers joined into one kingdom are worth a point.
 * - A kingdom that covers every field around a rival's settlement takes its
 *   yield; around a city, it takes one of the two cards.
 * - A marker on a rival's field starts a **battle** when you end your turn:
 *   knight cards played, +1 for Largest Army, + half a die (rounded down).
 *   The loser's marker goes; on a tie, the attacker's. The winner gets a free
 *   marker, away from rival buildings and rival markers. At most 2 battles a
 *   turn, against different players, and a player's last 2 markers are safe.
 * - Plays to 2 points more than usual.
 */

export const MODULE_ID = 'kingdoms';
export const MARKER = 'kingdom';
export const MARKERS = 20;
/** What a marker costs: 2 ore, or 2 grain. */
export const MARKER_PAY = { ore: { ore: 2 }, grain: { grain: 2 } } as const;
export type MarkerPay = keyof typeof MARKER_PAY;
export const MARKERS_PER_VP = 3;
export const BATTLES_PER_TURN = 2;
/** A player's last markers can't be attacked. */
export const SAFE_MARKERS = 2;
/** Kingdoms & Warriors plays to 2 points more than usual. */
export const KINGDOMS_EXTRA_VP = 2;

export interface KingdomsData {
  /** The free first marker beside the starting city, not yet placed. */
  start: Record<string, boolean>;
  /** Free markers won in battle, not yet placed. */
  free: Record<string, number>;
  /** Rivals attacked this turn. */
  attacked: { turn: number; seats: number[] };
}

export function kwData(ctx: Ctx): KingdomsData {
  const d = ctx.data<Partial<KingdomsData>>(MODULE_ID);
  d.start ??= {};
  d.free ??= {};
  d.attacked ??= { turn: -1, seats: [] };
  return d as KingdomsData;
}

const hexOf = (p: Piece): HexId | null => (p.at.kind === 'hex' ? p.at.id : null);

export const markersOf = (ctx: Ctx, seat: number): Piece[] => ctx.piecesOf(seat, MARKER);

export const markersAt = (ctx: Ctx, hex: HexId): Piece[] =>
  ctx.piecesAt({ kind: 'hex', id: hex }).filter((p) => p.type === MARKER);

const markerOf = (ctx: Ctx, hex: HexId, seat: number) =>
  markersAt(ctx, hex).find((p) => p.owner === seat);

/** A marker set on a rival's field, waiting for the battle at the end of the turn. */
export const contesting = (p: Piece) => typeof p.props.contest === 'string';

function isLandHex(ctx: Ctx, hex: HexId): boolean {
  const h = ctx.state.hexes[hex];
  return !!h && !h.hidden && ctx.isLand(hex);
}

const robberOn = (ctx: Ctx, hex: HexId) => {
  const r = robber(ctx)?.at;
  return r?.kind === 'hex' && r.id === hex;
};

const citiesOf = (ctx: Ctx, seat: number) =>
  ctx.piecesOf(seat).filter((p) => p.type === 'city' && p.at.kind === 'corner');

/** Is this field beside one of the player's cities or markers? */
export function reachable(ctx: Ctx, seat: number, hex: HexId): boolean {
  const byCity = citiesOf(ctx, seat).some((c) =>
    (ctx.geometry.cornerHexes.get((c.at as { id: CornerId }).id) ?? []).includes(hex),
  );
  if (byCity) return true;
  const mine = new Set(markersOf(ctx, seat).map(hexOf));
  return hexNeighbours(hex).some((n) => mine.has(n));
}

/** Why the player can't put a marker here (paid or free), or null. */
export function markerBlock(ctx: Ctx, seat: number, hex: HexId, free: boolean): string | null {
  if (!isLandHex(ctx, hex)) return 'Kingdom markers go on land';
  if (robberOn(ctx, hex)) return 'Not on the robber';
  if (markerOf(ctx, hex, seat)) return 'You already have a marker there';
  if (ctx.supplyLeft(seat, MARKER) <= 0) return 'No kingdom markers left';
  if (!reachable(ctx, seat, hex)) return 'Beside one of your cities or kingdom markers';
  const rivals = markersAt(ctx, hex).filter((p) => p.owner !== seat);
  if (free && kwData(ctx).start[String(seat)]) {
    // The first marker: beside the starting city, on a field no one holds.
    return rivals.length ? 'Someone already holds that field' : null;
  }
  if (free) {
    if (rivals.length) return 'A free marker can’t start a battle';
    const near = (ctx.geometry.hexCorners.get(hex) ?? []).some((c) => {
      const b = ctx.buildingAt(c);
      return !!b && b.owner !== null && b.owner !== seat;
    });
    return near ? 'A free marker can’t go beside a rival’s building' : null;
  }
  if (!rivals.length) return null;
  const rival = rivals[0] as Piece;
  if (contesting(rival)) return 'That field is already being fought over';
  const owner = rival.owner as number;
  const d = kwData(ctx);
  const seats = d.attacked.turn === ctx.state.turn.number ? d.attacked.seats : [];
  if (seats.includes(owner)) return 'One battle a turn against each player';
  if (seats.length >= BATTLES_PER_TURN) return `At most ${BATTLES_PER_TURN} battles a turn`;
  if (markersOf(ctx, owner).length <= SAFE_MARKERS)
    return `A player’s last ${SAFE_MARKERS} markers are safe`;
  return null;
}

function landHexes(ctx: Ctx): HexId[] {
  return (Object.keys(ctx.state.hexes) as HexId[]).filter((h) => isLandHex(ctx, h));
}

const buyMarker: ActionDef = {
  phases: ['main'],
  check(ctx, a) {
    if (a.player !== ctx.active) return 'Not your turn';
    const pay = MARKER_PAY[a.pay as MarkerPay];
    if (!pay) return 'Pay 2 ore or 2 grain';
    if (!ctx.has(a.player, pay)) return `You need 2 ${a.pay as string}`;
    return markerBlock(ctx, a.player, a.hex as HexId, false);
  },
  apply(ctx, a) {
    const hex = a.hex as HexId;
    ctx.pay(a.player, MARKER_PAY[a.pay as MarkerPay]);
    const rival = markersAt(ctx, hex).find((p) => p.owner !== a.player);
    const props: Record<string, unknown> = {};
    if (rival) {
      props.contest = rival.id;
      const d = kwData(ctx);
      if (d.attacked.turn !== ctx.state.turn.number)
        d.attacked = { turn: ctx.state.turn.number, seats: [] };
      d.attacked.seats.push(rival.owner as number);
    }
    ctx.place(MARKER, a.player, { kind: 'hex', id: hex }, props);
    ctx.emit({ type: 'kingdomMarker', player: a.player, hex, attack: rival?.owner ?? null });
  },
  enumerate(ctx, player): Action[] {
    if (player !== ctx.active) return [];
    const pays = (Object.keys(MARKER_PAY) as MarkerPay[]).filter((p) =>
      ctx.has(player, MARKER_PAY[p]),
    );
    if (!pays.length) return [];
    return landHexes(ctx)
      .filter((hex) => !markerBlock(ctx, player, hex, false))
      .flatMap((hex) => pays.map((pay) => ({ type: 'buyMarker', player, hex, pay })));
  },
};

export const hasFree = (ctx: Ctx, seat: number) =>
  !!kwData(ctx).start[String(seat)] || (kwData(ctx).free[String(seat)] ?? 0) > 0;

const placeFreeMarker: ActionDef = {
  phases: ['main'],
  check(ctx, a) {
    if (a.player !== ctx.active) return 'Not your turn';
    if (!hasFree(ctx, a.player)) return 'You have no free marker';
    return markerBlock(ctx, a.player, a.hex as HexId, true);
  },
  apply(ctx, a) {
    const d = kwData(ctx);
    if (d.start[String(a.player)]) delete d.start[String(a.player)];
    else d.free[String(a.player)] = (d.free[String(a.player)] ?? 1) - 1;
    ctx.place(MARKER, a.player, { kind: 'hex', id: a.hex as HexId });
    ctx.emit({ type: 'kingdomMarker', player: a.player, hex: a.hex, free: true });
  },
  enumerate(ctx, player): Action[] {
    if (player !== ctx.active || !hasFree(ctx, player)) return [];
    return landHexes(ctx)
      .filter((hex) => !markerBlock(ctx, player, hex, true))
      .map((hex) => ({ type: 'placeFreeMarker', player, hex }));
  },
};

/** A player's strength in battle, without the die: knights played and Largest Army. */
export function armyOf(ctx: Ctx, seat: number): number {
  const base = ctx.state.data.base as { largestArmy?: number | null } | undefined;
  return (ctx.player(seat).played.knight ?? 0) + (base?.largestArmy === seat ? 1 : 0);
}

/** The battles a player started this turn, fought as the turn ends. */
export function fightBattles(ctx: Ctx, seat: number): void {
  for (const attacker of markersOf(ctx, seat).filter(contesting)) {
    const defender = ctx.state.pieces[attacker.props.contest as string];
    delete attacker.props.contest;
    if (!defender) continue;
    const def = defender.owner as number;
    const rolls = [ctx.rng.int(1, 6), ctx.rng.int(1, 6)];
    const a = armyOf(ctx, seat) + Math.floor((rolls[0] as number) / 2);
    const b = armyOf(ctx, def) + Math.floor((rolls[1] as number) / 2);
    const won = a > b;
    ctx.remove(won ? defender : attacker);
    const d = kwData(ctx);
    if (a !== b) {
      const winner = won ? seat : def;
      d.free[String(winner)] = (d.free[String(winner)] ?? 0) + 1;
    }
    ctx.emit({
      type: 'kingdomBattle',
      player: seat,
      defender: def,
      hex: hexOf(attacker),
      rolls,
      strength: [a, b],
      winner: won ? seat : def,
    });
  }
}

/** The player's kingdoms: markers joined field to field (markers still in battle left out). */
export function kingdomsOf(ctx: Ctx, seat: number): HexId[][] {
  const left = new Set(
    markersOf(ctx, seat)
      .filter((p) => !contesting(p))
      .map(hexOf)
      .filter((h): h is HexId => !!h),
  );
  const out: HexId[][] = [];
  for (const start of [...left]) {
    if (!left.has(start)) continue;
    const group: HexId[] = [];
    const stack = [start];
    left.delete(start);
    while (stack.length) {
      const h = stack.pop() as HexId;
      group.push(h);
      for (const n of hexNeighbours(h))
        if (left.has(n)) {
          left.delete(n);
          stack.push(n);
        }
    }
    out.push(group);
  }
  return out;
}

export const kingdomPoints = (ctx: Ctx, seat: number) =>
  kingdomsOf(ctx, seat).reduce((n, k) => n + Math.floor(k.length / MARKERS_PER_VP), 0);

/** The rival whose markers cover every land field around this corner, if any. */
export function surroundedBy(ctx: Ctx, corner: CornerId, owner: number): number | null {
  const fields = (ctx.geometry.cornerHexes.get(corner) ?? []).filter((h) => isLandHex(ctx, h));
  if (!fields.length) return null;
  const first = fields[0] as HexId;
  for (const m of markersAt(ctx, first)) {
    const seat = m.owner;
    if (seat === null || seat === owner || contesting(m)) continue;
    if (fields.every((h) => markersAt(ctx, h).some((x) => x.owner === seat && !contesting(x))))
      return seat;
  }
  return null;
}

/** A surrounded settlement's yield goes to the kingdom; a city's, one card of it. */
function yieldShares(
  ctx: Ctx,
  _hex: HexState,
  piece: Piece,
  value: Record<number, Cards>,
): Record<number, Cards> {
  if (piece.owner === null || piece.at.kind !== 'corner') return value;
  if (!ctx.registry.pieceTypes[piece.type]?.building) return value;
  const rival = surroundedBy(ctx, piece.at.id, piece.owner);
  if (rival === null) return value;
  const mine: Record<string, number> = { ...(value[piece.owner] ?? {}) } as Record<string, number>;
  const theirs: Record<string, number> = { ...(value[rival] ?? {}) } as Record<string, number>;
  const total = Object.values(mine).reduce((n, k) => n + (k ?? 0), 0);
  // A settlement gives it all; anything bigger keeps all but one card.
  let take = piece.type === 'settlement' ? total : Math.min(1, total);
  for (const [card, n] of Object.entries(mine)) {
    const k = Math.min(n, take);
    if (!k) continue;
    mine[card] = n - k;
    theirs[card] = (theirs[card] ?? 0) + k;
    take -= k;
  }
  return { ...value, [piece.owner]: mine, [rival]: theirs };
}

const wrapEndTurn = (prev: ActionDef): ActionDef => ({
  ...prev,
  apply(ctx, a) {
    fightBattles(ctx, a.player);
    prev.apply(ctx, a);
  },
});

export const kingdomsModule: GameModule = {
  id: MODULE_ID,
  name: 'Kingdoms & Warriors',
  pieceTypes: {
    [MARKER]: { on: 'hex', perPlayer: () => MARKERS, production: 1 },
  },
  actions: { buyMarker, placeFreeMarker },
  wrapActions: { endTurn: wrapEndTurn },
  hooks: {
    init(ctx) {
      kwData(ctx);
    },
    afterAction(ctx, a) {
      // Everyone starts with a settlement and a city, and a free marker beside it.
      const ph = ctx.state.phase;
      if (a.type !== 'placeSetupSettlement' || ph.id !== 'setup') return;
      const i = ph.index as number;
      if (i < ctx.playerCount || i >= 2 * ctx.playerCount) return;
      const b = ctx.buildingAt(a.corner as CornerId);
      if (b?.type === 'settlement') {
        ctx.upgrade(b, 'city');
        ctx.emit({ type: 'startingCity', player: a.player, at: a.corner });
      }
      kwData(ctx).start[String(a.player)] = true;
    },
  },
  reducers: {
    vp: (ctx, seat, value) => value + kingdomPoints(ctx, seat),
    yieldShares,
  },
};
