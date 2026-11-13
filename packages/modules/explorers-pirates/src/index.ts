import {
  type Action,
  type ActionDef,
  type CornerId,
  type Ctx,
  type EdgeId,
  type GameModule,
  type HexId,
  type Piece,
} from '@colonizers/engine';
import { distanceRuleOk, RESOURCES, setupRounds, setupSeat } from '@colonizers/module-base';
import {
  MODULE_ID,
  EP_VP_BONUS,
  GOLD,
  SHIP_MOVES,
  BOOST_MOVES,
  CARGO_SIZE,
  SETTLERS,
  GOLD_PRICE,
  GOLD_BUYS,
  STARTING_GOLD,
  epData,
  action,
  onlyActive,
  canAfford,
  hidden,
  nearFog,
  edgeNearFog,
  navigable,
  coastal,
  shipAt,
  cargoOf,
  cargoRoom,
  settlersOut,
  harborBeside,
  movesLeft,
  sailRange,
  discover,
  sailPlan,
  scenarioOf,
  hasPirate,
  toSail,
  ownShip,
} from './rules.ts';

import { CAPTURED_FIELD_GOLD, lairActions, lairWraps, missionSteps } from './lairs.ts';
import { catchFish, goodsActions, goodsOf } from './goods.ts';

export * from './rules.ts';
export * from './lairs.ts';
export * from './goods.ts';

/**
 * Explorers & Pirates, starting with Land Ho!
 *
 * - No cities, robber, development cards, Longest Road or Largest Army.
 * - Settlements on the coast become harbor settlements (2 points). Ships are
 *   built beside them, carry a settler or crews, and sail up to 4 edges a
 *   turn (2 more for a wool). A ship that reaches the fog turns over what it
 *   touches: a resource for land, 2 gold for anything else.
 * - A ship with a settler beside free land founds a settlement there; the
 *   ship and the settler go back to the supply.
 * - Gold is money: 2 gold buys a resource (twice a turn), 3 of one resource
 *   sell for a gold, and a roll that gives you nothing pays you 1 gold.
 * - A turn goes roll, then trade and build, then sail. Once a ship sails,
 *   only sailing, unloading and founding settlements are left.
 */

// ---- Setup ----

interface SetupPhase {
  id: 'setup';
  index: number;
  step: 'settlement' | 'road';
  settlement?: CornerId;
}

const setupPhase = (ctx: Ctx) => ctx.state.phase as unknown as SetupPhase;

/** The first starting building is the harbor settlement, with a ship beside it. */
const harborRound = (ctx: Ctx) => setupPhase(ctx).index < ctx.playerCount;

function finishSetupStep(ctx: Ctx): void {
  const next = setupPhase(ctx).index + 1;
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

const placeSetupShip = action<{ edge: EdgeId }>({
  phases: ['setup'],
  check(ctx, a) {
    const ph = setupPhase(ctx);
    if (ph.step !== 'road') return 'Place a settlement first';
    if (a.player !== ctx.active) return 'Not your turn';
    if (!harborRound(ctx)) return 'Your second settlement gets a road';
    const corners = ctx.geometry.edgeCorners.get(a.edge);
    if (!corners || !ph.settlement || !corners.includes(ph.settlement))
      return 'The ship must touch the harbor settlement you just placed';
    if (!navigable(ctx, a.edge)) return 'Ships must sail next to the sea';
    if (shipAt(ctx, a.edge)) return 'That edge is taken';
    return null;
  },
  apply(ctx, a) {
    ctx.place('ship', a.player, { kind: 'edge', id: a.edge }, { cargo: ['settler'], used: 0 });
    ctx.emit({ type: 'built', player: a.player, piece: 'ship', at: a.edge });
    finishSetupStep(ctx);
  },
  enumerate(ctx, player) {
    const ph = setupPhase(ctx);
    if (player !== ctx.active || ph.step !== 'road' || !ph.settlement) return [];
    return (ctx.geometry.cornerEdges.get(ph.settlement) ?? []).map((edge) => ({
      type: 'placeSetupShip',
      player,
      edge,
    }));
  },
});

// ---- Building ----

const buildShip = action<{ edge: EdgeId }>({
  phases: ['main'],
  check(ctx, a) {
    const err = onlyActive(ctx, a) ?? canAfford(ctx, a.player, 'ship');
    if (err) return err;
    if (!ctx.geometry.edgeCorners.has(a.edge)) return 'That edge is not on the board';
    if (ctx.supplyLeft(a.player, 'ship') <= 0) return 'No ships left';
    if (!harborBeside(ctx, a.player, a.edge))
      return 'Ships are built beside one of your harbor settlements';
    if (!navigable(ctx, a.edge)) return 'Ships must sail next to the sea';
    if (edgeNearFog(ctx, a.edge)) return 'Explore the fog beside that edge first';
    if (shipAt(ctx, a.edge)) return 'That edge is taken';
    return null;
  },
  apply(ctx, a) {
    ctx.pay(a.player, ctx.cost('ship', a.player));
    ctx.place('ship', a.player, { kind: 'edge', id: a.edge }, { cargo: [], used: 0 });
    ctx.emit({ type: 'built', player: a.player, piece: 'ship', at: a.edge });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active || !ctx.has(player, ctx.cost('ship', player))) return [];
    const out: Action[] = [];
    for (const h of ctx.piecesOf(player, 'harbor'))
      if (h.at.kind === 'corner')
        for (const edge of ctx.geometry.cornerEdges.get(h.at.id) ?? [])
          out.push({ type: 'buildShip', player, edge });
    return out;
  },
});

