import type {
  Action,
  ActionDef,
  Cards,
  CornerId,
  Ctx,
  GameModule,
  HexId,
  Location,
  Phase,
  Piece,
} from '@colonizers/engine';
import {
  baseData,
  distanceRuleOk,
  RESOURCES,
  setupRounds,
  setupSeat,
} from '@colonizers/module-base';
import {
  ACTIVATE_COST,
  blocked,
  boostLeft,
  buildingRatio,
  canBuildVehicle,
  canMixTrade,
  FREE_MOVES,
  chaseTargets,
  fishingGrounds,
  harborRatio,
  HAND_LIMIT_EXTRA,
  isActive,
  isVehicle,
  KNIGHT_MOVES,
  lwData,
  MODULE_ID,
  MOST_VEHICLES_VP,
  movesUsed,
  nextStepCost,
  PLANE_SAVING,
  stepsFrom,
  updateMostVehicles,
  VEHICLE_COST,
  VEHICLE_SUPPLY,
  VEHICLES,
  vehiclesOf,
  type Vehicle,
} from './rules.ts';

/**
 * Land & Water (Land & Wasser, a fan expansion from siedlerinsel.de):
 *
 * - There are no roads, and no Seafarers ships. Everyone starts with two
 *   settlements and nothing else.
 * - **Vehicles** are built at your own settlements and cities: a train
 *   (ore, brick, grain), a ship on the coast (lumber, wool, grain) or a plane
 *   at a city (2 ore, 2 brick, 2 grain). They travel through the fields: a
 *   step goes from a corner into a field, or from a field out to one of its
 *   corners. Trains keep to land, ships to the sea, planes go anywhere. A
 *   train or ship has one free step a turn and a plane two; every further
 *   step costs a grain.
 * - An active train in a field collects the field's yield like a
 *   settlement. An active ship out at sea fishes: a player who gets nothing
 *   on a roll (other than a 7) takes a resource of their choice for each sea
 *   field they fish in. A ship in front of a harbor gives you that harbor
 *   instead; two of the same harbor give 1:1 (2 of a kind + 1 card at a
 *   generic one).
 * - A new settlement goes where one of your active vehicles stands. That
 *   vehicle turns passive and has to be paid for to move again.
 * - The robber and the pirate block vehicles' yields, and vehicles can't
 *   enter their fields.
 * - A knight card can also speed your vehicles by two steps, or chase a
 *   rival's train or ship out of its field. Road Building builds a free
 *   train or ship, or saves 3 cards on a plane.
 * - Most Vehicles (3 or more) replaces the Longest Road. Hands of up to 10
 *   cards are safe on a 7. Plays to 12.
 */

type A<T> = Action & T;
const def = <T>(d: ActionDef<A<T>>) => d as unknown as ActionDef;
const onlyActive = (ctx: Ctx, a: Action) => (a.player === ctx.active ? null : 'Not your turn');
const vehicleName = (t: string) => (t === 'ferry' ? 'ship' : t);

function pieceOf(ctx: Ctx, id: unknown): Piece | undefined {
  return typeof id === 'string' ? ctx.state.pieces[id] : undefined;
}

const movedThisTurn = (ctx: Ctx) => {
  const m = lwData(ctx).moving;
  return m.turn === ctx.state.turn.number && m.seat === ctx.active;
};
const NO_BUILD_AFTER_MOVING = 'You have started moving: building is over for this turn';

const vehicleAtCorner = (ctx: Ctx, seat: number, corner: CornerId) =>
  ctx
    .piecesAt({ kind: 'corner', id: corner })
    .find((p) => p.owner === seat && isVehicle(p.type) && isActive(p));

function placeVehicle(ctx: Ctx, seat: number, type: Vehicle, corner: CornerId, paid: Cards) {
  ctx.place(type, seat, { kind: 'corner', id: corner }, {});
  ctx.emit({ type: 'built', player: seat, piece: type, at: corner, paid });
}

/** Corners with the player's settlements and cities. */
function buildingCorners(ctx: Ctx, seat: number): CornerId[] {
  return ctx
    .piecesOf(seat)
    .flatMap((p) =>
      ctx.registry.pieceTypes[p.type]?.building && p.at.kind === 'corner' ? [p.at.id] : [],
    );
}

