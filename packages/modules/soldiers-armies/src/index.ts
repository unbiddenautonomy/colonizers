import type {
  Action,
  ActionDef,
  CornerId,
  Ctx,
  EdgeId,
  GameModule,
  Piece,
} from '@colonizers/engine';
import { connectsAt } from '@colonizers/module-base';
import {
  ARMY,
  ARMY_STEP_COST,
  DEV_HOLD_MAX,
  FREE_STEPS,
  HAND_LIMIT,
  MAX_WALLS,
  MODULE_ID,
  NUKE,
  NUKE_COST,
  ROBBER_DIE,
  UNIT_COSTS,
  UNIT_LIMIT,
  UNITS,
  WALL_COST,
  WALL_HAND,
  type Unit,
} from './constants.ts';
import {
  armyAt,
  armyDie,
  cornerOf,
  enemyArmyAt,
  freeSteps,
  marchTargets,
  nextToRobber,
  setTurnFlag,
  soldiersData,
  turnFlag,
  unitsInPlay,
  unitsOf,
  wallsOf,
  isOut,
} from './rules.ts';
import { answerBattleCall, attack, battleRetreat, battleRoll } from './battle.ts';
import { capitulate, checkLastStanding, skipIfOut } from './fate.ts';
import { buyNuke, detonateNuke } from './nuke.ts';

export { nukeOf, nukeTargets } from './nuke.ts';
export { beaten } from './fate.ts';
export type { BattlePhase } from './battle.ts';

/**
 * Soldiers & Armies (Soldaten & Armeen, from siedlerinsel.wordpress.com), a
 * fan expansion for the base game:
 *
 * - Players buy **infantry, cavalry and artillery** at their own buildings.
 *   The units on one corner make an army, one army to a corner.
 * - After building, a player can take the field: each army **marches** three
 *   corners free, and further for 1 lumber and 1 grain a corner. It can't stop
 *   on a rival's building, it keeps rivals from building roads past it, and
 *   no one can settle where it stands.
 * - An army next to a rival army or building can **attack**. Both sides roll
 *   (infantry d6, cavalry d10, artillery d12; settlement d8, city d12, +1 per
 *   wall) and a tie goes to the defender. A beaten army steps its best unit
 *   down; a beaten building is first damaged, then drops a level. A settlement
 *   that falls is captured, with the roads that are cut off with it. The
 *   attacker can break off at any time and falls back one corner.
 * - An army next to the robber can **fight it** once a turn: win and move it,
 *   lose and give up a resource.
 * - **City walls** (3 brick, three to a city) add 1 to its defence and keep
 *   2 more cards on a 7, on top of 10.
 * - Development cards aren't bought: a player who bought and played nothing
 *   may draw one free before marching, and holds at most four. No Victory
 *   Point cards, no Largest Army. Everyone starts with a settlement and a
 *   city, and plays to 13.
 */

export * from './constants.ts';
export {
  armyAt,
  armyDie,
  attackTargets,
  buildingDie,
  freeSteps,
  marchTargets,
  nextToRobber,
  retreatCorners,
  soldiersData,
  turnFlag,
  unitsOf,
  wallsOf,
  hexDistance,
  isOut,
  type SoldiersData,
  type Target,
  type Units,
} from './rules.ts';

/** Defines an action with a typed payload. */
function action<T>(def: ActionDef<Action & T>): ActionDef {
  return def as unknown as ActionDef;
}

const onlyActive = (ctx: Ctx, a: Action) => (a.player === ctx.active ? null : 'Not your turn');

const isUnit = (u: unknown): u is Unit => (UNITS as readonly unknown[]).includes(u);

function ownArmy(ctx: Ctx, seat: number, id: unknown): Piece | undefined {
  const p = typeof id === 'string' ? ctx.state.pieces[id] : undefined;
  return p && p.type === ARMY && p.owner === seat && p.at.kind === 'corner' ? p : undefined;
}

const ownBuildingCorners = (ctx: Ctx, seat: number): CornerId[] =>
  ctx
    .piecesOf(seat)
    .filter((p) => ctx.registry.pieceTypes[p.type]?.building && p.at.kind === 'corner')
    .map((p) => cornerOf(p) as CornerId);

