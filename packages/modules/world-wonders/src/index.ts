import type { Action, Cards, Ctx, GameModule, HexId, HexState, Piece } from '@colonizers/engine';
import { RESOURCES } from '@colonizers/module-base';
import { wonderSites } from './requirements.ts';
import { diceActions, wrapRoll } from './dice.ts';
import { afterEffects, effectActions } from './effects.ts';
import {
  buildingActions,
  buildingEffects,
  BUYS,
  paradiseRefund,
  wonderPrice,
  wrapBuy,
  wrapCableRoad,
} from './building.ts';
import { knightActions, onTheWall, updateWall, wonderDefense } from './knights.ts';
import { endHunt, huntActions, redactHunt, startHunt } from './hunt.ts';
import {
  action,
  builtWonders,
  finishedWonders,
  hasStage,
  isResource,
  isWonder,
  markUsed,
  MODULE_ID,
  onlyActive,
  produceHex,
  stageItem,
  usedThisTurn,
  wonderBlocked,
  wonderData,
  wonderPoints,
  type WonderData,
} from './core.ts';
import { WONDER_IDS, WONDERS, type WonderId } from './wonders.ts';

/**
 * World Wonders, from the Civilisations & World Wonders fan expansion. Needs
 * only the base game.
 *
 * - Anyone who meets a wonder's requirement may start it, on a hex beside the
 *   pieces that meet it. One player owns each wonder.
 * - A wonder goes up in four stages, in order, at most one stage a turn
 *   across all your wonders. Each stage gives an ability or points; a finished
 *   wonder is worth 3.
 * - While the robber, pirate or a dragon stands on a wonder's hex, nobody can
 *   build it further.
 * - With `wonderToWin` on (the default), you need a finished wonder to win.
 *
 * List it after Cities & Knights and Greed, Wealth & Power, so its roll
 * wrapper comes outermost.
 */

export * from './wonders.ts';
export * from './core.ts';
export { bayHexes, desertsBy, picksOf, roamingPieces, ROAMING } from './effects.ts';
export { numberDice, rerollChoices, wallChoices, type HeldDice } from './dice.ts';
export { cableCorners, refundOf, BUYS } from './building.ts';
export { OFFERING, offeringPrice } from './knights.ts';
export { huntOf } from './hunt.ts';
export { closedLoop, isTerrain, wonderSites } from './requirements.ts';

// ---- Building ----

/** The next stage this player would build (1 to 4), or a reason they can't. */
export function stageBlock(ctx: Ctx, seat: number, id: WonderId, hex?: HexId): string | null {
  const w = builtWonders(ctx)[id];
  const name = WONDERS[id].name;
  if (w && w.owner !== seat)
    return `${ctx.state.players[w.owner]?.name ?? 'Someone'} owns the ${name}`;
  if (w && w.stages >= 4) return `Your ${name} is finished`;
  const d = ctx.state.data[MODULE_ID] as WonderData | undefined;
  if (d?.lastStage?.[seat] === ctx.state.turn.number)
    return 'You have built a wonder stage this turn';
  if (!w) {
    const sites = wonderSites(ctx, seat, id);
    if (!sites.length) return `To start the ${name} you need ${WONDERS[id].needs}`;
    if (!hex || !sites.includes(hex)) return `Pick a hex for the ${name}`;
    if (wonderBlocked(ctx, hex)) return 'Move the robber off that hex first';
  } else if (wonderBlocked(ctx, w.hex)) {
    return `Something stands on the ${name}'s hex`;
  }
  const stage = (w?.stages ?? 0) + 1;
  if (!ctx.has(seat, ctx.cost(stageItem(id, stage), seat)))
    return `You can not afford ${WONDERS[id].stages[stage - 1]!.name}`;
  return null;
}

const buildWonder = action<{ wonder: WonderId; hex?: HexId }>({
  phases: ['main'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    if (!isWonder(a.wonder)) return 'Pick a wonder';
    return stageBlock(ctx, a.player, a.wonder, a.hex);
  },
  apply(ctx, a) {
    const d = wonderData(ctx);
    const w = d.wonders[a.wonder];
    const stage = (w?.stages ?? 0) + 1;
    ctx.pay(a.player, ctx.cost(stageItem(a.wonder, stage), a.player));
    const hex = w?.hex ?? (a.hex as HexId);
    d.wonders[a.wonder] = { owner: a.player, hex, stages: stage };
    d.lastStage[a.player] = ctx.state.turn.number;
    ctx.emit({ type: 'wonderBuilt', player: a.player, wonder: a.wonder, stage, hex });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    const out: Action[] = [];
    const built = builtWonders(ctx);
    for (const id of WONDER_IDS) {
      const w = built[id];
      if (w) {
        if (w.owner === player && w.stages < 4)
          out.push({ type: 'buildWonder', player, wonder: id });
        continue;
      }
      for (const hex of wonderSites(ctx, player, id))
        out.push({ type: 'buildWonder', player, wonder: id, hex });
    }
    return out;
  },
});

