import type { ActionDef, Cards, Ctx, HexId, Phase } from '@colonizers/engine';
import { drawProgress, progressOverLimit, type Track } from '@colonizers/module-cities-knights';
import { CIV_BY_ID, READY_CIVS } from './civs.ts';
import { RESOURCES } from '@colonizers/module-base';
import {
  action,
  addGift,
  addPicks,
  civData,
  civOf,
  civView,
  MODULE_ID,
  owes,
  type Gift,
} from './core.ts';

/**
 * Picking civilisations: each player is dealt up to three tiles and keeps one,
 * hidden until everyone has picked. Then the start abilities that hand out
 * cards or pieces take effect, before the starting placements.
 */

/** Tiles each player is dealt: three, or fewer when there aren't enough to go round. */
export function dealSize(players: number, pool: number): number {
  return Math.max(1, Math.min(3, Math.floor(pool / players)));
}

/** Start cards, handed out when the civilisations are shown. */
const START_CARDS: Record<string, Cards> = {
  kongo: { grain: 2, wool: 1 },
  mali: { wool: 2, paper: 2 },
  inuit: { wool: 2, cloth: 2 },
  indonesia: { brick: 2, coin: 2 },
};

/** Start progress cards. */
const START_DECKS: Record<string, Track[]> = {
  judea: ['magic', 'magic'],
  persia: ['politics', 'politics'],
  greece: ['science', 'science'],
  rome: ['religion', 'religion'],
  babylon: ['trade', 'trade'],
  maya: ['magic', 'magic'],
};

/** Start neutral pieces, put on any land hex. */
export const START_NEUTRAL: Record<string, string> = {
  judea: 'wizard',
  persia: 'duke',
  greece: 'scholar',
  babylon: 'merchant',
};

export function deal(ctx: Ctx): void {
  const d = civData(ctx);
  const n = ctx.playerCount;
  const pool = ctx.rng.shuffle(READY_CIVS);
  const size = dealSize(n, pool.length);
  for (let s = 0; s < n; s++) d.dealt[s] = pool.slice(s * size, (s + 1) * size);
  ctx.setPhase({
    id: 'civPick',
    owed: Object.fromEntries(Array.from({ length: n }, (_, s) => [s, 1])),
    returnTo: ctx.state.phase,
  });
}

function reveal(ctx: Ctx, returnTo: Phase): void {
  const d = civData(ctx);
  d.revealed = true;
  d.dealt = {};
  ctx.emit({ type: 'civsRevealed', civs: { ...d.civ } });
  const neutral: Record<number, number> = {};
  for (const p of ctx.state.players) {
    const c = civOf(ctx, p.seat);
    if (!c) continue;
    const cards = START_CARDS[c.id];
    if (cards && ctx.bankHas(cards)) ctx.grant(p.seat, cards);
    for (const deck of START_DECKS[c.id] ?? []) drawProgress(ctx, p.seat, deck);
    if (c.id === 'morocco') addPicks(ctx, p.seat, 2, 'Moorish Kingdom');
    if (START_NEUTRAL[c.id]) neutral[p.seat] = 1;
  }
  if (Object.keys(neutral).length) {
    ctx.setPhase({ id: 'civNeutral', owed: neutral, returnTo });
    return;
  }
  settle(ctx, returnTo);
}

/** Back to the game, putting back progress cards over the limit first. */
function settle(ctx: Ctx, returnTo: Phase): void {
  ctx.setPhase(returnTo);
  const owed = progressOverLimit(ctx);
  if (Object.keys(owed).length) ctx.setPhase({ id: 'progressDiscard', owed, returnTo });
}

const pickCiv = action<{ civ: string }>({
  phases: ['civPick'],
  check(ctx, a) {
    if (!owes(ctx, a.player)) return 'You have picked';
    return civView(ctx).dealt?.[a.player]?.includes(a.civ) ? null : 'Pick one of your tiles';
  },
  apply(ctx, a) {
    const d = civData(ctx);
    d.civ[a.player] = a.civ;
    const ph = ctx.state.phase;
    const owed = ph.owed as Record<number, number>;
    delete owed[a.player];
    ctx.emit({ type: 'civPicked', player: a.player, civ: a.civ, visibleTo: [a.player] });
    if (!Object.keys(owed).length) reveal(ctx, ph.returnTo as Phase);
  },
  enumerate(ctx, player) {
    if (!owes(ctx, player)) return [];
    return (civView(ctx).dealt?.[player] ?? []).map((civ) => ({ type: 'pickCiv', player, civ }));
  },
});

function landHexes(ctx: Ctx): HexId[] {
  return ctx.geometry.hexes.filter((h) => {
    const x = ctx.state.hexes[h];
    return !!x && !x.hidden && ctx.registry.hexTypes[x.type]?.terrain === 'land';
  });
}

/** Judea's Wizard and Persia's Duke go on a hex of their choice. */
const civNeutral = action<{ hex: HexId }>({
  phases: ['civNeutral'],
  check(ctx, a) {
    if (!owes(ctx, a.player)) return 'Nothing to place';
    return landHexes(ctx).includes(a.hex) ? null : 'Pick a land hex';
  },
  apply(ctx, a) {
    const civ = civOf(ctx, a.player)!;
    const type = START_NEUTRAL[civ.id]!;
    const at = { kind: 'hex', id: a.hex } as const;
    const p = ctx.piecesOfType(type)[0];
    if (p) {
      p.owner = a.player;
      ctx.move(p, at);
    } else ctx.place(type, a.player, at);
    ctx.emit({ type: 'neutralPlaced', player: a.player, piece: type, hex: a.hex, from: null });
    const ph = ctx.state.phase;
    const owed = ph.owed as Record<number, number>;
    delete owed[a.player];
    if (!Object.keys(owed).length) settle(ctx, ph.returnTo as Phase);
  },
  enumerate(ctx, player) {
    if (!owes(ctx, player)) return [];
    return landHexes(ctx).map((hex) => ({ type: 'civNeutral', player, hex }));
  },
});

