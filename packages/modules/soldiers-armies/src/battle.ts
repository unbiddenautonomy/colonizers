import type { Action, ActionDef, CornerId, Ctx, Piece } from '@colonizers/engine';
import { ARMY } from './constants.ts';
import { loseMetropolis } from './ck.ts';
import { checkDestroyed } from './fate.ts';
import {
  armyAt,
  attackTargets,
  buildingDie,
  cornerOf,
  cutOffRoutes,
  poolDie,
  poolLoses,
  retreatCorners,
  setTurnFlag,
  wallsOf,
  type Target,
} from './rules.ts';

/**
 * Battles. An army attacks a rival army or building on a neighbouring corner;
 * the attacker's other armies next to the target can join in, and so can the
 * defender's ("an alliance"). Each round both sides roll; the loser's best
 * unit steps down, or the building takes damage.
 */

export interface BattlePhase {
  id: 'battle';
  /** The attacker's armies, the first leading (it falls back if they break off). */
  attackers: string[];
  /** The defender's armies, beaten before the building. */
  defenders: string[];
  defender: number;
  target: Target;
}

interface CallPhase extends Omit<BattlePhase, 'id'> {
  id: 'battleCall';
  /** The defender's armies that can join. */
  allies: string[];
}

const battle = (ctx: Ctx) => ctx.state.phase as unknown as BattlePhase;

function action<T>(def: ActionDef<Action & T>): ActionDef {
  return def as unknown as ActionDef;
}

const sameTarget = (x: Target, y: Target) => x.kind === y.kind && x.corner === y.corner;

/** A seat's armies next to a corner (and not on it). */
function armiesNextTo(ctx: Ctx, seat: number, corner: CornerId): Piece[] {
  const near = new Set(ctx.geometry.cornerNeighbours.get(corner) ?? []);
  return ctx.piecesOf(seat, ARMY).filter((a) => {
    const c = cornerOf(a);
    return !!c && near.has(c);
  });
}

function ownArmy(ctx: Ctx, seat: number, id: unknown): Piece | undefined {
  const p = typeof id === 'string' ? ctx.state.pieces[id] : undefined;
  return p && p.type === ARMY && p.owner === seat && p.at.kind === 'corner' ? p : undefined;
}

export const attack = action<{ army: string; target: Target; allies?: string[] }>({
  phases: ['campaign'],
  check(ctx, a) {
    if (a.player !== ctx.active) return 'Not your turn';
    const army = ownArmy(ctx, a.player, a.army);
    if (!army) return 'That is not your army';
    if (!a.target || typeof a.target !== 'object') return 'Pick something to attack';
    if (!attackTargets(ctx, army).some((t) => sameTarget(t, a.target)))
      return 'The army can not attack that';
    const near = new Set(armiesNextTo(ctx, a.player, a.target.corner).map((x) => x.id));
    for (const id of a.allies ?? [])
      if (id === a.army || !near.has(id)) return 'Only your armies next to the target can join';
    return null;
  },
  apply(ctx, a) {
    setTurnFlag(ctx, 'fought');
    const target = { kind: a.target.kind, corner: a.target.corner } as Target;
    const guard = armyAt(ctx, target.corner);
    const defender = (guard?.owner ?? ctx.buildingAt(target.corner)?.owner) as number;
    const attackers = [a.army, ...new Set(a.allies ?? [])];
    const defenders = guard ? [guard.id] : [];
    ctx.emit({ type: 'attacked', player: a.player, defender, target, armies: attackers.length });
    const allies = armiesNextTo(ctx, defender, target.corner)
      .map((x) => x.id)
      .filter((id) => !defenders.includes(id));
    const base = { attackers, defenders, defender, target };
    if (allies.length) ctx.setPhase({ id: 'battleCall', ...base, allies });
    else ctx.setPhase({ id: 'battle', ...base });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    return ctx.piecesOf(player, ARMY).flatMap((army) =>
      attackTargets(ctx, army).flatMap((target) => {
        const allies = armiesNextTo(ctx, player, target.corner)
          .map((x) => x.id)
          .filter((id) => id !== army.id);
        const alone = { type: 'attack', player, army: army.id, target };
        return allies.length ? [alone, { ...alone, allies }] : [alone];
      }),
    );
  },
});

/** The defender's neighbouring armies join the fight, or stay out of it. */
export const answerBattleCall = action<{ join: boolean }>({
  phases: ['battleCall'],
  check: (ctx, a) =>
    a.player === (ctx.state.phase as unknown as CallPhase).defender
      ? null
      : 'Only the defender answers',
  apply(ctx, a) {
    const { allies, ...ph } = ctx.state.phase as unknown as CallPhase;
    const defenders = a.join ? [...ph.defenders, ...allies] : ph.defenders;
    if (a.join) ctx.emit({ type: 'alliesJoined', player: a.player, armies: allies.length });
    ctx.setPhase({ ...ph, id: 'battle', defenders });
  },
  enumerate: (ctx, player) =>
    player === (ctx.state.phase as unknown as CallPhase).defender
      ? [
          { type: 'answerBattleCall', player, join: true },
          { type: 'answerBattleCall', player, join: false },
        ]
      : [],
});