// ---- Picking resources for gold and fish ----

interface PickPhase {
  id: 'lwPick';
  owed: Record<number, number>;
  returnTo: Phase;
}

const bankResources = (ctx: Ctx) => RESOURCES.reduce((s, r) => s + (ctx.state.bank[r] ?? 0), 0);

function startPick(ctx: Ctx, owed: Record<number, number>): void {
  const clean: Record<number, number> = {};
  let left = bankResources(ctx);
  for (const [seat, n] of Object.entries(owed)) {
    const can = Math.min(n, left);
    if (can > 0) clean[Number(seat)] = can;
    left -= can;
  }
  if (!Object.keys(clean).length) return;
  ctx.setPhase({ id: 'lwPick', owed: clean, returnTo: ctx.state.phase });
  ctx.emit({ type: 'lwPickOwed', owed: clean });
}

const pickResources = def<{ cards: Record<string, number> }>({
  phases: ['lwPick'],
  check(ctx, a) {
    const owed = (ctx.state.phase as unknown as PickPhase).owed[a.player];
    if (!owed) return 'You have nothing to pick';
    if (typeof a.cards !== 'object' || a.cards === null) return 'Pick resources';
    let total = 0;
    for (const [c, n] of Object.entries(a.cards)) {
      if (!(RESOURCES as readonly string[]).includes(c) || !Number.isInteger(n) || n < 0)
        return 'Pick resources';
      total += n;
    }
    if (total !== owed) return `Pick ${owed}`;
    if (!ctx.bankHas(a.cards)) return 'The bank does not have those';
    return null;
  },
  apply(ctx, a) {
    const ph = ctx.state.phase as unknown as PickPhase;
    ctx.grant(a.player, a.cards);
    ctx.emit({ type: 'lwPicked', player: a.player, cards: a.cards });
    const owed = { ...ph.owed };
    delete owed[a.player];
    ctx.setPhase(Object.keys(owed).length ? { ...ph, owed } : ph.returnTo);
  },
  enumerate(ctx, player) {
    const owed = (ctx.state.phase as unknown as PickPhase).owed[player];
    if (!owed) return [];
    return RESOURCES.map((r) => ({ type: 'pickResources', player, cards: { [r]: owed } }));
  },
});

/** Trains collect their fields' yields; then ships fish for those who got nothing. */
function vehicleYields(ctx: Ctx, total: number): void {
  const got: Record<number, Record<string, number>> = {};
  const picks: Record<number, number> = {};
  for (const p of ctx.state.players) {
    for (const v of vehiclesOf(ctx, p.seat)) {
      if (v.type !== 'train' || !isActive(v) || v.at.kind !== 'hex') continue;
      const hex = ctx.state.hexes[v.at.id];
      if (!hex || hex.hidden || hex.token !== total || blocked(ctx, hex, v)) continue;
      if (hex.type === 'gold') {
        picks[p.seat] = (picks[p.seat] ?? 0) + 1;
        continue;
      }
      const res = ctx.registry.hexTypes[hex.type]?.produces;
      if (!res || !ctx.bankHas({ [res]: 1 })) continue;
      const cards = ctx.reduce('hexYield', hex, v, { [res]: 1 });
      for (const [c, n] of Object.entries(cards)) {
        if (!n || !ctx.bankHas({ [c]: n })) continue;
        ctx.grant(p.seat, { [c]: n });
        (got[p.seat] ??= {})[c] = (got[p.seat]?.[c] ?? 0) + n;
      }
    }
  }
  if (Object.keys(got).length) ctx.emit({ type: 'vehicleYield', total, received: got });

  // Who got anything on this roll, from buildings, gold or trains?
  const lucky = new Set<number>([...Object.keys(got), ...Object.keys(picks)].map(Number));
  for (const e of ctx.events) {
    if (e.type === 'production')
      for (const [seat, cards] of Object.entries(e.received as Record<string, Cards>))
        if (Object.values(cards).some((n) => (n ?? 0) > 0)) lucky.add(Number(seat));
    if (e.type === 'goldOwed')
      for (const seat of Object.keys(e.owed as Record<string, number>)) lucky.add(Number(seat));
  }
  const fish: Record<number, number> = {};
  for (const p of ctx.state.players) {
    if (lucky.has(p.seat)) continue;
    const grounds = fishingGrounds(ctx, p.seat).length;
    if (grounds) {
      picks[p.seat] = (picks[p.seat] ?? 0) + grounds;
      fish[p.seat] = grounds;
    }
  }
  if (Object.keys(fish).length) ctx.emit({ type: 'fished', fish });
  startPick(ctx, picks);
}

