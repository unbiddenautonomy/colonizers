import type { Action, ActionDef, Ctx } from '@colonizers/engine';
import { startNextTurn } from '@colonizers/module-base';
import { ARMY, NUKE } from './constants.ts';
import { isBuilding, isOut, soldiersData } from './rules.ts';

/**
 * How a player leaves the game: by capitulating to another player, or by
 * losing every settlement, city and unit. The last one standing wins.
 */

function setOut(ctx: Ctx, seat: number, vp: number, to?: number): void {
  const d = soldiersData(ctx);
  d.out = { ...d.out, [String(seat)]: to === undefined ? { vp } : { vp, to } };
}

/** Hand over every card, resources and development cards alike. */
function handOverCards(ctx: Ctx, from: number, to: number): void {
  const hand = Object.fromEntries(Object.entries(ctx.player(from).hand).filter(([, n]) => n > 0));
  if (Object.keys(hand).length) ctx.transfer(from, to, hand);
  const held = ctx.player(from).held;
  const theirs = ctx.player(to).held;
  for (const [deck, cards] of Object.entries(held)) {
    (theirs[deck] ??= []).push(...cards.filter((c) => c.card !== 'victoryPoint'));
    held[deck] = [];
  }
}

/** Nothing left to stand on: no settlement, city or unit. */
export function beaten(ctx: Ctx, seat: number): boolean {
  return !ctx.piecesOf(seat).some(
    (p) =>
      (p.at.kind === 'corner' && (isBuilding(ctx, p) || p.type === ARMY || p.type === NUKE)) ||
      // An army aboard a ship (Explorers & Pirates).
      (p.type === 'ship' && !!p.props.army),
  );
}

/** Complete destruction: the player is out on 0 points, and `by` takes their cards. */
export function checkDestroyed(ctx: Ctx, seat: number | null | undefined, by: number): void {
  if (seat === null || seat === undefined || seat === by || isOut(ctx, seat)) return;
  if (!beaten(ctx, seat)) return;
  handOverCards(ctx, seat, by);
  setOut(ctx, seat, 0);
  ctx.emit({ type: 'playerDestroyed', player: seat, by });
}

/** The last player still in the game wins. */
export function checkLastStanding(ctx: Ctx): void {
  // With Princes & Explorers the game is won on points only.
  if (ctx.state.winner !== null || ctx.state.modules.includes('princes')) return;
  const left = ctx.state.players.map((p) => p.seat).filter((s) => !isOut(ctx, s));
  if (left.length !== 1) return;
  const seat = left[0] as number;
  ctx.state.winner = seat;
  ctx.setPhase({ id: 'gameOver' });
  ctx.emit({
    type: 'gameOver',
    winner: seat,
    vp: ctx.state.players.map((_, i) => ctx.vp(i)),
    lastStanding: true,
  });
}

/** A player who is out sits their turns out. */
export function skipIfOut(ctx: Ctx): void {
  const left = ctx.state.players.some((p) => !isOut(ctx, p.seat));
  if (left && isOut(ctx, ctx.state.turn.player) && ctx.state.phase.id === 'roll')
    startNextTurn(ctx);
}

/**
 * Capitulate: everything you have goes to another player, and you finish on
 * half your points (rounded up). On your own turn to anyone, or in a battle
 * to the attacker.
 */
export const capitulate: ActionDef = {
  phases: ['main', 'campaign', 'battle', 'battleCall'],
  check(ctx, a) {
    if (isOut(ctx, a.player)) return 'You are out of the game';
    const to = a.to as number;
    if (!Number.isInteger(to) || to === a.player || !ctx.state.players[to] || isOut(ctx, to))
      return 'Capitulate to a player still in the game';
    const ph = ctx.state.phase;
    if (ph.id === 'battle' || ph.id === 'battleCall') {
      if (a.player !== ph.defender) return 'Only the defender can capitulate in a battle';
      if (to !== ctx.active) return 'Capitulate to the attacker';
      return null;
    }
    return a.player === ctx.active ? null : 'Not your turn';
  },
  apply(ctx, a) {
    const to = a.to as number;
    const vp = Math.ceil(ctx.vp(a.player) / 2);
    for (const p of ctx.piecesOf(a.player))
      if (p.at.kind === 'corner' || p.at.kind === 'edge') p.owner = to;
    ctx.invalidatePieces();
    handOverCards(ctx, a.player, to);
    setOut(ctx, a.player, vp, to);
    ctx.emit({ type: 'capitulated', player: a.player, to, vp });
    const ph = ctx.state.phase;
    const myTurn = a.player === ctx.active;
    if (ph.id === 'battle' || ph.id === 'battleCall') ctx.setPhase({ id: 'campaign' });
    checkLastStanding(ctx);
    if (myTurn && ctx.state.winner === null) startNextTurn(ctx);
  },
  enumerate(ctx, player): Action[] {
    // Only offered on your own turn: a defender capitulates from the battle panel.
    if (isOut(ctx, player) || player !== ctx.active) return [];
    return ctx.state.players
      .filter((p) => p.seat !== player)
      .map((p) => ({ type: 'capitulate', player, to: p.seat }));
  },
};
