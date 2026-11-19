import type { Cards, Ctx, HexId, HexState } from '@colonizers/engine';
import { buildingsOf } from './store.ts';

/**
 * The river (the `gwpRiver` switch): a river of four hexes takes the place of
 * the desert and one ore, one brick and one wool hex.
 *
 * - The desert becomes the swampland. It has no number and the robber starts there.
 * - The other three keep their terrain and number, with a river across them.
 * - Roads can cross the river.
 * - A Monument can stand on a river hex (not the swampland) as well as on a gold field.
 * - Once you have a Monument, your cities on river hexes make 1 resource and
 *   1 Gold instead of their usual two cards. A city whose own Citadel stands on
 *   the brick river hex keeps making Crystal there instead.
 */

/** Terrain that turns into river, in the order the river runs. */
export const RIVER_TERRAIN = ['mountains', 'hills', 'pasture'] as const;

export const isRiver = (hex: HexState | undefined): boolean => hex?.props?.gwpRiver === true;
export const isSwampland = (hex: HexState | undefined): boolean => hex?.props?.swampland === true;

function mark(hex: HexState, key: 'gwpRiver' | 'swampland'): void {
  hex.props = { ...hex.props, [key]: true };
}

/** Lays the river at the start of the game, keeping its hexes together where it can. */
export function layRiver(ctx: Ctx): void {
  if (ctx.setting<boolean>('gwpRiver') !== true) return;
  const all = Object.values(ctx.state.hexes).filter((h) => !h.hidden);
  if (all.some((h) => isRiver(h) || isSwampland(h))) return;
  const robberHex = ctx.piecesOfType('robber')[0]?.at;
  const deserts = all.filter((h) => h.type === 'desert');
  const desert =
    deserts.find((h) => robberHex?.kind === 'hex' && robberHex.id === h.id) ?? deserts[0];
  const pools = RIVER_TERRAIN.map((t) => all.filter((h) => h.type === t && h.token !== undefined));
  if (pools.some((p) => !p.length)) return;
  const near = (a: HexId, b: HexId) => (ctx.geometry.hexNeighbours.get(a) ?? []).includes(b);
  // The river's path: swampland, ore, brick, wool. Score how many steps touch.
  let best: HexState[][] = [];
  let bestScore = -1;
  for (const o of pools[0]!)
    for (const b of pools[1]!)
      for (const w of pools[2]!) {
        const path = [...(desert ? [desert] : []), o, b, w];
        let score = 0;
        for (let i = 1; i < path.length; i++) if (near(path[i - 1]!.id, path[i]!.id)) score++;
        if (score > bestScore) {
          bestScore = score;
          best = [];
        }
        if (score === bestScore) best.push([o, b, w]);
      }
  const pick = best[ctx.rng.int(0, best.length - 1)]!;
  if (desert) mark(desert, 'swampland');
  for (const h of pick) mark(h, 'gwpRiver');
}

/** The river hexes in the order the river runs, swampland first. */
export function riverHexes(ctx: Ctx): HexId[] {
  const hexes = Object.values(ctx.state.hexes);
  const swamp = hexes.filter(isSwampland).map((h) => h.id);
  const river = RIVER_TERRAIN.flatMap((t) =>
    hexes.filter((h) => h.type === t && isRiver(h)).map((h) => h.id),
  );
  return [...swamp, ...river];
}

/** Does this seat's city on this hex take Gold for the river? */
export function riverGold(ctx: Ctx, seat: number, hex: HexState): boolean {
  if (!isRiver(hex)) return false;
  const mine = buildingsOf(ctx, seat);
  return !!mine.monument && mine.citadel?.hex !== hex.id;
}

/** A city on a river hex with a Monument: 1 resource and 1 Gold. */
export function riverYield(ctx: Ctx, seat: number, hex: HexState, value: Cards): Cards {
  if (!riverGold(ctx, seat, hex)) return value;
  const produces = ctx.registry.hexTypes[hex.type]?.produces;
  if (!produces) return value;
  const v: Cards = { ...value };
  const other = Object.keys(v).find((k) => k !== produces && k !== 'gold' && (v[k] ?? 0) > 0);
  if (other) v[other] = (v[other] ?? 0) - 1;
  else if ((v[produces] ?? 0) >= 2) v[produces] = (v[produces] ?? 0) - 1;
  else return value;
  v.gold = (v.gold ?? 0) + 1;
  for (const k of Object.keys(v)) if (!v[k]) delete v[k];
  return v;
}