const buildHarbor = action<{ corner: CornerId }>({
  phases: ['main'],
  check(ctx, a) {
    const err = onlyActive(ctx, a) ?? canAfford(ctx, a.player, 'harbor', 'a harbor settlement');
    if (err) return err;
    const b = ctx.buildingAt(a.corner);
    if (!b || b.type !== 'settlement' || b.owner !== a.player)
      return 'A harbor settlement replaces one of your settlements';
    if (!coastal(ctx, a.corner)) return 'Harbor settlements stand on the coast';
    if (ctx.supplyLeft(a.player, 'harbor') <= 0) return 'No harbor settlements left';
    return null;
  },
  apply(ctx, a) {
    ctx.pay(a.player, ctx.cost('harbor', a.player));
    const harbor = ctx.upgrade(ctx.buildingAt(a.corner)!, 'harbor');
    harbor.props.cargo = [];
    ctx.emit({ type: 'built', player: a.player, piece: 'harbor', at: a.corner });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    return ctx
      .piecesOf(player, 'settlement')
      .map((p) => ({ type: 'buildHarbor', player, corner: (p.at as { id: CornerId }).id }));
  },
});

/** A settler goes onto one of your harbors, or a ship moored beside one. */
const buildSettler = action<{ at: string }>({
  phases: ['main'],
  check(ctx, a) {
    const err = onlyActive(ctx, a) ?? canAfford(ctx, a.player, 'settler');
    if (err) return err;
    if (settlersOut(ctx, a.player) >= SETTLERS) return 'No settlers left';
    const p = ctx.state.pieces[a.at];
    if (!p || p.owner !== a.player) return 'Put the settler on your harbor or ship';
    if (p.type === 'ship') {
      if (p.at.kind !== 'edge' || !harborBeside(ctx, a.player, p.at.id))
        return 'The ship must be beside one of your harbor settlements';
    } else if (p.type !== 'harbor') return 'Put the settler on your harbor or ship';
    if (cargoRoom(p) < CARGO_SIZE.settler!) return 'There is no room for a settler there';
    return null;
  },
  apply(ctx, a) {
    ctx.pay(a.player, ctx.cost('settler', a.player));
    const p = ctx.state.pieces[a.at]!;
    p.props.cargo = [...cargoOf(p), 'settler'];
    ctx.emit({ type: 'built', player: a.player, piece: 'settler', at: a.at });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active || !ctx.has(player, ctx.cost('settler', player))) return [];
    return ctx
      .piecesOf(player)
      .filter((p) => p.type === 'harbor' || p.type === 'ship')
      .map((p) => ({ type: 'buildSettler', player, at: p.id }));
  },
});

// ---- Sailing ----

