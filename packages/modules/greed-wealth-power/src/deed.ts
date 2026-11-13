import type { Action, CornerId, Ctx } from '@colonizers/engine';
import { distanceRuleOk, routesAt } from '@colonizers/module-base';
import { MAX_WALLS, WALL_HAND_BONUS, wallsOf } from '@colonizers/module-cities-knights';
import { MODULE_ID } from './constants.ts';

/**
 * Land Deed: one of your city walls marks an empty settlement spot beside your
 * road (keeping the distance rule). Until you next build a settlement,
 * anywhere, the spot is yours:
 *
 * - nobody else can settle on it or next to it;
 * - the wall still counts toward your hand limit, and as one of your 3 walls.
 */

interface DeedData extends Record<string, unknown> {
  deeds?: Record<number, CornerId>;
}

export function deeds(ctx: Ctx): Record<number, CornerId> {
  return (ctx.data<DeedData>(MODULE_ID).deeds ??= {});
}

function deedOf(ctx: Ctx, seat: number): CornerId | undefined {
  const d = ctx.state.data[MODULE_ID] as DeedData | undefined;
  return d?.deeds?.[seat];
}

/** Corners a Land Deed can mark for this player. */
export function deedSpots(ctx: Ctx, seat: number): CornerId[] {
  if (deedOf(ctx, seat) || wallsOf(ctx, seat) >= MAX_WALLS) return [];
  const taken = Object.values(deeds(ctx));
  return ctx.geometry.corners.filter(
    (c) =>
      ctx.isLandCorner(c) &&
      !ctx.piecesAt({ kind: 'corner', id: c }).length &&
      distanceRuleOk(ctx, c) &&
      routesAt(ctx, seat, c, 'land').length > 0 &&
      !taken.some((t) => t === c || (ctx.geometry.cornerNeighbours.get(t) ?? []).includes(c)),
  );
}

export function deedCheck(ctx: Ctx, seat: number, corner: unknown): string | null {
  if (deedOf(ctx, seat)) return 'You already hold a Land Deed';
  if (wallsOf(ctx, seat) >= MAX_WALLS) return `All ${MAX_WALLS} of your city walls are built`;
  return deedSpots(ctx, seat).includes(corner as CornerId)
    ? null
    : 'Pick an empty settlement spot beside your road';
}

export function placeDeed(ctx: Ctx, seat: number, corner: CornerId): void {
  deeds(ctx)[seat] = corner;
  ctx.emit({ type: 'landDeed', player: seat, at: corner });
}

/** Others can't settle on or beside a deed; the deed's wall counts toward the 3. */
export function deedBlock(ctx: Ctx, a: Action): string | null {
  if (a.type === 'buildWall') {
    if (deedOf(ctx, a.player) && wallsOf(ctx, a.player) >= MAX_WALLS - 1)
      return `Your Land Deed uses one of your ${MAX_WALLS} city walls`;
    return null;
  }
  if (a.type !== 'buildSettlement') return null;
  const at = a.corner as CornerId;
  for (const [seat, c] of Object.entries(deeds(ctx))) {
    if (Number(seat) === a.player) continue;
    if (c === at || (ctx.geometry.cornerNeighbours.get(c) ?? []).includes(at))
      return 'That spot is held by a Land Deed';
  }
  return null;
}

export function deedHandLimit(ctx: Ctx, seat: number, value: number): number {
  return deedOf(ctx, seat) ? value + WALL_HAND_BONUS : value;
}

/** The deed's wall comes back once its owner builds a settlement. */
export function settleDeeds(ctx: Ctx): void {
  const d = ctx.state.data[MODULE_ID] as DeedData | undefined;
  if (!d?.deeds) return;
  for (const e of ctx.events) {
    if (e.type !== 'built' || e.piece !== 'settlement') continue;
    const seat = e.player as number;
    if (d.deeds[seat] === undefined) continue;
    delete d.deeds[seat];
    ctx.emit({ type: 'landDeedUsed', player: seat });
  }
}