/** The building takes a beating: damaged first, then down a level. True when it falls. */
function damage(ctx: Ctx, b: Piece): boolean {
  if (!b.props.damaged) {
    b.props.damaged = true;
    return false;
  }
  // A metropolis drops to a city first.
  if (typeof b.props.metropolis === 'string') {
    loseMetropolis(ctx, b);
    delete b.props.damaged;
    return false;
  }
  if (b.type === 'settlement' || ctx.supplyLeft(b.owner as number, 'settlement') <= 0) return true;
  const s = ctx.upgrade(b, 'settlement');
  delete s.props.damaged;
  delete s.props.walls;
  // A harbor settlement's dock (Explorers & Pirates) goes with it.
  delete s.props.cargo;
  return false;
}

/** The settlement is the attacker's now, with the roads that lose their way home. */
function capture(ctx: Ctx, attacker: number, corner: CornerId, b: Piece): void {
  const loser = b.owner as number;
  const routes = cutOffRoutes(ctx, corner, loser);
  ctx.remove(b);
  const took = ctx.supplyLeft(attacker, 'settlement') > 0;
  if (took) ctx.place('settlement', attacker, { kind: 'corner', id: corner });
  for (const r of routes) {
    if (ctx.supplyLeft(attacker, r.type) > 0) r.owner = attacker;
    else ctx.remove(r);
  }
  ctx.invalidatePieces();
  ctx.emit({
    type: 'settlementCaptured',
    player: attacker,
    from: loser,
    at: corner,
    taken: took,
    routes: routes.length,
  });
}

export const battleRoll = action<object>({
  phases: ['battle'],
  check: (ctx, a) => (a.player === ctx.active ? null : 'Not your turn'),
  apply(ctx, a) {
    const ph = battle(ctx);
    const corner = ph.target.corner;
    let attackers = ph.attackers.filter((id) => ctx.state.pieces[id]);
    let defenders = ph.defenders.filter((id) => ctx.state.pieces[id]);
    const building = defenders.length ? undefined : ctx.buildingAt(corner);
    if (!attackers.length || (!defenders.length && (ph.target.kind === 'army' || !building))) {
      ctx.setPhase({ id: 'campaign' });
      return;
    }
    const dice = [
      poolDie(ctx, attackers),
      building ? buildingDie(building) : poolDie(ctx, defenders),
    ] as const;
    const walls = building ? wallsOf(building) : 0;
    const rolls = [ctx.rng.int(1, dice[0]), ctx.rng.int(1, dice[1])] as const;
    const won = rolls[0] > rolls[1] + walls;
    ctx.emit({
      type: 'battleRound',
      player: a.player,
      defender: ph.defender,
      target: building ? 'building' : 'army',
      at: corner,
      dice,
      rolls,
      walls,
      won,
    });
    let over = false;
    if (!won) {
      attackers = poolLoses(ctx, attackers);
      if (!attackers.length) {
        over = true;
        ctx.emit({ type: 'armyDestroyed', player: a.player, by: ph.defender });
      }
    } else if (!building) {
      defenders = poolLoses(ctx, defenders);
      if (!defenders.length) {
        ctx.emit({ type: 'armyDestroyed', player: ph.defender, by: a.player });
        // A beaten guard leaves the building to fight on; an army target is done.
        over = ph.target.kind === 'army';
      }
    } else if (damage(ctx, building)) {
      capture(ctx, a.player, corner, building);
      over = true;
    }
    checkDestroyed(ctx, ph.defender, a.player);
    checkDestroyed(ctx, a.player, ph.defender);
    if (ctx.state.phase.id !== 'battle') return;
    if (over) ctx.setPhase({ id: 'campaign' });
    else ctx.setPhase({ ...ph, attackers, defenders });
  },
  enumerate: (ctx, player) => (player === ctx.active ? [{ type: 'battleRoll', player }] : []),
});

const lead = (ctx: Ctx): Piece | undefined =>
  battle(ctx)
    .attackers.map((id) => ctx.state.pieces[id])
    .find((p): p is Piece => !!p);

/** Break off the fight: the leading army falls back a corner (or holds still if it can't). */
export const battleRetreat = action<{ to: CornerId | null }>({
  phases: ['battle'],
  check(ctx, a) {
    if (a.player !== ctx.active) return 'Not your turn';
    const army = lead(ctx);
    const options = army ? retreatCorners(ctx, army) : [];
    if (a.to === null) return options.length ? 'Fall back to a neighbouring corner' : null;
    return options.includes(a.to) ? null : 'The army can not fall back there';
  },
  apply(ctx, a) {
    const army = lead(ctx);
    const from = army ? cornerOf(army) : null;
    if (army && a.to) ctx.move(army, { kind: 'corner', id: a.to });
    ctx.emit({ type: 'armyRetreated', player: a.player, from, to: a.to });
    ctx.setPhase({ id: 'campaign' });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    const army = lead(ctx);
    const options = army ? retreatCorners(ctx, army) : [];
    return (options.length ? options : [null]).map((to) => ({ type: 'battleRetreat', player, to }));
  },
});