// ---- Building up ----

const buyUnit = action<{ unit: Unit; corner: CornerId }>({
  phases: ['main'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    if (!isUnit(a.unit)) return 'Pick infantry, cavalry or artillery';
    if (ctx.buildingAt(a.corner)?.owner !== a.player)
      return 'Units muster at one of your settlements or cities';
    const there = armyAt(ctx, a.corner);
    if (there && there.owner !== a.player) return 'Another army stands there';
    if (unitsInPlay(ctx, a.player, a.unit) >= UNIT_LIMIT[a.unit]) return `No ${a.unit} left`;
    if (!ctx.has(a.player, ctx.cost(a.unit, a.player))) return 'You can not afford that';
    return null;
  },
  apply(ctx, a) {
    ctx.pay(a.player, ctx.cost(a.unit, a.player));
    const there = armyAt(ctx, a.corner);
    if (there) there.props[a.unit] = unitsOf(there)[a.unit] + 1;
    else ctx.place(ARMY, a.player, { kind: 'corner', id: a.corner }, { [a.unit]: 1 });
    ctx.emit({ type: 'unitBought', player: a.player, unit: a.unit, at: a.corner });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    return ownBuildingCorners(ctx, player).flatMap((corner) =>
      UNITS.map((unit) => ({ type: 'buyUnit', player, unit, corner })),
    );
  },
});

const buildWall = action<{ corner: CornerId }>({
  phases: ['main'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    const b = ctx.buildingAt(a.corner);
    if (!b || b.owner !== a.player || b.type === 'settlement')
      return 'Walls go around one of your cities';
    if (wallsOf(b) >= MAX_WALLS) return `A city takes at most ${MAX_WALLS} walls`;
    if (!ctx.has(a.player, ctx.cost('wall', a.player))) return 'You can not afford a wall';
    return null;
  },
  apply(ctx, a) {
    ctx.pay(a.player, ctx.cost('wall', a.player));
    const b = ctx.buildingAt(a.corner) as Piece;
    b.props.walls = wallsOf(b) + 1;
    ctx.emit({ type: 'wallBuilt', player: a.player, at: a.corner });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    return ownBuildingCorners(ctx, player).map((corner) => ({ type: 'buildWall', player, corner }));
  },
});

/** A quiet turn: nothing bought and no card played, so a development card comes free. */
const drawFreeDevCard = action<object>({
  phases: ['main'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    if (turnFlag(ctx, 'bought')) return 'Only after a turn without buying anything';
    if ((ctx.player(a.player).data.devPlayedTurn as number | undefined) === ctx.state.turn.number)
      return 'Only after a turn without playing a development card';
    if ((ctx.player(a.player).held.dev ?? []).length >= DEV_HOLD_MAX)
      return `You can hold at most ${DEV_HOLD_MAX} development cards`;
    if (!ctx.state.decks.dev?.length) return 'No development cards left';
    return null;
  },
  apply(ctx, a) {
    const card = ctx.drawCard('dev') as string;
    (ctx.player(a.player).held.dev ??= []).push({ card, acquiredTurn: ctx.state.turn.number });
    ctx.emit({
      type: 'freeDevCard',
      player: a.player,
      card,
      visibleTo: [a.player],
      redacted: { player: a.player },
    });
    ctx.setPhase({ id: 'campaign' });
  },
  enumerate: (ctx, player) => (player === ctx.active ? [{ type: 'drawFreeDevCard', player }] : []),
});

// ---- Marching ----

/** Building is over: the armies march and fight. */
const takeTheField = action<object>({
  phases: ['main'],
  check: onlyActive,
  apply(ctx) {
    ctx.setPhase({ id: 'campaign' });
  },
  enumerate: (ctx, player) =>
    player === ctx.active && ctx.piecesOf(player, ARMY).length
      ? [{ type: 'takeTheField', player }]
      : [],
});

/** Corners beyond the free ones this player can pay for. */
function paidSteps(ctx: Ctx, seat: number): number {
  const hand = ctx.player(seat).hand;
  const cost = ctx.cost('armyStep', seat);
  let n = Infinity;
  for (const [card, k] of Object.entries(cost))
    if (k > 0) n = Math.min(n, Math.floor((hand[card] ?? 0) / k));
  return n === Infinity ? 0 : n;
}

