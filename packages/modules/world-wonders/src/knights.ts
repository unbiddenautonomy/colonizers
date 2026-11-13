import type { ActionDef, Ctx, HexId, Piece } from '@colonizers/engine';
import {
  drawProgress,
  isActive,
  isActiveTrack,
  isAway,
  isSheltered,
  knightsOf,
  knightStrength,
  progressOverLimit,
  TRACK_COMMODITY,
  type Track,
} from '@colonizers/module-cities-knights';
import { action, builtWonders, hasStage, MODULE_ID, onlyActive, wonderData } from './core.ts';
import { closedLoop } from './requirements.ts';
import type { WonderData } from './core.ts';

/**
 * Wonder abilities for Cities & Knights' knights and barbarians:
 *
 * - **Colossus I** (Defense against Demetrius' Siege): each of your active
 *   knights beside the sea counts one more against the barbarians.
 * - **Zeus I** (Nike): up to two of your inactive knights count against the
 *   barbarians too.
 * - **Zeus III** (Peloponnesian Offering): buy a progress card for one
 *   resource and its commodity (lumber and paper for science, wool and cloth
 *   for trade, ore and coin for politics).
 * - **Great Wall I** (Fortification): your knights and buildings on the wall
 *   (a closed ring of 9 or more of your roads) can't be downgraded, displaced
 *   or destroyed.
 *
 * Great Wall III (moving the barbarian ship two spaces or none) is with the
 * dice, in dice.ts.
 */

const ck = (ctx: Ctx) => ctx.state.modules.includes('cities-knights');

const isSea = (ctx: Ctx, hex: HexId) => {
  const h = ctx.state.hexes[hex];
  return !!h && ctx.registry.hexTypes[h.type]?.terrain === 'sea';
};

function coastal(ctx: Ctx, k: Piece): boolean {
  if (k.at.kind !== 'corner') return false;
  return (ctx.geometry.cornerHexes.get(k.at.id) ?? []).some((h) => isSea(ctx, h));
}

const atHome = (ctx: Ctx, k: Piece) => !isAway(k) && !isSheltered(ctx, k);

/** Colossus I and Zeus I: added to a player's strength against the barbarians. */
export function wonderDefense(ctx: Ctx, seat: number, value: number): number {
  if (!ck(ctx)) return value;
  let v = value;
  if (hasStage(ctx, seat, 'colossus', 1))
    v += knightsOf(ctx, seat).filter(
      (k) => isActive(k) && atHome(ctx, k) && coastal(ctx, k),
    ).length;
  if (hasStage(ctx, seat, 'zeus', 1)) {
    const idle = knightsOf(ctx, seat)
      .filter((k) => !isActive(k) && atHome(ctx, k))
      .map((k) => knightStrength(ctx, k))
      .sort((a, b) => b - a);
    v += (idle[0] ?? 0) + (idle[1] ?? 0);
  }
  return v;
}

// ---- Zeus III ----

/** The resource offered with each track's commodity. */
export const OFFERING: Partial<Record<Track, string>> = {
  science: 'lumber',
  trade: 'wool',
  politics: 'ore',
};

export function offeringPrice(track: Track): Record<string, number> {
  return { [OFFERING[track] as string]: 1, [TRACK_COMMODITY[track]]: 1 };
}

const wonderOffering = action<{ track: Track }>({
  phases: ['main'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    if (!ck(ctx) || !hasStage(ctx, a.player, 'zeus', 3))
      return 'You need the Peloponnesian Offering';
    if (!isActiveTrack(ctx, a.track) || !OFFERING[a.track])
      return 'Pick science, trade or politics';
    if (!ctx.state.decks[a.track]?.length) return 'That deck is empty';
    if (!ctx.has(a.player, offeringPrice(a.track)))
      return `You need ${OFFERING[a.track]} and ${TRACK_COMMODITY[a.track]}`;
    return null;
  },
  apply(ctx, a) {
    ctx.pay(a.player, offeringPrice(a.track));
    drawProgress(ctx, a.player, a.track);
    ctx.emit({ type: 'wonderOffering', player: a.player, deck: a.track });
    const owed = progressOverLimit(ctx);
    if (Object.keys(owed).length)
      ctx.setPhase({ id: 'progressDiscard', owed, returnTo: ctx.state.phase });
  },
  enumerate(ctx, player) {
    if (!ck(ctx) || !hasStage(ctx, player, 'zeus', 3)) return [];
    return (Object.keys(OFFERING) as Track[]).map((track) => ({
      type: 'wonderOffering',
      player,
      track,
    }));
  },
});

export const knightActions: Record<string, ActionDef> = { wonderOffering };

// ---- Great Wall I ----

/** Works the wall out again when its owner's roads change. */
export function updateWall(ctx: Ctx): void {
  const w = builtWonders(ctx).greatWall;
  const d = ctx.state.data[MODULE_ID] as WonderData | undefined;
  if (!w || !d) return;
  const roads = ctx
    .piecesOf(w.owner)
    .filter((p) => p.at.kind === 'edge' && ctx.registry.pieceTypes[p.type]?.route === 'land')
    .map((p) => (p.at as { id: string }).id)
    .sort();
  const key = roads.join(' ');
  if (d.wall && d.wall.owner === w.owner && d.wall.key === key) return;
  const loop = closedLoop(ctx, w.owner, 'land', 9) ?? [];
  const corners = new Set<string>();
  for (const e of loop) for (const c of ctx.geometry.edgeCorners.get(e) ?? []) corners.add(c);
  wonderData(ctx).wall = { owner: w.owner, key, corners: [...corners].sort() };
}

/** Is this piece on the Great Wall of a player with Fortification? */
export function onTheWall(ctx: Ctx, p: Piece, value: boolean): boolean {
  if (value || p.owner === null || p.at.kind !== 'corner') return value;
  const wall = (ctx.state.data[MODULE_ID] as WonderData | undefined)?.wall;
  if (!wall || wall.owner !== p.owner || !hasStage(ctx, p.owner, 'greatWall', 1)) return value;
  return wall.corners.includes(p.at.id);
}
