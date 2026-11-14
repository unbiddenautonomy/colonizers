import type { Action, ActionDef, Cards, CornerId, HexId, Piece } from '@colonizers/engine';
import { NUKE, NUKE_ANY, NUKE_COST, NUKE_RANGE } from './constants.ts';
import { loseMetropolis } from './ck.ts';
import { checkDestroyed } from './fate.ts';
import { hexDistance, setTurnFlag, soldiersData, wallsOf } from './rules.ts';
import type { Ctx } from '@colonizers/engine';

/**
 * The nuke: once a game, for 6 ore, 5 grain and 5 cards of any kind. It
 * stands at one of your buildings until you set it off in your fighting, on
 * a field up to six away: the field makes nothing for the rest of the game,
 * and every building on it drops a level (a wall first). Units are spared.
 */

function action<T>(def: ActionDef<Action & T>): ActionDef {
  return def as unknown as ActionDef;
}

const total = (c: Cards) => Object.values(c).reduce((s, n) => s + n, 0);

function validPayment(ctx: Ctx, cards: unknown): cards is Cards {
  if (!cards || typeof cards !== 'object') return false;
  const c = cards as Record<string, unknown>;
  if (
    !Object.entries(c).every(
      ([k, n]) =>
        ctx.registry.cardTypes[k]?.countsForHandLimit && Number.isInteger(n) && (n as number) >= 0,
    )
  )
    return false;
  const want = total(NUKE_COST) + NUKE_ANY;
  if (total(c as Cards) !== want) return false;
  return Object.entries(NUKE_COST).every(([k, n]) => ((c[k] as number) ?? 0) >= n);
}

export function nukeOf(ctx: Ctx, seat: number): Piece | undefined {
  return ctx.piecesOf(seat, NUKE)[0];
}

/** Fields a nuke at this corner can reach. */
export function nukeTargets(ctx: Ctx, nuke: Piece): HexId[] {
  if (nuke.at.kind !== 'corner') return [];
  const from = ctx.geometry.cornerHexes.get(nuke.at.id) ?? [];
  const nuked = soldiersData(ctx).nuked ?? {};
  return (Object.keys(ctx.state.hexes) as HexId[]).filter(
    (h) => ctx.isLand(h) && !nuked[h] && from.some((f) => hexDistance(ctx, f, h) <= NUKE_RANGE),
  );
}

export const buyNuke = action<{ corner: CornerId; cards: Cards }>({
  phases: ['main'],
  check(ctx, a) {
    if (a.player !== ctx.active) return 'Not your turn';
    if (soldiersData(ctx).nukeBought?.[String(a.player)]) return 'Each player gets one nuke a game';
    if (ctx.buildingAt(a.corner)?.owner !== a.player)
      return 'The nuke stands at one of your settlements or cities';
    if (!validPayment(ctx, a.cards))
      return `A nuke costs 6 ore, 5 grain and ${NUKE_ANY} more cards of any kind`;
    return ctx.has(a.player, a.cards) ? null : 'You can not afford that';
  },
  apply(ctx, a) {
    ctx.pay(a.player, a.cards);
    const d = soldiersData(ctx);
    d.nukeBought = { ...d.nukeBought, [String(a.player)]: true };
    ctx.place(NUKE, a.player, { kind: 'corner', id: a.corner });
    ctx.emit({ type: 'nukeBought', player: a.player, at: a.corner });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active || soldiersData(ctx).nukeBought?.[String(player)]) return [];
    // Pay the fixed part, then the rest from the biggest piles.
    const hand = { ...ctx.player(player).hand };
    const cards: Record<string, number> = { ...NUKE_COST };
    for (const [k, n] of Object.entries(NUKE_COST)) hand[k] = (hand[k] ?? 0) - n;
    if (Object.values(hand).some((n) => n < 0)) return [];
    for (let i = 0; i < NUKE_ANY; i++) {
      const pile = Object.entries(hand)
        .filter(([k, n]) => n > 0 && ctx.registry.cardTypes[k]?.countsForHandLimit)
        .sort((x, y) => y[1] - x[1])[0];
      if (!pile) return [];
      hand[pile[0]] = pile[1] - 1;
      cards[pile[0]] = (cards[pile[0]] ?? 0) + 1;
    }
    return ctx
      .piecesOf(player)
      .filter((p) => ctx.registry.pieceTypes[p.type]?.building && p.at.kind === 'corner')
      .map((p) => ({ type: 'buyNuke', player, corner: (p.at as { id: CornerId }).id, cards }));
  },
});

/** One level down for a building on the nuked field: a wall, a city, or the settlement itself. */
function blast(ctx: Ctx, b: Piece): void {
  const walls = wallsOf(b);
  if (walls > 0) b.props.walls = walls - 1;
  else if (typeof b.props.metropolis === 'string') loseMetropolis(ctx, b);
  else if (b.type !== 'settlement' && ctx.supplyLeft(b.owner as number, 'settlement') > 0) {
    const s = ctx.upgrade(b, 'settlement');
    delete s.props.damaged;
    delete s.props.cargo;
  } else ctx.remove(b);
}

export const detonateNuke = action<{ hex: HexId }>({
  phases: ['campaign'],
  check(ctx, a) {
    if (a.player !== ctx.active) return 'Not your turn';
    const nuke = nukeOf(ctx, a.player);
    if (!nuke) return 'You have no nuke';
    return nukeTargets(ctx, nuke).includes(a.hex) ? null : 'The nuke can not reach that field';
  },
  apply(ctx, a) {
    setTurnFlag(ctx, 'fought');
    ctx.remove(nukeOf(ctx, a.player) as Piece);
    const d = soldiersData(ctx);
    d.nuked = { ...d.nuked, [a.hex]: true };
    const hit = new Set<number>();
    for (const c of ctx.geometry.hexCorners.get(a.hex) ?? []) {
      const b = ctx.buildingAt(c);
      if (!b || b.owner === null) continue;
      hit.add(b.owner);
      blast(ctx, b);
    }
    ctx.emit({ type: 'nukeDetonated', player: a.player, hex: a.hex, hit: [...hit] });
    for (const seat of hit) checkDestroyed(ctx, seat, a.player);
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    const nuke = nukeOf(ctx, player);
    return nuke ? nukeTargets(ctx, nuke).map((hex) => ({ type: 'detonateNuke', player, hex })) : [];
  },
});