function stepCost(ctx: Ctx, seat: number, extra: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [card, k] of Object.entries(ctx.cost('armyStep', seat))) out[card] = k * extra;
  return out;
}

const marchArmy = action<{ army: string; to: CornerId }>({
  phases: ['campaign'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    const army = ownArmy(ctx, a.player, a.army);
    if (!army) return 'That is not your army';
    if (turnFlag(ctx, 'fought')) return 'The fighting has begun: no more marching this turn';
    const free = freeSteps(ctx, army);
    const d = marchTargets(ctx, army, free + paidSteps(ctx, a.player)).get(a.to);
    if (d === undefined) return 'The army can not reach that corner';
    return null;
  },
  apply(ctx, a) {
    const army = ownArmy(ctx, a.player, a.army) as Piece;
    const free = freeSteps(ctx, army);
    const d = marchTargets(ctx, army, free + paidSteps(ctx, a.player)).get(a.to) as number;
    const extra = Math.max(0, d - free);
    if (extra) ctx.pay(a.player, stepCost(ctx, a.player, extra));
    army.props.marched = FREE_STEPS - free + d;
    army.props.marchedTurn = ctx.state.turn.number;
    const from = cornerOf(army);
    ctx.move(army, { kind: 'corner', id: a.to });
    ctx.emit({ type: 'armyMarched', player: a.player, from, to: a.to, paid: extra });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active || turnFlag(ctx, 'fought')) return [];
    const paid = paidSteps(ctx, player);
    return ctx.piecesOf(player, ARMY).flatMap((army) =>
      [...marchTargets(ctx, army, freeSteps(ctx, army) + Math.min(paid, 3)).keys()].map((to) => ({
        type: 'marchArmy',
        player,
        army: army.id,
        to,
      })),
    );
  },
});

/** Rivals can't build a road (or ship) on past a corner an army holds. */
const noRoutePastArmies =
  (route: string) =>
  (prev: ActionDef): ActionDef => ({
    ...prev,
    check(ctx, a) {
      const err = prev.check(ctx, a);
      if (err) return err;
      const corners = ctx.geometry.edgeCorners.get(a.edge as EdgeId) ?? [];
      const from = corners.filter((c) => connectsAt(ctx, a.player, c, route));
      return from.length && from.every((c) => enemyArmyAt(ctx, c, a.player))
        ? 'An army holds that corner'
        : null;
    },
  });

/** Once a turn, an army next to the robber can fight it. */
const attackRobber = action<{ army: string }>({
  phases: ['campaign'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    const army = ownArmy(ctx, a.player, a.army);
    if (!army) return 'That is not your army';
    if (turnFlag(ctx, 'robberFought')) return 'You have fought the robber this turn';
    return nextToRobber(ctx, army) ? null : 'The army is not next to the robber';
  },
  apply(ctx, a) {
    setTurnFlag(ctx, 'fought');
    setTurnFlag(ctx, 'robberFought');
    const army = ownArmy(ctx, a.player, a.army) as Piece;
    const dice = [armyDie(army), ROBBER_DIE] as const;
    const rolls = [ctx.rng.int(1, dice[0]), ctx.rng.int(1, dice[1])] as const;
    const won = rolls[0] > rolls[1];
    ctx.emit({ type: 'robberFought', player: a.player, dice, rolls, won });
    if (won) ctx.setPhase({ id: 'moveRobber', returnTo: 'campaign' });
    else if (ctx.handSize(a.player) > 0) ctx.setPhase({ id: 'robberToll' });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    return ctx
      .piecesOf(player, ARMY)
      .map((army) => ({ type: 'attackRobber', player, army: army.id }));
  },
});

/** Beaten by the robber: hand over a resource of your choice. */
const payRobberToll = action<{ card: string }>({
  phases: ['robberToll'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    if (!ctx.registry.cardTypes[a.card]?.countsForHandLimit) return 'Pick a card from your hand';
    return ctx.has(a.player, { [a.card]: 1 }) ? null : 'You do not have that card';
  },
  apply(ctx, a) {
    ctx.pay(a.player, { [a.card]: 1 });
    ctx.emit({ type: 'robberToll', player: a.player, card: a.card });
    ctx.setPhase({ id: 'campaign' });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    return Object.entries(ctx.player(player).hand)
      .filter(([, n]) => n > 0)
      .map(([card]) => ({ type: 'payRobberToll', player, card }));
  },
});