// ---- Abilities ----

/** Hanging Gardens I and Petra III: swaps with the bank. */
const wonderTrade = action<{ wonder: WonderId; give: string; get: string; count?: number }>({
  phases: ['main'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    if (!isResource(a.give) || !isResource(a.get) || a.give === a.get)
      return 'Pick two different resources';
    if (a.wonder === 'hangingGardens') {
      if (!hasStage(ctx, a.player, 'hangingGardens', 1)) return 'You need the Hanging Gardens';
      if (a.give !== 'lumber') return 'The Hanging Gardens swap lumber';
      if (usedThisTurn(ctx, a.player, 'gardens')) return 'Once a turn';
      if (!ctx.has(a.player, { lumber: 1 })) return 'You need a lumber';
      if (!ctx.bankHas({ [a.get]: 1 })) return 'The bank has none left';
      return null;
    }
    if (a.wonder === 'petra') {
      if (!hasStage(ctx, a.player, 'petra', 3)) return 'You need the Silk Road Hub of Petra';
      if (usedThisTurn(ctx, a.player, 'silkRoad')) return 'Once a turn';
      const n = a.count;
      if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) return 'Pick how many';
      if (!ctx.has(a.player, { [a.give]: n })) return `You need ${n} ${a.give}`;
      if (!ctx.bankHas({ [a.get]: n })) return 'The bank has too few';
      return null;
    }
    return 'That wonder has no trade';
  },
  apply(ctx, a) {
    const n = a.wonder === 'petra' ? (a.count as number) : 1;
    markUsed(ctx, a.player, a.wonder === 'petra' ? 'silkRoad' : 'gardens');
    ctx.pay(a.player, { [a.give]: n });
    ctx.grant(a.player, { [a.get]: n });
    ctx.emit({
      type: 'wonderTrade',
      player: a.player,
      wonder: a.wonder,
      gave: { [a.give]: n },
      got: { [a.get]: n },
    });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    const out: Action[] = [];
    if (hasStage(ctx, player, 'hangingGardens', 1) && !usedThisTurn(ctx, player, 'gardens'))
      for (const get of RESOURCES)
        if (get !== 'lumber')
          out.push({ type: 'wonderTrade', player, wonder: 'hangingGardens', give: 'lumber', get });
    if (hasStage(ctx, player, 'petra', 3) && !usedThisTurn(ctx, player, 'silkRoad')) {
      const hand = ctx.player(player).hand;
      for (const give of RESOURCES) {
        const have = hand[give] ?? 0;
        if (!have) continue;
        for (const get of RESOURCES)
          if (get !== give)
            out.push({ type: 'wonderTrade', player, wonder: 'petra', give, get, count: have });
      }
    }
    return out;
  },
});

const CHAAC_COST: Cards = { wool: 2 };

/** Hexes Sacrifice to Chaac can make produce. */
export function chaacHexes(ctx: Ctx): HexId[] {
  return ctx.geometry.hexes.filter((h) => {
    const hex = ctx.state.hexes[h];
    if (!hex || hex.hidden || hex.token === undefined || hex.type === 'gold') return false;
    return ctx.registry.hexTypes[hex.type]?.terrain === 'land';
  });
}

/** Chichen Itza III: pay 2 wool, and one hex produces. */
const wonderHarvest = action<{ hex: HexId }>({
  phases: ['main'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    if (!hasStage(ctx, a.player, 'chichenItza', 3)) return 'You need the Sacrifice to Chaac';
    if (usedThisTurn(ctx, a.player, 'chaac')) return 'Once a turn';
    if (!chaacHexes(ctx).includes(a.hex)) return 'Pick a numbered hex that is not gold';
    if (!ctx.has(a.player, CHAAC_COST)) return 'You need 2 wool';
    return null;
  },
  apply(ctx, a) {
    markUsed(ctx, a.player, 'chaac');
    ctx.pay(a.player, CHAAC_COST);
    const received = produceHex(ctx, a.hex);
    ctx.emit({ type: 'wonderHarvest', player: a.player, hex: a.hex, received });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active || !hasStage(ctx, player, 'chichenItza', 3)) return [];
    if (usedThisTurn(ctx, player, 'chaac')) return [];
    // Only hexes the player is on are worth a look.
    return chaacHexes(ctx)
      .filter((h) =>
        (ctx.geometry.hexCorners.get(h) ?? []).some((c) => ctx.buildingAt(c)?.owner === player),
      )
      .map((hex) => ({ type: 'wonderHarvest', player, hex }));
  },
});

