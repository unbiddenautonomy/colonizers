import type {
  Action,
  ActionDef,
  Cards,
  CornerId,
  Ctx,
  EdgeId,
  HexState,
  Phase,
  Piece,
} from '@colonizers/engine';
import { ckData, hasAbility, isKnight, type Track } from '@colonizers/module-cities-knights';
import {
  BEER,
  BEER_RATIO,
  BREAD,
  FESTIVAL_COST,
  MODULE_ID,
  type FestivalKind,
} from './constants.ts';

/**
 * Church, Faith & Reformation's board rules: the Diocese, Bread, the
 * Abbey's Beer and festivals.
 */

export interface Festival {
  by: number;
  target: number;
  /** The piece the chip lies on. */
  piece: string;
  /** Where it was, for the screen. */
  at: string;
  kind: FestivalKind;
}

export interface ChurchData extends Record<string, unknown> {
  /** Each player's Diocese, at most one. */
  diocese: Record<number, CornerId>;
  festivals: Festival[];
  /** Lent: the player who may not build until they pay a grain and a wool. */
  lent?: { target: number; owed: Cards } | null;
  /** Anathema: a track shut until its owner pays the named resources. */
  bans?: { by: number; target: number; track: Track; owed: Cards }[];
  /** The city the Inquisitor stands at. */
  inquisitor?: CornerId | null;
}

export function churchData(ctx: Ctx): ChurchData {
  const d = ctx.data<ChurchData>(MODULE_ID);
  d.diocese ??= {};
  d.festivals ??= [];
  return d;
}

export function churchView(ctx: Ctx): Partial<ChurchData> {
  return (ctx.state.data[MODULE_ID] as ChurchData | undefined) ?? {};
}

type A<T> = Action & T;
export function action<T>(def: ActionDef<A<T>>): ActionDef {
  return def as unknown as ActionDef;
}

const onlyActive = (ctx: Ctx, a: Action): string | null =>
  a.player === ctx.active ? null : 'Not your turn';

// ---- The Diocese ----

export const dioceseOf = (ctx: Ctx, seat: number): CornerId | null =>
  churchView(ctx).diocese?.[seat] ?? null;

export const isDiocese = (p: Piece | undefined): boolean => p?.props.diocese === true;

/** What a Diocese on this corner costs: the Diocese, and the city first for a settlement. */
export function diocesePrice(ctx: Ctx, seat: number, corner: CornerId): Cards {
  const out: Cards = { ...ctx.cost('diocese', seat) };
  if (ctx.buildingAt(corner)?.type === 'settlement')
    for (const [c, n] of Object.entries(ctx.cost('city', seat))) out[c] = (out[c] ?? 0) + n;
  return out;
}

export function dioceseBlock(ctx: Ctx, seat: number, corner: CornerId): string | null {
  if (dioceseOf(ctx, seat) !== null) return 'You already have a Diocese';
  const b = ctx.buildingAt(corner);
  if (!b || b.owner !== seat || (b.type !== 'city' && b.type !== 'settlement'))
    return 'Pick one of your cities or settlements';
  if (b.props.citadel) return 'A Citadel can not be a Diocese too';
  if (festiveAt(ctx, b)) return 'Not while it is holding a festival';
  if (b.type === 'settlement' && ctx.supplyLeft(seat, 'city') <= 0) return 'No cities left';
  const price = diocesePrice(ctx, seat, corner);
  return ctx.has(seat, price) ? null : 'You can not afford it';
}

const buildDiocese = action<{ corner: CornerId }>({
  phases: ['main'],
  check: (ctx, a) => onlyActive(ctx, a) ?? dioceseBlock(ctx, a.player, a.corner),
  apply(ctx, a) {
    ctx.pay(a.player, diocesePrice(ctx, a.player, a.corner));
    let city = ctx.buildingAt(a.corner)!;
    if (city.type === 'settlement') {
      city = ctx.upgrade(city, 'city');
      ctx.emit({ type: 'built', player: a.player, piece: 'city', at: a.corner });
    }
    city.props.diocese = true;
    churchData(ctx).diocese[a.player] = a.corner;
    ctx.emit({ type: 'dioceseBuilt', player: a.player, at: a.corner });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active || dioceseOf(ctx, player) !== null) return [];
    return ctx
      .piecesOf(player)
      .flatMap((p) =>
        p.at.kind === 'corner' && !dioceseBlock(ctx, player, p.at.id)
          ? [{ type: 'buildDiocese', player, corner: p.at.id }]
          : [],
      );
  },
});