const sailShip = action<{ ship: string; to: EdgeId }>({
  phases: ['main', 'sail'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    const ship = ownShip(ctx, a.player, a.ship);
    if (typeof ship === 'string') return ship;
    if (movesLeft(ship) <= 0) return 'That ship has no moves left this turn';
    if (!sailRange(ctx, ship).has(a.to)) return 'The ship can not reach there this turn';
    return null;
  },
  apply(ctx, a) {
    const ship = ctx.state.pieces[a.ship]!;
    const { moves: cost, tribute } = sailPlan(ctx, ship).get(a.to)!;
    const from = (ship.at as { id: EdgeId }).id;
    toSail(ctx);
    if (tribute) {
      ctx.pay(a.player, { [GOLD]: tribute });
      ctx.emit({ type: 'tributePaid', player: a.player, gold: tribute });
    }
    ship.props.used = Number(ship.props.used ?? 0) + cost;
    ctx.move(ship, { kind: 'edge', id: a.to });
    ctx.emit({ type: 'shipSailed', player: a.player, from, to: a.to, moves: cost });
    // Turning over the fog ends this ship's voyage for the turn.
    if (discover(ctx, ship)) ship.props.used = SHIP_MOVES + BOOST_MOVES;
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    const out: Action[] = [];
    for (const ship of ctx.piecesOf(player, 'ship'))
      for (const to of sailRange(ctx, ship).keys())
        out.push({ type: 'sailShip', player, ship: ship.id, to });
    return out;
  },
});

const boostShip = action<{ ship: string }>({
  phases: ['main', 'sail'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    const ship = ownShip(ctx, a.player, a.ship);
    if (typeof ship === 'string') return ship;
    if (ship.props.boost === true) return 'That ship already has extra sails this turn';
    if (movesLeft(ship) <= 0) return 'That ship has finished for this turn';
    if (!ctx.has(a.player, ctx.cost('boost', a.player))) return 'Extra sails cost a wool';
    return null;
  },
  apply(ctx, a) {
    ctx.pay(a.player, ctx.cost('boost', a.player));
    toSail(ctx);
    ctx.state.pieces[a.ship]!.props.boost = true;
    ctx.emit({ type: 'shipBoosted', player: a.player, ship: a.ship });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    return ctx.piecesOf(player, 'ship').map((s) => ({ type: 'boostShip', player, ship: s.id }));
  },
});

/** A ship beside one of your harbors swaps what it carries with the harbor's dock. */
const swapCargo = action<{ ship: string }>({
  phases: ['main', 'sail'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    const ship = ownShip(ctx, a.player, a.ship);
    if (typeof ship === 'string') return ship;
    const harbor = harborBeside(ctx, a.player, (ship.at as { id: EdgeId }).id);
    if (!harbor) return 'The ship must be beside one of your harbor settlements';
    if (goodsOf(ship).length) return 'Deliver the fish and spice first';
    if (!cargoOf(ship).length && !cargoOf(harbor).length) return 'There is nothing to load';
    return null;
  },
  apply(ctx, a) {
    const ship = ctx.state.pieces[a.ship]!;
    const harbor = harborBeside(ctx, a.player, (ship.at as { id: EdgeId }).id)!;
    const aboard = cargoOf(ship);
    ship.props.cargo = cargoOf(harbor);
    harbor.props.cargo = aboard;
    ctx.emit({
      type: 'cargoSwapped',
      player: a.player,
      loaded: ship.props.cargo,
      unloaded: aboard,
    });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    return ctx.piecesOf(player, 'ship').map((s) => ({ type: 'swapCargo', player, ship: s.id }));
  },
});

export function canFound(ctx: Ctx, seat: number, ship: Piece, corner: CornerId): string | null {
  if (!cargoOf(ship).includes('settler')) return 'The ship has no settler aboard';
  const ends: readonly CornerId[] =
    ship.at.kind === 'edge' ? (ctx.geometry.edgeCorners.get(ship.at.id) ?? []) : [];
  if (!ends.includes(corner)) return 'The settler goes ashore at one end of the ship';
  if (!ctx.isLandCorner(corner)) return 'Settlements must touch land';
  if (nearFog(ctx, corner)) return 'Explore the fog around that corner first';
  if (ctx.piecesAt({ kind: 'corner', id: corner }).length) return 'That corner is taken';
  if (!distanceRuleOk(ctx, corner)) return 'Too close to another settlement';
  if (ctx.supplyLeft(seat, 'settlement') <= 0) return 'No settlements left';
  return null;
}

const foundSettlement = action<{ ship: string; corner: CornerId }>({
  phases: ['main', 'sail'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    const ship = ownShip(ctx, a.player, a.ship);
    if (typeof ship === 'string') return ship;
    return canFound(ctx, a.player, ship, a.corner);
  },
  apply(ctx, a) {
    const ship = ctx.state.pieces[a.ship]!;
    // The settler becomes the settlement; the ship goes home to be built again.
    const cargo = [...cargoOf(ship)];
    cargo.splice(cargo.indexOf('settler'), 1);
    ctx.remove(ship);
    ctx.place('settlement', a.player, { kind: 'corner', id: a.corner });
    ctx.emit({ type: 'founded', player: a.player, at: a.corner, lost: cargo });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    const out: Action[] = [];
    for (const ship of ctx.piecesOf(player, 'ship')) {
      if (!cargoOf(ship).includes('settler') || ship.at.kind !== 'edge') continue;
      for (const corner of ctx.geometry.edgeCorners.get(ship.at.id) ?? [])
        out.push({ type: 'foundSettlement', player, ship: ship.id, corner });
    }
    return out;
  },
});

