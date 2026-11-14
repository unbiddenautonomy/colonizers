import type { Action, ActionDef, Ctx, Piece } from '@colonizers/engine';
import { robber } from '@colonizers/module-base';
import { ARMY } from './constants.ts';
import { loseUnit } from './rules.ts';

/**
 * Soldiers & Armies with Princes & Explorers:
 *
 * - The princes and the robber are neutral: they can't be attacked, and they
 *   only touch points, never walls or units.
 * - The robber isn't bought. An army gives way instead (its best unit a level
 *   down, or an infantry off the board) to move it one to three fields, and
 *   more armies can give way to take it further.
 * - No development cards at all, so no free card after a quiet turn.
 * - The game is won on points only, never as the last player standing, and
 *   plays to the princes' target (14, or 17 with Cities & Knights).
 */

export const withPrinces = (ctx: Ctx) => ctx.state.modules.includes('princes');

/** Fields the robber moves for each army that gives way (Princes & Explorers' three). */
export const ROBBER_STEPS = 3;

function ownArmy(ctx: Ctx, seat: number, id: unknown): Piece | undefined {
  const p = typeof id === 'string' ? ctx.state.pieces[id] : undefined;
  return p && p.type === ARMY && p.owner === seat && p.at.kind === 'corner' ? p : undefined;
}

const robberActive = (ctx: Ctx) =>
  !ctx.state.modules.includes('cities-knights') ||
  !!(ctx.state.data['cities-knights'] as { robberActive?: boolean } | undefined)?.robberActive;

/** An army gives way to move the robber, or to take it three fields further. */
export const unitRobberMove: ActionDef = {
  phases: ['main', 'moveRobber'],
  check(ctx, a) {
    if (!withPrinces(ctx)) return 'Only with Princes & Explorers';
    if (a.player !== ctx.active) return 'Not your turn';
    const ph = ctx.state.phase;
    if (ph.id === 'moveRobber' && ph.walk !== true) return 'Move the robber first';
    if (!robber(ctx)) return 'The robber is not on the board yet';
    if (!robberActive(ctx)) return 'The robber is not in play until the barbarians attack';
    return ownArmy(ctx, a.player, a.army) ? null : 'That is not your army';
  },
  apply(ctx, a) {
    const army = ownArmy(ctx, a.player, a.army) as Piece;
    const stays = loseUnit(ctx, army);
    ctx.emit({ type: 'unitGaveWay', player: a.player, left: !stays });
    const ph = ctx.state.phase;
    if (ph.id === 'moveRobber')
      ctx.setPhase({ ...ph, range: ((ph.range as number) ?? ROBBER_STEPS) + ROBBER_STEPS });
    else ctx.setPhase({ id: 'moveRobber', returnTo: 'main', range: ROBBER_STEPS, walk: true });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active || !withPrinces(ctx)) return [];
    return ctx
      .piecesOf(player, ARMY)
      .filter((p) => p.at.kind === 'corner')
      .map((p): Action => ({ type: 'unitRobberMove', player, army: p.id }));
  },
};

const unitsInstead = (prev: ActionDef): ActionDef => ({
  ...prev,
  check: () => 'With Soldiers & Armies, an army gives way to move the robber instead',
  enumerate: () => [],
});

/** Princes & Explorers actions that units replace. */
export const princesWraps: Record<string, (prev: ActionDef) => ActionDef> = {
  buyRobberMove: unitsInstead,
};
