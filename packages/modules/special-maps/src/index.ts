import type { ActionDef, Ctx, GameModule, HexId } from '@colonizers/engine';
import { updateLongestRoad } from '@colonizers/module-base';

/**
 * Hexes for the special maps.
 *
 * - **Volcano**: pays like a gold field (any resource, with Seafarers' gold
 *   pick). When its number is rolled, a die picks one of its six corners: a
 *   settlement there is destroyed and a city drops to a settlement.
 * - **Lake**: water inside the island. Nothing grows there and the robber
 *   can't go there; harbors on its shore work like any harbor.
 *
 * List it after Seafarers, so volcano payouts join the gold pick.
 */
export const MODULE_ID = 'special-maps';

function erupt(ctx: Ctx, hex: HexId): void {
  const corners = ctx.geometry.hexCorners.get(hex) ?? [];
  const face = ctx.rng.int(1, 6);
  const corner = corners[face - 1];
  const building = corner ? ctx.buildingAt(corner) : undefined;
  ctx.emit({
    type: 'eruption',
    hex,
    face,
    corner: corner ?? null,
    owner: building?.owner ?? null,
    hit: building?.type ?? null,
  });
  if (!building || building.owner === null) return;
  if (building.type === 'city' && ctx.supplyLeft(building.owner, 'settlement') > 0) {
    ctx.upgrade(building, 'settlement');
  } else {
    ctx.remove(building);
  }
  updateLongestRoad(ctx);
}

export const specialMapsModule: GameModule = {
  id: MODULE_ID,
  name: 'Special map hexes',
  requires: ['base'],
  hexTypes: {
    volcano: { terrain: 'land' },
    lake: { terrain: 'sea', robber: false },
  },
  wrapActions: {
    roll: (prev): ActionDef => ({
      ...prev,
      apply(ctx, a) {
        prev.apply(ctx, a);
        const total = (ctx.state.data.base as { lastRoll?: { total: number } }).lastRoll?.total;
        if (!total || total === 7) return;
        for (const h of Object.values(ctx.state.hexes))
          if (h.type === 'volcano' && h.token === total && !h.hidden) erupt(ctx, h.id);
      },
    }),
  },
  reducers: {
    hexYield(ctx, hex, piece, value) {
      if (hex.type !== 'volcano' || piece.owner === null) return value;
      const sea = ctx.state.data.seafarers as { pendingGold?: Record<number, number> } | undefined;
      const n = ctx.registry.pieceTypes[piece.type]?.production ?? 0;
      if (sea?.pendingGold && n > 0)
        sea.pendingGold[piece.owner] = (sea.pendingGold[piece.owner] ?? 0) + n;
      return value;
    },
  },
};