// ---- Vehicles ----

const buildVehicle = def<{ vehicle: Vehicle; corner: CornerId }>({
  phases: ['main'],
  check(ctx, a) {
    if (!isVehicle(a.vehicle)) return 'Unknown vehicle';
    return (
      onlyActive(ctx, a) ??
      (movedThisTurn(ctx) ? NO_BUILD_AFTER_MOVING : null) ??
      (ctx.has(a.player, ctx.cost(a.vehicle, a.player))
        ? null
        : `You can not afford a ${vehicleName(a.vehicle)}`) ??
      canBuildVehicle(ctx, a.player, a.vehicle, a.corner)
    );
  },
  apply(ctx, a) {
    const cost = ctx.cost(a.vehicle, a.player);
    ctx.pay(a.player, cost);
    placeVehicle(ctx, a.player, a.vehicle, a.corner, cost);
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    const corners = buildingCorners(ctx, player);
    return VEHICLES.flatMap((vehicle) =>
      corners.map((corner) => ({ type: 'buildVehicle', player, vehicle, corner })),
    );
  },
});

const activateVehicle = def<{ piece: string }>({
  phases: ['main'],
  check(ctx, a) {
    const v = pieceOf(ctx, a.piece);
    if (!v || v.owner !== a.player || !isVehicle(v.type)) return 'Pick one of your vehicles';
    if (isActive(v)) return 'That vehicle is already active';
    if (movedThisTurn(ctx)) return NO_BUILD_AFTER_MOVING;
    const cost = ctx.cost(`activate:${v.type}`, a.player);
    if (!ctx.has(a.player, cost)) return 'You can not afford to activate it';
    return onlyActive(ctx, a);
  },
  apply(ctx, a) {
    const v = pieceOf(ctx, a.piece) as Piece;
    const cost = ctx.cost(`activate:${v.type}`, a.player);
    ctx.pay(a.player, cost);
    delete v.props.passive;
    ctx.emit({ type: 'vehicleActivated', player: a.player, piece: v.type, paid: cost });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    return vehiclesOf(ctx, player)
      .filter((v) => !isActive(v))
      .map((v) => ({ type: 'activateVehicle', player, piece: v.id }));
  },
});

const sameLocation = (x: Location, y: Location) =>
  x.kind === y.kind && 'id' in x && 'id' in y && x.id === y.id;

const moveVehicle = def<{ piece: string; to: Location }>({
  phases: ['main'],
  check(ctx, a) {
    const v = pieceOf(ctx, a.piece);
    if (!v || v.owner !== a.player || !isVehicle(v.type)) return 'Pick one of your vehicles';
    if (!isActive(v)) return 'A passive vehicle can not move';
    if (!a.to || typeof a.to !== 'object') return 'Pick where it goes';
    if (!stepsFrom(ctx, v).some((at) => sameLocation(at, a.to))) return 'It can not go there';
    if (!ctx.has(a.player, nextStepCost(ctx, v))) return 'Another step costs a grain';
    return onlyActive(ctx, a);
  },
  apply(ctx, a) {
    const v = pieceOf(ctx, a.piece) as Piece;
    const cost = nextStepCost(ctx, v);
    const free = movesUsed(ctx, v) < FREE_MOVES[v.type as Vehicle];
    const d = lwData(ctx);
    if (Object.keys(cost).length) ctx.pay(a.player, cost);
    else if (!free) d.boost.points -= 1;
    v.props.moves = { turn: ctx.state.turn.number, used: movesUsed(ctx, v) + 1 };
    d.moving = { turn: ctx.state.turn.number, seat: a.player };
    ctx.move(v, a.to);
    ctx.emit({ type: 'vehicleMoved', player: a.player, piece: v.type, to: a.to, paid: cost });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    return vehiclesOf(ctx, player)
      .filter(isActive)
      .flatMap((v) =>
        stepsFrom(ctx, v).map((to) => ({ type: 'moveVehicle', player, piece: v.id, to })),
      );
  },
});

