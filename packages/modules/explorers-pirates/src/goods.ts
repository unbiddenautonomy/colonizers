import type { Action, ActionDef, Ctx, EdgeId, HexId, Piece } from '@colonizers/engine';
import {
  action,
  cargoOf,
  cargoRoom,
  CARGO_SIZE,
  epData,
  GOLD,
  harborBeside,
  hasSpice,
  hidden,
  onlyActive,
  ownShip,
  pirateShip,
} from './rules.ts';

/**
 * Fishing Grounds and Spice Islands: goods brought home by ship.
 *
 * Our version:
 * - Fishing grounds are sea hexes out in the fog with a number. When it is
 *   rolled, every ship beside a fishing ground takes a fish aboard, if it
 *   has room (a fish takes half a hold). The pirate ship scares the fish away.
 * - Spice villages sit on islands out in the fog. A ship beside one buys a
 *   sack of spice for 2 gold (half a hold).
 * - A ship beside one of your harbor settlements delivers its fish and
 *   spice. Every 2 fish, and every 2 sacks of spice, are a step on that
 *   mission track: 1 point each.
 */

export const GOODS = ['fish', 'spice'] as const;
export type Good = (typeof GOODS)[number];
export const GOODS_PER_STEP = 2;
export const SPICE_PRICE = 2;

const MISSION: Record<Good, 'fish' | 'spices'> = { fish: 'fish', spice: 'spices' };

export const isGood = (c: string): c is Good => (GOODS as readonly string[]).includes(c);

/** A fishing ground everyone can see. */
export function isShoal(ctx: Ctx, hex: HexId): boolean {
  const h = ctx.state.hexes[hex];
  return !!h && h.type === 'shoal' && !hidden(ctx, hex);
}

/** A spice village everyone can see. */
export function isVillage(ctx: Ctx, hex: HexId): boolean {
  const h = ctx.state.hexes[hex];
  return !!h && h.props?.village === true && !hidden(ctx, hex);
}

export function villagesBeside(ctx: Ctx, ship: Piece): HexId[] {
  if (ship.at.kind !== 'edge') return [];
  return (ctx.geometry.edgeHexes.get(ship.at.id) ?? []).filter((h) => isVillage(ctx, h));
}

export function goodsOf(p: Piece): Good[] {
  return cargoOf(p).filter(isGood);
}

export function delivered(ctx: Ctx, seat: number, good: Good): number {
  return epData(ctx).delivered[seat]?.[good] ?? 0;
}

/** After a roll: ships beside the fishing grounds on that number take a fish each. */
export function catchFish(ctx: Ctx, total: number): Record<number, number> {
  const caught: Record<number, number> = {};
  const pirate = pirateShip(ctx)?.at;
  for (const hex of Object.values(ctx.state.hexes)) {
    if (hex.token !== total || !isShoal(ctx, hex.id)) continue;
    if (pirate?.kind === 'hex' && pirate.id === hex.id) continue;
    for (const e of ctx.geometry.hexEdges.get(hex.id) ?? [])
      for (const ship of ctx.piecesAt({ kind: 'edge', id: e })) {
        if (ship.type !== 'ship' || ship.owner === null) continue;
        if (cargoRoom(ship) < CARGO_SIZE.fish!) continue;
        ship.props.cargo = [...cargoOf(ship), 'fish'];
        caught[ship.owner] = (caught[ship.owner] ?? 0) + 1;
      }
  }
  if (Object.keys(caught).length) ctx.emit({ type: 'shipsFished', total, caught });
  return caught;
}

const buySpice = action<{ ship: string }>({
  phases: ['main', 'sail'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    if (!hasSpice(ctx)) return 'There are no spice villages in this game';
    const ship = ownShip(ctx, a.player, a.ship);
    if (typeof ship === 'string') return ship;
    if (!villagesBeside(ctx, ship).length) return 'The ship must be beside a spice village';
    if (cargoRoom(ship) < CARGO_SIZE.spice!) return 'There is no room aboard';
    if (!ctx.has(a.player, { [GOLD]: SPICE_PRICE })) return `Spice costs ${SPICE_PRICE} gold`;
    return null;
  },
  apply(ctx, a) {
    const ship = ctx.state.pieces[a.ship]!;
    ctx.pay(a.player, { [GOLD]: SPICE_PRICE });
    ship.props.cargo = [...cargoOf(ship), 'spice'];
    ctx.emit({ type: 'spiceBought', player: a.player, ship: a.ship, gold: SPICE_PRICE });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active || !hasSpice(ctx)) return [];
    return ctx.piecesOf(player, 'ship').map((s) => ({ type: 'buySpice', player, ship: s.id }));
  },
});

const deliverGoods = action<{ ship: string }>({
  phases: ['main', 'sail'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    const ship = ownShip(ctx, a.player, a.ship);
    if (typeof ship === 'string') return ship;
    if (!goodsOf(ship).length) return 'The ship has no fish or spice aboard';
    if (!harborBeside(ctx, a.player, (ship.at as { id: EdgeId }).id))
      return 'The ship must be beside one of your harbor settlements';
    return null;
  },
  apply(ctx, a) {
    const ship = ctx.state.pieces[a.ship]!;
    const d = epData(ctx);
    const mine = (d.delivered[a.player] ??= {});
    const missions = (d.missions[a.player] ??= {});
    const brought: Partial<Record<Good, number>> = {};
    for (const g of goodsOf(ship)) brought[g] = (brought[g] ?? 0) + 1;
    ship.props.cargo = cargoOf(ship).filter((c) => !isGood(c));
    let steps = 0;
    for (const [g, n] of Object.entries(brought) as [Good, number][]) {
      const before = Math.floor((mine[g] ?? 0) / GOODS_PER_STEP);
      mine[g] = (mine[g] ?? 0) + n;
      const after = Math.floor(mine[g] / GOODS_PER_STEP);
      missions[MISSION[g]] = (missions[MISSION[g]] ?? 0) + after - before;
      steps += after - before;
    }
    ctx.emit({ type: 'goodsDelivered', player: a.player, goods: brought, steps });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    const out: Action[] = [];
    for (const s of ctx.piecesOf(player, 'ship'))
      if (goodsOf(s).length) out.push({ type: 'deliverGoods', player, ship: s.id });
    return out;
  },
});

export const goodsActions: Record<string, ActionDef> = { buySpice, deliverGoods };