// ---- Gold ----

const buyWithGold = action<{ resource: string }>({
  phases: ['main'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    if (!(RESOURCES as readonly string[]).includes(a.resource)) return 'Pick a resource';
    const d = epData(ctx);
    if (d.boughtTurn === ctx.state.turn.number && d.bought >= GOLD_BUYS)
      return `Gold buys at most ${GOLD_BUYS} resources a turn`;
    if (!ctx.has(a.player, { [GOLD]: GOLD_PRICE })) return `You need ${GOLD_PRICE} gold`;
    if (!ctx.bankHas({ [a.resource]: 1 })) return 'The bank has none left';
    return null;
  },
  apply(ctx, a) {
    const d = epData(ctx);
    if (d.boughtTurn !== ctx.state.turn.number) {
      d.boughtTurn = ctx.state.turn.number;
      d.bought = 0;
    }
    d.bought++;
    ctx.pay(a.player, { [GOLD]: GOLD_PRICE });
    ctx.grant(a.player, { [a.resource]: 1 });
    ctx.emit({ type: 'boughtWithGold', player: a.player, resource: a.resource, gold: GOLD_PRICE });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    return RESOURCES.map((resource) => ({ type: 'buyWithGold', player, resource }));
  },
});

// ---- The module ----

export const explorersPiratesModule: GameModule = {
  id: MODULE_ID,
  name: 'Explorers & Pirates',
  requires: ['base'],
  conflicts: ['seafarers', 'cities-knights', 'traders-barbarians', 'treasures-dragons'],
  settings: {
    epScenario: 'land-ho',
    /** The home island, where the starting buildings go. */
    setupHexes: null,
  },
  cardTypes: {
    [GOLD]: { category: 'gold', countsForHandLimit: false, bank: () => 200 },
  },
  hexTypes: {
    // Gold fields hold pirate lairs; once captured they pay gold.
    gold: { terrain: 'land', robber: false },
    // Fishing grounds: open sea with a number, fished by the ships beside them.
    shoal: { terrain: 'sea', robber: false },
  },
  pieceTypes: {
    pirate: { on: 'hex' },
    ship: { on: 'edge', perPlayer: () => 3 },
    harbor: { on: 'corner', perPlayer: () => 4, building: true, vp: 2, production: 1 },
  },
  costs: {
    ship: { lumber: 1, wool: 1 },
    harbor: { grain: 2, ore: 2 },
    settler: { brick: 1, lumber: 1, wool: 1, grain: 1 },
    boost: { wool: 1 },
    crew: { ore: 1, wool: 1 },
  },
  actions: {
    placeSetupShip,
    buildShip,
    buildHarbor,
    buildSettler,
    sailShip,
    boostShip,
    swapCargo,
    foundSettlement,
    buyWithGold,
    ...lairActions,
    ...goodsActions,
  },
  wrapActions: {
    ...lairWraps,
    placeSetupSettlement: (prev): ActionDef => ({
      ...prev,
      check(ctx, a) {
        const corner = a.corner as CornerId;
        const home = ctx.setting<HexId[] | null>('setupHexes');
        if (home?.length) {
          const touching = ctx.geometry.cornerHexes.get(corner) ?? [];
          if (!touching.some((h) => home.includes(h)))
            return 'Starting settlements go on the home island';
        }
        const why = prev.check(ctx, a);
        if (why) return why;
        if (harborRound(ctx) && !coastal(ctx, corner))
          return 'Your harbor settlement goes on the coast';
        return null;
      },
      apply(ctx, a) {
        if (!harborRound(ctx)) return prev.apply(ctx, a);
        const corner = a.corner as CornerId;
        ctx.place('harbor', a.player, { kind: 'corner', id: corner }, { cargo: [] });
        ctx.emit({ type: 'built', player: a.player, piece: 'harbor', at: corner });
        ctx.setPhase({ ...setupPhase(ctx), step: 'road', settlement: corner });
      },
    }),
    placeSetupRoad: (prev): ActionDef => ({
      ...prev,
      check(ctx, a) {
        if (setupPhase(ctx).step === 'road' && harborRound(ctx))
          return 'Your harbor settlement gets a ship';
        return prev.check(ctx, a);
      },
    }),
    buildRoad: (prev): ActionDef => ({
      ...prev,
      check(ctx, a) {
        const why = prev.check(ctx, a);
        if (why) return why;
        const hexes = ctx.geometry.edgeHexes.get(a.edge as EdgeId) ?? [];
        return hexes.some((h) => hidden(ctx, h)) ? 'Explore the fog beside that edge first' : null;
      },
    }),
    buildSettlement: (prev): ActionDef => ({
      ...prev,
      check(ctx, a) {
        const why = prev.check(ctx, a);
        if (why) return why;
        return nearFog(ctx, a.corner as CornerId)
          ? 'Explore the fog around that corner first'
          : null;
      },
    }),
    buildCity: (prev): ActionDef => ({
      ...prev,
      check: () => 'There are no cities in Explorers & Pirates: build a harbor settlement',
      enumerate: () => [],
    }),
    buyDevCard: (prev): ActionDef => ({
      ...prev,
      check: () => 'There are no development cards in Explorers & Pirates',
      enumerate: () => [],
    }),
    bankTrade: (prev): ActionDef => ({
      ...prev,
      enumerate(ctx, player) {
        const out = prev.enumerate?.(ctx, player) ?? [];
        if (player !== ctx.active) return out;
        // Three of a kind sell for a gold.
        return [
          ...out,
          ...RESOURCES.map((give) => ({ type: 'bankTrade', player, give, get: GOLD })),
        ];
      },
    }),
    endTurn: (prev): ActionDef => ({ ...prev, phases: [...(prev.phases ?? ['main']), 'sail'] }),
  },
  hooks: {
    init(ctx) {
      const d = epData(ctx);
      for (const r of ctx.piecesOfType('robber')) ctx.remove(r);
      // Every gold field holds a pirate lair.
      if (hasPirate(ctx))
        for (const h of Object.values(ctx.state.hexes)) if (h.type === 'gold') d.lairs[h.id] = {};
      // No development cards, Longest Road or Largest Army.
      ctx.state.decks.dev = [];
      ctx.state.settings.longestRoadMin = 99;
      ctx.state.settings.largestArmyMin = 99;
      for (const p of ctx.state.players) ctx.grant(p.seat, { [GOLD]: STARTING_GOLD });
    },
    turnStarted(ctx) {
      for (const ship of ctx.piecesOfType('ship')) {
        ship.props.used = 0;
        ship.props.boost = false;
      }
    },
    afterAction(ctx, a) {
      // No robber: a 7 only makes big hands discard.
      if (ctx.state.phase.id === 'moveRobber' && !hasPirate(ctx)) {
        const returnTo = (ctx.state.phase.returnTo as string | undefined) ?? 'main';
        ctx.setPhase({ id: returnTo });
      }
      if (a.type !== 'roll') return;
      const prod = ctx.events.find((e) => e.type === 'production');
      if (!prod) return;
      const fish = catchFish(ctx, prod.total as number);
      // A roll that brings you nothing pays 1 gold.
      const received = (prod.received ?? {}) as Record<number, Record<string, number>>;
      const paid: number[] = [];
      for (const p of ctx.state.players) {
        const got =
          Object.values(received[p.seat] ?? {}).reduce((s, n) => s + n, 0) + (fish[p.seat] ?? 0);
        if (got > 0 || !ctx.bankHas({ [GOLD]: 1 })) continue;
        ctx.grant(p.seat, { [GOLD]: 1 });
        paid.push(p.seat);
      }
      if (paid.length) ctx.emit({ type: 'goldForNothing', players: paid });
    },
  },
  reducers: {
    tradeRatio: (_ctx, _seat, _card, value) => Math.min(value, 3),
    vpTarget: (ctx, value) => value + (EP_VP_BONUS[scenarioOf(ctx)] ?? 0),
    supply: (_ctx, _seat, type, value) => (type === 'city' ? 0 : value),
    vp: (ctx, seat, value) => value + missionSteps(ctx, seat),
    hexYield(ctx, hex, piece, value) {
      if (hex.type !== 'gold') return value;
      const n = ctx.registry.pieceTypes[piece.type]?.production ?? 0;
      return epData(ctx).captured.includes(hex.id) && n > 0
        ? { [GOLD]: CAPTURED_FIELD_GOLD * n }
        : {};
    },
  },
};