/** Two generic harbors: two of a kind plus any one card for one. */
const mixTrade = def<{ give: string; extra: string; get: string }>({
  phases: ['main'],
  check(ctx, a) {
    const res = RESOURCES as readonly string[];
    if (!res.includes(a.give) || !res.includes(a.extra) || !res.includes(a.get))
      return 'Pick resources';
    if (a.give === a.get) return 'Pick a different card to receive';
    if (!canMixTrade(ctx, a.player)) return 'You need two generic harbors';
    const pay: Record<string, number> = { [a.give]: 2 };
    pay[a.extra] = (pay[a.extra] ?? 0) + 1;
    if (!ctx.has(a.player, pay)) return 'You do not have those cards';
    if (!ctx.bankHas({ [a.get]: 1 })) return 'The bank has none left';
    return onlyActive(ctx, a);
  },
  apply(ctx, a) {
    const pay: Record<string, number> = { [a.give]: 2 };
    pay[a.extra] = (pay[a.extra] ?? 0) + 1;
    ctx.pay(a.player, pay);
    ctx.grant(a.player, { [a.get]: 1 });
    ctx.emit({ type: 'bankTrade', player: a.player, gave: pay, got: { [a.get]: 1 } });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active || !canMixTrade(ctx, player)) return [];
    return RESOURCES.flatMap((give) =>
      RESOURCES.flatMap((extra) =>
        RESOURCES.filter((g) => g !== give).map((get) => ({
          type: 'mixTrade',
          player,
          give,
          extra,
          get,
        })),
      ),
    );
  },
});

// ---- Knights and Road Building ----

type KnightUse = 'robber' | 'move' | 'chase';

function knightCheck(ctx: Ctx, a: Action): string | null {
  const use = (a.use ?? 'robber') as KnightUse;
  if (use === 'robber') return null;
  if (use === 'move') return ctx.state.phase.id === 'main' ? null : 'Move after rolling';
  if (use !== 'chase') return 'Pick what the knight does';
  const v = pieceOf(ctx, a.target);
  if (!v || v.owner === null || v.owner === a.player) return "Pick a rival's train or ship";
  if (v.type !== 'train' && v.type !== 'ferry') return 'Planes can not be chased';
  if (v.at.kind !== 'hex') return 'Only vehicles in a field can be chased';
  const to = chaseTargets(ctx, v);
  if (to.length && !to.includes(a.to as HexId)) return 'Pick a field next to it';
  return null;
}

function roadBuildingCheck(ctx: Ctx, a: Action): string | null {
  const type = a.vehicle as Vehicle;
  if (!isVehicle(type)) return 'Pick a vehicle to build';
  if (ctx.state.phase.id !== 'main') return 'Build after rolling';
  if (movedThisTurn(ctx)) return NO_BUILD_AFTER_MOVING;
  const why = canBuildVehicle(ctx, a.player, type, a.corner as CornerId);
  if (why) return why;
  if (type !== 'plane') return null;
  const save = (a.save ?? {}) as Record<string, number>;
  const cost = ctx.cost('plane', a.player) as Record<string, number>;
  let n = 0;
  for (const [c, k] of Object.entries(save)) {
    if (!Number.isInteger(k) || k < 0 || k > (cost[c] ?? 0)) return 'Save cards from its cost';
    n += k;
  }
  if (
    n !==
    Math.min(
      PLANE_SAVING,
      Object.values(cost).reduce((s, k) => s + k, 0),
    )
  )
    return `Save ${PLANE_SAVING} cards`;
  return ctx.has(a.player, planeBill(ctx, a.player, save)) ? null : 'You can not afford the rest';
}

function planeBill(ctx: Ctx, seat: number, save: Record<string, number>): Cards {
  const out: Record<string, number> = {};
  for (const [c, k] of Object.entries(ctx.cost('plane', seat)))
    if ((k ?? 0) - (save[c] ?? 0) > 0) out[c] = (k ?? 0) - (save[c] ?? 0);
  return out;
}