/** Petra I: your 2s also produce on a 3, and your 12s on an 11. */
function petraPrayer(ctx: Ctx): void {
  for (const e of ctx.events) {
    if (e.type !== 'production') continue;
    const echo = e.total === 3 ? 2 : e.total === 11 ? 12 : null;
    if (echo === null) continue;
    for (const p of ctx.state.players) {
      if (!hasStage(ctx, p.seat, 'petra', 1)) continue;
      const got: Cards = {};
      for (const h of ctx.geometry.hexes) {
        if (ctx.state.hexes[h]?.token !== echo) continue;
        for (const [card, n] of Object.entries(produceHex(ctx, h, p.seat)[p.seat] ?? {}))
          got[card] = (got[card] ?? 0) + n;
      }
      if (Object.keys(got).length)
        ctx.emit({ type: 'wonderEcho', player: p.seat, wonder: 'petra', echo, got });
    }
    return;
  }
}

/**
 * Pyramids III: the robber doesn't stop your buildings producing. Other
 * modules' blocks still count: they are worked out again with no robber.
 */
function isisShield(ctx: Ctx, hex: HexState, piece: Piece, value: boolean): boolean {
  if (!value || piece.owner === null) return value;
  if (!hasStage(ctx, piece.owner, 'pyramids', 3)) return value;
  const robbed = ctx.piecesAt({ kind: 'hex', id: hex.id }).some((p) => p.type === 'robber');
  if (!robbed) return value;
  let v = false;
  for (const m of ctx.registry.modules) {
    if (m.id === MODULE_ID) break;
    const fn = m.reducers?.hexBlocked;
    if (fn) v = fn(ctx, hex, piece, v);
  }
  return v;
}

const STAGE_COSTS = Object.fromEntries(
  WONDER_IDS.flatMap((id) =>
    WONDERS[id].stages.map((s, i) => [stageItem(id, i + 1), s.cost] as const),
  ),
);

export const worldWondersModule: GameModule = {
  id: MODULE_ID,
  name: 'World Wonders',
  requires: ['base'],
  settings: {
    /** Only a player with a finished wonder can win. */
    wonderToWin: true,
  },
  costs: STAGE_COSTS,
  actions: {
    buildWonder,
    wonderTrade,
    wonderHarvest,
    ...diceActions,
    ...effectActions,
    ...buildingActions,
    ...knightActions,
    ...huntActions,
  },
  wrapActions: { roll: wrapRoll, buildRoad: wrapCableRoad, placeFreeRoad: wrapCableRoad },
  wrapActionsIfPresent: Object.fromEntries(BUYS.map((t) => [t, wrapBuy])),
  hooks: {
    init(ctx) {
      wonderData(ctx);
    },
    afterAction(ctx, a) {
      petraPrayer(ctx);
      afterEffects(ctx);
      buildingEffects(ctx, a);
      updateWall(ctx);
      startHunt(ctx);
    },
    turnEnded(ctx) {
      paradiseRefund(ctx);
      endHunt(ctx);
    },
  },
  redact: redactHunt,
  reducers: {
    vp: (ctx, seat, value) => value + wonderPoints(ctx, seat),
    canWin: (ctx, seat, value) =>
      value &&
      (ctx.setting<boolean>('wonderToWin') === false || finishedWonders(ctx, seat).length > 0),
    hexBlocked: isisShield,
    cost: (ctx, item, seat, value) => wonderPrice(ctx, item, seat, value),
    defense: wonderDefense,
    shielded: onTheWall,
    tradeRatio: (ctx, seat, card, value) =>
      isResource(card) && hasStage(ctx, seat, 'lighthouse', 3) ? Math.min(value, 2) : value,
    swapRatio: (ctx, seat, give, get, value) =>
      give === 'ore' && isResource(get) && hasStage(ctx, seat, 'colossus', 3) ? 1 : value,
  },
};