export const setupActions: Record<string, ActionDef> = { pickCiv, civNeutral };

/** A free ship where there are ships, else a road. */
export const shipGift = (ctx: Ctx): Gift => ({
  kind: 'route',
  only: ctx.registry.pieceTypes.ship ? 'ship' : 'road',
});

/** Dots on a number token: how often it comes up, out of 36. */
const pips = (token: number | undefined) => (token ? 6 - Math.abs(7 - token) : 0);

/** Maasai: the resource a player's buildings bring in least. */
export function scarcest(ctx: Ctx, seat: number): string {
  const odds: Record<string, number> = Object.fromEntries(RESOURCES.map((r) => [r, 0]));
  for (const b of ctx.piecesOf(seat)) {
    if (b.at.kind !== 'corner' || !ctx.registry.pieceTypes[b.type]?.building) continue;
    for (const h of ctx.geometry.cornerHexes.get(b.at.id) ?? []) {
      const hex = ctx.state.hexes[h];
      const res = hex && ctx.registry.hexTypes[hex.type]?.produces;
      if (res && odds[res] !== undefined) odds[res] += pips(hex.token);
    }
  }
  return RESOURCES.reduce((best, r) => ((odds[r] ?? 0) < (odds[best] ?? 0) ? r : best));
}

/** City walls on a player's first cities. */
function wallUp(ctx: Ctx, seat: number, n = 1): void {
  for (const city of ctx.piecesOf(seat, 'city').slice(0, n)) {
    if (city.props.wall) continue;
    city.props.wall = true;
    ctx.emit({ type: 'civWall', player: seat, at: (city.at as { id: string }).id });
  }
}

/** Once the starting placements are over: start gifts. */
export function afterSetup(ctx: Ctx): void {
  const d = civView(ctx);
  if (!d.revealed || d.started || ctx.state.phase.id !== 'roll') return;
  civData(ctx).started = true;
  for (const p of ctx.state.players) {
    const c = civOf(ctx, p.seat);
    if (!c) continue;
    const seat = p.seat;
    if (c.cls === 'warlord') addGift(ctx, seat, { kind: 'knight' });
    if (c.id === 'mali') addGift(ctx, seat, { kind: 'route' });
    if (c.id === 'netherlands') {
      addGift(ctx, seat, { kind: 'route' });
      addGift(ctx, seat, { kind: 'route' });
    }
    if (c.id === 'granColombia') {
      addGift(ctx, seat, { kind: 'harbor' });
      addGift(ctx, seat, shipGift(ctx));
      addGift(ctx, seat, shipGift(ctx));
    }
    if (c.id === 'china') addGift(ctx, seat, { kind: 'silk' });
    if (c.id === 'maasai') {
      const res = scarcest(ctx, seat);
      (civData(ctx).lake ??= {})[seat] = res;
      const n = Math.min(2, ctx.state.bank[res] ?? 0);
      if (n > 0) ctx.grant(seat, { [res]: n });
      ctx.emit({ type: 'civLake', player: seat, card: res, count: n });
    }
    if (c.id === 'indonesia' || c.id === 'maya') wallUp(ctx, seat);
    if (c.id === 'khmer') {
      addGift(ctx, seat, { kind: 'building', options: ['diocese', 'citadel'] });
      addGift(ctx, seat, { kind: 'progress', decks: ['religion', 'magic'] });
    }
    if (c.id === 'rome') addGift(ctx, seat, { kind: 'building', options: ['diocese'] });
    if (c.id === 'maya') addGift(ctx, seat, { kind: 'building', options: ['citadel'] });
    if (c.id === 'india') {
      const first = ctx.piecesOf(seat, 'settlement')[0];
      if (first && ctx.supplyLeft(seat, 'city') > 0) {
        ctx.upgrade(first, 'city');
        ctx.emit({ type: 'civTwoCities', player: seat, at: (first.at as { id: string }).id });
      }
      wallUp(ctx, seat, 2);
    }
    if (c.id === 'america') addGift(ctx, seat, { kind: 'settlement', where: 'free' });
    if (c.id === 'papua')
      civData(ctx).papua = ctx
        .piecesOf(seat)
        .flatMap((p) =>
          p.at.kind === 'corner' && ctx.registry.pieceTypes[p.type]?.building ? [p.at.id] : [],
        );
  }
}

/** Hides who was dealt and picked what, until everyone has picked. */
export function redactCivs(data: Record<string, unknown>, viewer: number | null) {
  const d = data as Partial<{ dealt: Record<number, string[]>; civ: Record<number, string> }> & {
    revealed?: boolean;
  };
  const h = (data as { habsburg?: { seat: number; drawn: { card: string; deck: string }[] } })
    .habsburg;
  if (h && viewer !== h.seat)
    data.habsburg = { seat: h.seat, drawn: h.drawn.map((x) => ({ card: 'hidden', deck: x.deck })) };
  if (d.revealed) return data;
  const mine = (rec: Record<number, unknown> | undefined) =>
    Object.fromEntries(Object.entries(rec ?? {}).filter(([s]) => Number(s) === viewer));
  data.dealt = mine(d.dealt);
  data.civ = mine(d.civ);
  return data;
}

export { CIV_BY_ID, MODULE_ID };