const wrapPlayDev = (prev: ActionDef): ActionDef => ({
  ...prev,
  check(ctx, a) {
    // Several development cards may be played in a turn: check as if none had been.
    const data = (ctx.state.players[a.player]?.data ?? {}) as { devPlayedTurn?: number };
    const played = data.devPlayedTurn;
    delete data.devPlayedTurn;
    let why: string | null;
    try {
      why = prev.check(ctx, a);
    } finally {
      if (played !== undefined) data.devPlayedTurn = played;
    }
    if (
      a.card === 'roadBuilding' &&
      (why === 'No roads left' || why === 'There is nowhere to build a road')
    )
      why = null;
    if (why) return why;
    if (a.card === 'knight') return knightCheck(ctx, a);
    if (a.card === 'roadBuilding') return roadBuildingCheck(ctx, a);
    return null;
  },
  apply(ctx, a) {
    const before = ctx.state.phase;
    prev.apply(ctx, a);
    if (a.card === 'knight' && a.use && a.use !== 'robber') {
      ctx.setPhase(before);
      if (a.use === 'move') {
        const d = lwData(ctx);
        const points = boostLeft(ctx, a.player) + KNIGHT_MOVES;
        d.boost = { turn: ctx.state.turn.number, seat: a.player, points };
        ctx.emit({ type: 'knightSpeed', player: a.player, points: KNIGHT_MOVES });
      } else {
        const v = pieceOf(ctx, a.target) as Piece;
        const to = chaseTargets(ctx, v);
        if (to.length) {
          ctx.move(v, { kind: 'hex', id: a.to as HexId });
          ctx.emit({
            type: 'vehicleChased',
            player: a.player,
            owner: v.owner,
            piece: v.type,
            to: a.to,
          });
        } else {
          ctx.remove(v);
          ctx.emit({ type: 'vehicleSunk', player: a.player, owner: v.owner, piece: v.type });
        }
      }
    }
    if (a.card === 'roadBuilding') {
      ctx.setPhase(before);
      const type = a.vehicle as Vehicle;
      const bill =
        type === 'plane' ? planeBill(ctx, a.player, (a.save ?? {}) as Record<string, number>) : {};
      ctx.pay(a.player, bill);
      placeVehicle(ctx, a.player, type, a.corner as CornerId, bill);
    }
  },
  enumerate(ctx, player) {
    const out = (prev.enumerate?.(ctx, player) ?? []).filter(
      (x) => x.card !== 'roadBuilding' && x.card !== 'knight',
    );
    if (player !== ctx.active) return out;
    out.push({ type: 'playDevCard', player, card: 'knight', use: 'robber' });
    out.push({ type: 'playDevCard', player, card: 'knight', use: 'move' });
    for (const p of ctx.state.players) {
      if (p.seat === player) continue;
      for (const v of vehiclesOf(ctx, p.seat)) {
        const to = chaseTargets(ctx, v);
        if (!to.length)
          out.push({ type: 'playDevCard', player, card: 'knight', use: 'chase', target: v.id });
        for (const h of to)
          out.push({
            type: 'playDevCard',
            player,
            card: 'knight',
            use: 'chase',
            target: v.id,
            to: h,
          });
      }
    }
    const corners = buildingCorners(ctx, player);
    for (const corner of corners) {
      out.push({ type: 'playDevCard', player, card: 'roadBuilding', vehicle: 'train', corner });
      out.push({ type: 'playDevCard', player, card: 'roadBuilding', vehicle: 'ferry', corner });
      out.push({
        type: 'playDevCard',
        player,
        card: 'roadBuilding',
        vehicle: 'plane',
        corner,
        save: { ore: 1, brick: 1, grain: 1 },
      });
    }
    return out;
  },
});

// ---- The module ----

const NO_ROADS = 'Land & Water has no roads: build vehicles instead';
const noRoads = (prev: ActionDef): ActionDef => ({
  ...prev,
  check: () => NO_ROADS,
  enumerate: () => [],
});

