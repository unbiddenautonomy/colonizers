import type { Action, ActionDef, Ctx, HexId, Piece } from '@colonizers/engine';
import { robber, stealFrom } from '@colonizers/module-base';
import { BISHOP_RANGE, ROBBER_RANGE } from './constants.ts';
import { princesData, robberAtCorner, robberHex, robberTargets, robberVictims } from './rules.ts';

/**
 * Princes & Explorers with Cities & Knights:
 *
 * - A metropolis scores like its city: a point more per prince, nothing at
 *   the robber. A merchant at the robber scores nothing either.
 * - The robber can't be bought or chased away. Instead you give up a knight
 *   (a strong or mighty one steps down a level, a basic one leaves) to move
 *   it one to three fields, and you can give up more to take it further.
 * - The Bishop moves it up to six fields, or takes a card from every player.
 */

export const withCk = (ctx: Ctx) => ctx.state.modules.includes('cities-knights');

const KNIGHTS = ['knight1', 'knight2', 'knight3'];

/** Each step a knight takes down when it gives way; a basic one leaves. */
const STEP_DOWN: Record<string, string | null> = {
  knight1: null,
  knight2: 'knight1',
  knight3: 'knight2',
};

interface CkView {
  robberActive?: boolean;
  metropolis?: Record<string, { seat: number; corner: string } | undefined>;
}

/** Metropolis and merchant points lost to the robber. */
export function ckRobberVp(ctx: Ctx, seat: number, value: number): number {
  if (!withCk(ctx)) return value;
  const r = robberHex(ctx);
  if (!r) return value;
  let v = value;
  const ck = (ctx.state.data['cities-knights'] ?? {}) as CkView;
  for (const m of Object.values(ck.metropolis ?? {}))
    if (m?.seat === seat && robberAtCorner(ctx, m.corner, r)) v -= 2;
  for (const m of ctx.piecesOfType('merchant'))
    if (m.owner === seat && m.at.kind === 'hex' && m.at.id === r) v -= 1;
  return v;
}

function ownKnight(ctx: Ctx, seat: number, id: unknown): Piece | undefined {
  const k = typeof id === 'string' ? ctx.state.pieces[id] : undefined;
  return k && k.owner === seat && KNIGHTS.includes(k.type) ? k : undefined;
}

/** Give up a knight to move the robber, or to take it three fields further. */
const knightRobberMove: ActionDef = {
  phases: ['main', 'moveRobber'],
  check(ctx, a) {
    if (!withCk(ctx)) return 'Only with Cities & Knights';
    if (a.player !== ctx.active) return 'Not your turn';
    const ph = ctx.state.phase;
    if (ph.id === 'moveRobber' && ph.walk !== true) return 'Move the robber first';
    if (!robber(ctx)) return 'The robber is not on the board yet';
    if (!(ctx.state.data['cities-knights'] as CkView | undefined)?.robberActive)
      return 'The robber is not in play until the barbarians attack';
    const k = ownKnight(ctx, a.player, a.knight);
    if (!k) return 'That is not your knight';
    const down = STEP_DOWN[k.type];
    if (down && ctx.supplyLeft(a.player, down) <= 0)
      return 'You have no knight of the level below left to swap in';
    return null;
  },
  apply(ctx, a) {
    const k = ownKnight(ctx, a.player, a.knight) as Piece;
    const down = STEP_DOWN[k.type];
    if (down) ctx.upgrade(k, down);
    else ctx.remove(k);
    ctx.emit({ type: 'knightGaveWay', player: a.player, left: !down });
    const ph = ctx.state.phase;
    if (ph.id === 'moveRobber')
      ctx.setPhase({ ...ph, range: ((ph.range as number) ?? ROBBER_RANGE) + ROBBER_RANGE });
    else ctx.setPhase({ id: 'moveRobber', returnTo: 'main', range: ROBBER_RANGE, walk: true });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active || !withCk(ctx)) return [];
    return ctx
      .piecesOf(player)
      .filter((p) => KNIGHTS.includes(p.type))
      .map((k) => ({ type: 'knightRobberMove', player, knight: k.id }));
  },
};

/** Where the card goes back to, as a phase id (the steal step takes an id). */
const back = (ctx: Ctx): string => {
  const r = ctx.state.phase.returnTo as string | { id: string } | undefined;
  return typeof r === 'string' ? r : (r?.id ?? 'main');
};

/** The Bishop: take a card from every other player instead of moving the robber. */
const bishopRobAll: ActionDef = {
  phases: ['bishop'],
  check: (ctx, a) => (a.player === ctx.active ? null : 'Not your turn'),
  apply(ctx, a) {
    const to = back(ctx);
    for (const v of robberVictims(ctx, a.player)) stealFrom(ctx, a.player, v);
    ctx.setPhase({ id: to });
  },
  enumerate: (ctx, player) => (player === ctx.active ? [{ type: 'bishopRobAll', player }] : []),
};

export const ckActions: Record<string, ActionDef> = { knightRobberMove, bishopRobAll };

/** The Bishop's move: up to six fields, then a card from any one player. */
function wrapBishopMove(prev: ActionDef): ActionDef {
  const targets = (ctx: Ctx, seat: number) => robberTargets(ctx, seat, BISHOP_RANGE);
  return {
    ...prev,
    check(ctx, a) {
      if (a.player !== ctx.active) return 'Not your turn';
      return targets(ctx, a.player).includes(a.hex as HexId) ? null : 'The robber can not go there';
    },
    apply(ctx, a) {
      const hex = a.hex as HexId;
      const to = back(ctx);
      const r = robber(ctx);
      if (r) ctx.move(r, { kind: 'hex', id: hex });
      else ctx.place('robber', null, { kind: 'hex', id: hex });
      princesData(ctx).robberIn = true;
      ctx.emit({ type: 'robberMoved', player: a.player, hex });
      const victims = robberVictims(ctx, a.player);
      if (victims.length > 1) ctx.setPhase({ id: 'steal', hex, candidates: victims, returnTo: to });
      else {
        if (victims[0] !== undefined) stealFrom(ctx, a.player, victims[0]);
        ctx.setPhase({ id: to });
      }
    },
    enumerate(ctx, player) {
      if (player !== ctx.active) return [];
      return targets(ctx, player).map((hex): Action => ({ type: 'bishopMove', player, hex }));
    },
  };
}

const noChase = (prev: ActionDef): ActionDef => ({
  ...prev,
  check: () => 'With Princes & Explorers, knights give way to move the robber instead',
  enumerate: () => [],
});

export const ckWraps: Record<string, (prev: ActionDef) => ActionDef> = {
  chaseRobber: noChase,
  bishopMove: wrapBishopMove,
};