const notBought = (prev: ActionDef): ActionDef => ({
  ...prev,
  check: () => 'Development cards are not bought: a quiet turn draws one free',
  enumerate: () => [],
});

const endInTheField = (prev: ActionDef): ActionDef => ({
  ...prev,
  phases: [...(prev.phases ?? ['main']), 'campaign'],
});

/** Spending of any kind ends the chance of a free development card this turn. */
const BOUGHT = new Set(['built', 'boughtDevCard', 'unitBought', 'wallBuilt']);

export const soldiersModule: GameModule = {
  id: MODULE_ID,
  name: 'Soldiers & Armies',
  settings: {
    // No Largest Army.
    largestArmyMin: 999,
  },
  pieceTypes: {
    [ARMY]: { on: 'corner' },
    [NUKE]: { on: 'corner' },
  },
  costs: {
    ...UNIT_COSTS,
    wall: WALL_COST,
    armyStep: ARMY_STEP_COST,
    // The nuke's fixed part; five cards of any kind come on top.
    nukeBase: NUKE_COST,
  },
  actions: {
    buyUnit,
    buildWall,
    drawFreeDevCard,
    takeTheField,
    marchArmy,
    attack,
    answerBattleCall,
    battleRoll,
    battleRetreat,
    attackRobber,
    payRobberToll,
    buyNuke,
    detonateNuke,
    capitulate,
  },
  wrapActions: {
    buyDevCard: notBought,
    endTurn: endInTheField,
    buildRoad: noRoutePastArmies('land'),
    placeFreeRoad: noRoutePastArmies('land'),
  },
  wrapActionsIfPresent: {
    buildShip: noRoutePastArmies('sea'),
    placeFreeShip: noRoutePastArmies('sea'),
  },
  hooks: {
    init(ctx) {
      soldiersData(ctx);
      // Victory Point cards leave the deck.
      const dev = ctx.state.decks.dev;
      if (dev) ctx.state.decks.dev = dev.filter((c) => c !== 'victoryPoint');
    },
    afterAction(ctx, a) {
      // Everyone starts with a settlement and a city: the second settlement is a city.
      const ph = ctx.state.phase;
      if (a.type === 'placeSetupSettlement' && ph.id === 'setup') {
        const i = ph.index as number;
        const b = ctx.buildingAt(a.corner as CornerId);
        if (i >= ctx.playerCount && i < 2 * ctx.playerCount && b?.type === 'settlement') {
          ctx.upgrade(b, 'city');
          ctx.emit({ type: 'startingCity', player: a.player, at: a.corner });
        }
        return;
      }
      // A city built on a damaged settlement is whole again.
      for (const e of ctx.events)
        if (e.type === 'built' && e.piece === 'city')
          delete ctx.buildingAt(e.at as CornerId)?.props.damaged;
      if (
        ctx.state.turn.number > 0 &&
        ctx.events.some((e) => BOUGHT.has(e.type) && e.player === ctx.active)
      )
        setTurnFlag(ctx, 'bought');
      checkLastStanding(ctx);
    },
    turnStarted: skipIfOut,
  },
  reducers: {
    // A player who is out finishes on the points they left with.
    vp: (ctx, seat, value) => soldiersData(ctx).out?.[String(seat)]?.vp ?? value,
    canWin: (ctx, seat, value) => value && !isOut(ctx, seat),
    // A nuked field makes nothing.
    hexBlocked: (ctx, hex, _piece, value) => value || !!soldiersData(ctx).nuked?.[hex.id],
    handLimit(ctx, seat, value) {
      const walls = ctx
        .piecesOf(seat)
        .filter((p) => ctx.registry.pieceTypes[p.type]?.building)
        .reduce((n, b) => n + wallsOf(b), 0);
      return Math.max(value, HAND_LIMIT) + WALL_HAND * walls;
    },
  },
};