/** Moves the setup on without a road. */
function nextSetup(ctx: Ctx): void {
  const ph = ctx.state.phase as unknown as { index: number };
  const next = ph.index + 1;
  if (next >= ctx.playerCount * setupRounds(ctx)) {
    ctx.state.turn = { number: 1, player: 0, round: 0 };
    ctx.setPhase({ id: 'roll' });
    ctx.emit({ type: 'turnStarted', player: 0, turn: 1 });
    ctx.hook('turnStarted');
  } else {
    ctx.state.turn.player = setupSeat(ctx, next);
    ctx.setPhase({ id: 'setup', index: next, step: 'settlement' });
  }
}

export const landWaterModule: GameModule = {
  id: MODULE_ID,
  name: 'Land & Water',
  requires: ['base'],
  pieceTypes: Object.fromEntries(
    VEHICLES.map((v) => [v, { on: 'corner' as const, perPlayer: () => VEHICLE_SUPPLY[v] }]),
  ),
  costs: {
    ...VEHICLE_COST,
    ...Object.fromEntries(VEHICLES.map((v) => [`activate:${v}`, ACTIVATE_COST[v]])),
  },
  actions: { buildVehicle, activateVehicle, moveVehicle, mixTrade, pickResources },
  wrapActions: {
    buildRoad: noRoads,
    placeSetupRoad: noRoads,
    placeFreeRoad: noRoads,
    playDevCard: wrapPlayDev,
    roll: (prev) => ({
      ...prev,
      apply(ctx, a) {
        prev.apply(ctx, a);
        const total = (baseData(ctx) as { lastRoll?: { total: number } }).lastRoll?.total;
        if (total && total !== 7) vehicleYields(ctx, total);
      },
    }),
    buildSettlement: (prev) => ({
      ...prev,
      check(ctx, a) {
        const corner = a.corner as CornerId;
        if (a.player !== ctx.active) return 'Not your turn';
        if (movedThisTurn(ctx)) return NO_BUILD_AFTER_MOVING;
        if (!ctx.has(a.player, ctx.cost('settlement', a.player)))
          return 'You can not afford a settlement';
        if (!ctx.geometry.cornerHexes.has(corner)) return 'That corner is not on the board';
        if (!vehicleAtCorner(ctx, a.player, corner))
          return 'Settlements go where one of your active vehicles stands';
        if (!ctx.isLandCorner(corner)) return 'Settlements must touch land';
        if (!distanceRuleOk(ctx, corner)) return 'Too close to another settlement or city';
        if (ctx.supplyLeft(a.player, 'settlement') <= 0) return 'No settlements left';
        return null;
      },
      apply(ctx, a) {
        const v = vehicleAtCorner(ctx, a.player, a.corner as CornerId);
        prev.apply(ctx, a);
        if (v) v.props.passive = true;
      },
      enumerate(ctx, player) {
        if (player !== ctx.active) return [];
        return vehiclesOf(ctx, player)
          .filter((v) => isActive(v) && v.at.kind === 'corner')
          .map((v) => ({ type: 'buildSettlement', player, corner: (v.at as { id: string }).id }));
      },
    }),
  },
  wrapActionsIfPresent: {
    buildShip: noRoads,
    moveShip: noRoads,
    placeFreeShip: noRoads,
    placeSetupShip: noRoads,
  },
  hooks: {
    init(ctx) {
      lwData(ctx);
    },
    afterAction(ctx) {
      const ph = ctx.state.phase as unknown as { id: string; step?: string };
      if (ph.id === 'setup' && ph.step === 'road') nextSetup(ctx);
      updateMostVehicles(ctx);
    },
  },
  reducers: {
    vp(ctx, seat, value) {
      return value + (lwData(ctx).mostVehicles === seat ? MOST_VEHICLES_VP : 0);
    },
    handLimit(_ctx, _seat, value) {
      return value + HAND_LIMIT_EXTRA;
    },
    tradeRatio(ctx, seat, card, value) {
      const mine = harborRatio(ctx, seat, card);
      // The pirate can close a harbor the base rules count: go by ours when nothing else lowered it.
      return value === buildingRatio(ctx, seat, card) ? mine : Math.min(value, mine);
    },
  },
};

export * from './rules.ts';