/** A Diocese knocked back to a settlement by the barbarians is gone. */
export function dropLostDioceses(ctx: Ctx): void {
  const d = churchView(ctx);
  for (const [seat, corner] of Object.entries(d.diocese ?? {})) {
    const b = ctx.buildingAt(corner);
    if (b && b.type === 'city' && b.owner === Number(seat) && isDiocese(b)) continue;
    if (b) delete b.props.diocese;
    delete churchData(ctx).diocese[Number(seat)];
    ctx.emit({ type: 'dioceseLost', player: Number(seat), at: corner });
  }
}

/** A Diocese's city on grain makes a Bread in place of its second grain. */
export function breadYield(ctx: Ctx, hex: HexState, piece: Piece, value: Cards): Cards {
  if (!isDiocese(piece) || ctx.registry.hexTypes[hex.type]?.produces !== 'grain') return value;
  if ((value.grain ?? 0) < 2) return value;
  return { ...value, grain: (value.grain ?? 0) - 1, [BREAD]: (value[BREAD] ?? 0) + 1 };
}

// ---- Beer ----

/** The Abbey: Religion level 3 players who got nothing from a roll take a Beer. */
export function brewBeer(ctx: Ctx): void {
  for (const e of ctx.events) {
    if (e.type !== 'production') continue;
    const received = (e.received ?? {}) as Record<number, Cards>;
    const brewed: number[] = [];
    for (const p of ctx.state.players) {
      if (!hasAbility(ctx, p.seat, 'religion')) continue;
      // With the Aqueduct too, the player picks one or the other.
      if (hasAbility(ctx, p.seat, 'science')) continue;
      if (Object.values(received[p.seat] ?? {}).some((n) => n > 0)) continue;
      if (!ctx.bankHas({ [BEER]: 1 })) break;
      ctx.grant(p.seat, { [BEER]: 1 });
      brewed.push(p.seat);
    }
    if (brewed.length) ctx.emit({ type: 'beerBrewed', players: brewed });
  }
}

/** Beer to the bank: 4:1, or 3:1 with a 3:1 harbor. */
export function beerRatio(ctx: Ctx, seat: number): number {
  return ctx.harborsOf(seat).some((h) => h.resource === 'any')
    ? Math.min(3, BEER_RATIO)
    : BEER_RATIO;
}

export function wrapBankTrade(prev: ActionDef): ActionDef {
  return {
    ...prev,
    check(ctx, a) {
      if (a.get === BEER) return 'The bank does not sell Beer';
      return prev.check(ctx, a);
    },
    enumerate(ctx, player) {
      const out = prev.enumerate?.(ctx, player) ?? [];
      if (player !== ctx.active || !ctx.has(player, { [BEER]: beerRatio(ctx, player) })) return out;
      const gets = Object.keys(ctx.registry.cardTypes).filter(
        (c) =>
          c !== BEER &&
          (ctx.registry.cardTypes[c]?.category === 'resource' ||
            ctx.registry.cardTypes[c]?.category === 'commodity'),
      );
      return [...out, ...gets.map((get) => ({ type: 'bankTrade', player, give: BEER, get }))];
    },
  };
}

/** With the Aqueduct and the Abbey, the Aqueduct's pick can be a Beer instead. */
export function wrapAqueductPick(prev: ActionDef): ActionDef {
  return {
    ...prev,
    check(ctx, a) {
      if (a.card !== BEER) return prev.check(ctx, a);
      const owed = ctx.state.phase.owed as Record<number, number> | undefined;
      if (!owed?.[a.player]) return 'You have nothing to pick';
      if (!ctx.bankHas({ [BEER]: 1 })) return 'The bank has no Beer left';
      return hasAbility(ctx, a.player, 'religion') ? null : 'Beer needs the Abbey';
    },
    apply(ctx, a) {
      if (a.card !== BEER) return prev.apply(ctx, a);
      ctx.grant(a.player, { [BEER]: 1 });
      ctx.emit({ type: 'beerBrewed', players: [a.player] });
      const ph = ctx.state.phase;
      const owed = { ...(ph.owed as Record<number, number>) };
      delete owed[a.player];
      if (Object.keys(owed).length) ctx.setPhase({ ...ph, owed });
      else ctx.setPhase(ph.returnTo as Phase);
    },
    enumerate(ctx, player) {
      const out = prev.enumerate?.(ctx, player) ?? [];
      if (!out.length || !hasAbility(ctx, player, 'religion') || !ctx.bankHas({ [BEER]: 1 }))
        return out;
      return [...out, { type: 'aqueductPick', player, card: BEER }];
    },
  };
}

// ---- Festivals ----

export const festivalsOf = (ctx: Ctx): Festival[] => churchView(ctx).festivals ?? [];

export const festiveAt = (ctx: Ctx, p: Piece): boolean =>
  festivalsOf(ctx).some((f) => f.piece === p.id);

