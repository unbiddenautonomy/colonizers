import type { CornerId, Ctx, HexId } from '@colonizers/engine';
import { MODULE_ID, type Building } from './constants.ts';

/** Where one of this module's buildings stands. */
export interface Placed {
  corner: CornerId;
  hex: HexId;
}

export interface GwpData extends Record<string, unknown> {
  beer: Record<number, number>;
  buildings: Record<number, Partial<Record<Building, Placed>>>;
}

/**
 * The module's store, ready to be written to. `ctx.data()` puts an empty store into the game when
 * there isn't one, and the two defaults below do the same, so this belongs only where something
 * is being changed.
 */
export function gwpData(ctx: Ctx): GwpData {
  const d = ctx.data<GwpData>(MODULE_ID);
  d.beer ??= {};
  d.buildings ??= {};
  return d;
}

/**
 * What the store holds, without putting anything there. Asking a question must not change the
 * game: the browser asks these while it is only drawing a screen, and a read that wrote an empty
 * store left the screen's copy of the game a step from the one the rules keep. (river.ts carried
 * its own copy of this for that reason; it uses these now.)
 */
function stored(ctx: Ctx): Partial<GwpData> {
  return (ctx.state.data[MODULE_ID] ?? {}) as Partial<GwpData>;
}

export function beerOf(ctx: Ctx, seat: number): number {
  return stored(ctx).beer?.[seat] ?? 0;
}

/** This seat's buildings, for reading. Putting one up goes through setBuilding. */
export function buildingsOf(ctx: Ctx, seat: number): Readonly<Partial<Record<Building, Placed>>> {
  return stored(ctx).buildings?.[seat] ?? {};
}

export function setBuilding(ctx: Ctx, seat: number, building: Building, at: Placed): void {
  (gwpData(ctx).buildings[seat] ??= {})[building] = at;
}

export function addBeer(ctx: Ctx, seat: number, n: number): void {
  const d = gwpData(ctx);
  d.beer[seat] = Math.max(0, (d.beer[seat] ?? 0) + n);
}