const isEdge = (ctx: Ctx, at: string) => ctx.geometry.edgeCorners.has(at as EdgeId);

/** The kind of festival a piece would hold, if it can hold one. */
export function festivalKind(ctx: Ctx, p: Piece): FestivalKind | null {
  if (p.at.kind === 'edge') {
    const route = ctx.registry.pieceTypes[p.type]?.route;
    if (!route) return null;
    return p.type === 'ship' ? 'ship' : 'road';
  }
  if (p.at.kind !== 'corner') return null;
  if (isKnight(p)) return 'knight';
  if (p.type === 'settlement') return 'settlement';
  if (p.type === 'city' && !p.props.metropolis) return 'city';
  return null;
}

/** The rival piece a festival chip could go on here. */
function festivalPiece(ctx: Ctx, seat: number, at: string): Piece | null {
  const kind = isEdge(ctx, at) ? 'edge' : 'corner';
  const here = ctx.piecesAt({ kind, id: at } as never);
  return (
    here.find(
      (p) =>
        p.owner !== null && p.owner !== seat && festivalKind(ctx, p) !== null && !festiveAt(ctx, p),
    ) ?? null
  );
}

export function festivalBlock(ctx: Ctx, seat: number, at: string): string | null {
  if (festivalsOf(ctx).some((f) => f.by === seat)) return 'You already have a festival going';
  const p = festivalPiece(ctx, seat, at);
  if (!p) return "Pick a rival's road, ship, knight, settlement or city (not a metropolis)";
  const cost = FESTIVAL_COST[festivalKind(ctx, p)!];
  return ctx.has(seat, { [BEER]: cost }) ? null : `That festival costs ${cost} Beer`;
}

/** Every spot a player could hold a festival now. */
export function festivalSpots(ctx: Ctx, seat: number): string[] {
  if (festivalsOf(ctx).some((f) => f.by === seat) || !ctx.has(seat, { [BEER]: 2 })) return [];
  const out: string[] = [];
  for (const p of Object.values(ctx.state.pieces)) {
    if (p.owner === null || p.owner === seat) continue;
    if (p.at.kind !== 'edge' && p.at.kind !== 'corner') continue;
    if (!festivalBlock(ctx, seat, p.at.id)) out.push(p.at.id);
  }
  return [...new Set(out)];
}

const holdFestival = action<{ at: string }>({
  phases: ['main'],
  check: (ctx, a) => onlyActive(ctx, a) ?? festivalBlock(ctx, a.player, a.at),
  apply(ctx, a) {
    const p = festivalPiece(ctx, a.player, a.at)!;
    const kind = festivalKind(ctx, p)!;
    ctx.pay(a.player, { [BEER]: FESTIVAL_COST[kind] });
    const target = p.owner as number;
    churchData(ctx).festivals.push({ by: a.player, target, piece: p.id, at: a.at, kind });
    ctx.emit({ type: 'churchFestival', player: a.player, target, kind, at: a.at });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    return festivalSpots(ctx, player).map((at) => ({ type: 'holdFestival', player, at }));
  },
});

/** A festival ends when its host's next turn begins, before they roll. */
export function endFestivals(ctx: Ctx): void {
  const d = churchView(ctx);
  const seat = ctx.state.turn.player;
  if (!d.festivals?.some((f) => f.by === seat)) return;
  for (const f of d.festivals.filter((x) => x.by === seat))
    ctx.emit({ type: 'churchFestivalOver', player: f.by, target: f.target, kind: f.kind });
  churchData(ctx).festivals = d.festivals.filter((f) => f.by !== seat);
}

/** A festival whose piece is gone (or upgraded away) is over too. */
export function dropDeadFestivals(ctx: Ctx): void {
  const list = churchView(ctx).festivals;
  if (!list?.some((f) => !ctx.state.pieces[f.piece])) return;
  churchData(ctx).festivals = list.filter((f) => !!ctx.state.pieces[f.piece]);
}

/** Festive buildings make nothing. */
export const festivalBlocksYield = (
  ctx: Ctx,
  _hex: HexState,
  piece: Piece,
  value: boolean,
): boolean => value || festiveAt(ctx, piece);

/** Festive buildings count no points. */
export function festivalVp(ctx: Ctx, seat: number): number {
  let lost = 0;
  for (const f of festivalsOf(ctx)) {
    if (f.target !== seat) continue;
    const p = ctx.state.pieces[f.piece];
    if (!p) continue;
    if (p.type === 'settlement') lost += 1;
    if (p.type === 'city') lost += 2 + (isDiocese(p) ? 1 : 0);
  }
  return lost;
}

/** A festive road or ship breaks the trade route. */
export const festivalRouteWeight = (ctx: Ctx, piece: Piece, value: number): number =>
  festiveAt(ctx, piece) ? -100 : value;

/** A festive knight is no help against the barbarians. */
export const festivalKnightStrength = (ctx: Ctx, knight: Piece, value: number): number =>
  festiveAt(ctx, knight) ? 0 : value;

/** Does this corner join the player's network, not counting festive roads or ships? */
function joinsAt(ctx: Ctx, seat: number, corner: CornerId, route: string): boolean {
  const b = ctx.buildingAt(corner);
  if (b) return b.owner === seat;
  if (ctx.blocksRouteAt(corner, seat)) return false;
  return (ctx.geometry.cornerEdges.get(corner) ?? []).some((e) =>
    ctx
      .piecesAt({ kind: 'edge', id: e })
      .some(
        (p) =>
          p.owner === seat &&
          ctx.registry.pieceTypes[p.type]?.route === route &&
          !festiveAt(ctx, p),
      ),
  );
}

const hasFestiveRoute = (ctx: Ctx, seat: number) =>
  festivalsOf(ctx).some((f) => f.target === seat && (f.kind === 'road' || f.kind === 'ship'));

/** Building Lent stops until it is paid off. */
const LENT_BLOCKS = [
  'buildRoad',
  'buildShip',
  'buildSettlement',
  'buildCity',
  'buildDiocese',
  'buildWall',
  'improveCity',
];

/** Why Lent or Anathema stops this action, if one does. */
export function churchStops(ctx: Ctx, a: Action): string | null {
  const v = churchView(ctx);
  if (v.lent?.target === a.player && LENT_BLOCKS.includes(a.type))
    return 'Lent: pay a grain and a wool before you build again';
  if (a.type === 'improveCity' && v.bans?.some((b) => b.target === a.player && b.track === a.track))
    return 'Anathema: pay off what you owe before you improve that track';
  return festivalStops(ctx, a);
}

/** Tracks whose level 3 abilities Anathema switches off, by player. */
export function syncBans(ctx: Ctx): void {
  const want: Record<number, Track[]> = {};
  for (const b of churchView(ctx).bans ?? []) (want[b.target] ??= []).push(b.track);
  const d = ckData(ctx);
  if (JSON.stringify(d.lockedTracks ?? {}) !== JSON.stringify(want)) d.lockedTracks = want;
}

/** Why a festival stops this action, if one does. */
export function festivalStops(ctx: Ctx, a: Action): string | null {
  const list = festivalsOf(ctx);
  if (!list.length) return null;
  const festive = (id: unknown) =>
    typeof id === 'string' && list.some((f) => f.piece === id)
      ? 'That piece is busy with a festival'
      : null;
  const festiveCorner = (corner: unknown) => {
    if (typeof corner !== 'string') return null;
    const b = ctx.buildingAt(corner as CornerId);
    return b && festiveAt(ctx, b) ? 'That building is busy with a festival' : null;
  };
  switch (a.type) {
    case 'activateKnight':
    case 'promoteKnight':
    case 'moveKnight':
    case 'displaceKnight':
    case 'chaseRobber':
      return festive(a.knight);
    case 'moveShip':
      return festive(a.ship);
    case 'buildCity':
    case 'buildWall':
      return festiveCorner(a.corner);
    case 'buildRoad':
    case 'buildShip': {
      if (!hasFestiveRoute(ctx, a.player)) return null;
      const route = a.type === 'buildShip' ? 'sea' : 'land';
      const corners = ctx.geometry.edgeCorners.get(a.edge as EdgeId) ?? [];
      return corners.some((c) => joinsAt(ctx, a.player, c, route))
        ? null
        : 'You can not build on from a road or ship holding a festival';
    }
    case 'buildSettlement': {
      if (!hasFestiveRoute(ctx, a.player)) return null;
      const corner = a.corner as CornerId;
      const ok = (ctx.geometry.cornerEdges.get(corner) ?? []).some((e) =>
        ctx
          .piecesAt({ kind: 'edge', id: e })
          .some(
            (p) =>
              p.owner === a.player &&
              !!ctx.registry.pieceTypes[p.type]?.route &&
              !festiveAt(ctx, p),
          ),
      );
      return ok ? null : 'You can not build on from a road or ship holding a festival';
    }
  }
  return null;
}

/** Wraps an action so festivals can stop it. */
export function guardFestival(prev: ActionDef): ActionDef {
  const out: ActionDef = {
    ...prev,
    check: (ctx, a) => churchStops(ctx, a) ?? prev.check(ctx, a),
  };
  const list = prev.enumerate;
  if (list) out.enumerate = (ctx, player) => list(ctx, player).filter((a) => !churchStops(ctx, a));
  return out;
}

export const churchActions: Record<string, ActionDef> = { buildDiocese, holdFestival };
