import type { ActionDef, Cards, Ctx, DiceResult, HexId } from '@colonizers/engine';
import { RESOURCES, robber } from '@colonizers/module-base';
import { RATE_MAX, SEVEN_SHOW } from './constants.ts';
import {
  action,
  clampRate,
  investorsData,
  isResource,
  onlyActive,
  rateOf,
  total,
  type Resource,
} from './rules.ts';

/**
 * The exchange market. The bank trades by rates, one per resource: give that
 * many cards of one kind for one card of it. Harbors take 1 off every rate
 * (a 3:1 harbor), or 2 off when you give their resource (a 2:1 harbor),
 * never below 1:1.
 *
 * A 7 sets the rates: after discards and moving the robber, the roller shows
 * 3 of their cards and draws 3 from each rival. The two resources seen most
 * get cheaper by a step; the roller makes two others dearer, then keeps one
 * of the rivals' cards that came to light. No one is robbed otherwise.
 */

/** The bank's rate for one card of `get`, given `give` and this player's harbors. */
export function marketRatio(ctx: Ctx, seat: number, give: string, get: string): number {
  let rate = rateOf(ctx, get);
  let off = 0;
  for (const h of ctx.harborsOf(seat)) {
    if (h.resource === 'any') off = Math.max(off, 1);
    else if (h.resource === give) off = Math.max(off, 2);
  }
  rate -= off;
  return Math.max(1, rate);
}

/** Two dice, but a 7 in the first round is thrown again. */
export function investorsDice(ctx: Ctx): DiceResult {
  for (;;) {
    const a = ctx.rng.int(1, 6);
    const b = ctx.rng.int(1, 6);
    if (a + b !== 7 || ctx.state.turn.round > 0)
      return { dice: { white1: a, white2: b }, total: a + b };
  }
}

const resourceCards = (ctx: Ctx, seat: number): string[] => {
  const hand = ctx.player(seat).hand;
  return RESOURCES.flatMap((r) => Array<string>(hand[r] ?? 0).fill(r));
};

const add = (into: Record<string, number>, cards: Cards | undefined) => {
  for (const [c, n] of Object.entries(cards ?? {})) into[c] = (into[c] ?? 0) + (n ?? 0);
};

/** How often each resource came to light on this 7. */
export function sevenCounts(ctx: Ctx): Record<Resource, number> {
  const s = investorsData(ctx).seven;
  const out: Record<string, number> = Object.fromEntries(RESOURCES.map((r) => [r, 0]));
  if (!s) return out as Record<Resource, number>;
  add(out, s.shown);
  for (const c of Object.values(s.drawn ?? {})) add(out, c);
  for (const c of Object.values(s.discarded)) add(out, c);
  for (const k of Object.keys(out)) if (!isResource(k)) delete out[k];
  return out as Record<Resource, number>;
}

/** Pairs that may get cheaper: no resource left out was seen more often than one picked. */
export function upChoices(ctx: Ctx): [Resource, Resource][] {
  const n = sevenCounts(ctx);
  const out: [Resource, Resource][] = [];
  for (let i = 0; i < RESOURCES.length; i++)
    for (let j = i + 1; j < RESOURCES.length; j++) {
      const pair = [RESOURCES[i], RESOURCES[j]] as [Resource, Resource];
      const low = Math.min(n[pair[0]], n[pair[1]]);
      if (RESOURCES.every((r) => pair.includes(r) || n[r] <= low)) out.push(pair);
    }
  return out;
}

/** Sets that may get dearer after `up`: two of the others that aren't at 6:1 already. */
export function downChoices(ctx: Ctx, up: readonly string[]): Resource[][] {
  const can = RESOURCES.filter((r) => !up.includes(r) && rateOf(ctx, r) < RATE_MAX);
  if (can.length <= 2) return [can];
  const out: Resource[][] = [];
  for (let i = 0; i < can.length; i++)
    for (let j = i + 1; j < can.length; j++) out.push([can[i] as Resource, can[j] as Resource]);
  return out;
}

/** Cards the roller may keep: any rival card that came to light. */
export function keepChoices(
  ctx: Ctx,
): { from: number; card: Resource; source: 'drawn' | 'discarded' }[] {
  const s = investorsData(ctx).seven;
  if (!s) return [];
  const roller = ctx.active;
  const out: { from: number; card: Resource; source: 'drawn' | 'discarded' }[] = [];
  for (const [seat, cards] of Object.entries(s.drawn ?? {}))
    for (const [card, n] of Object.entries(cards))
      if (n && isResource(card) && ctx.has(Number(seat), { [card]: 1 }))
        out.push({ from: Number(seat), card, source: 'drawn' });
  for (const [seat, cards] of Object.entries(s.discarded))
    if (Number(seat) !== roller)
      for (const [card, n] of Object.entries(cards))
        if (n && isResource(card) && ctx.bankHas({ [card]: 1 }))
          out.push({ from: Number(seat), card, source: 'discarded' });
  return out;
}

const returnTo = (ctx: Ctx) => (ctx.state.phase.returnTo as string | undefined) ?? 'main';

function draw(ctx: Ctx): void {
  const s = investorsData(ctx).seven;
  if (!s) return;
  s.drawn = {};
  for (const p of ctx.state.players) {
    if (p.seat === ctx.active) continue;
    const pool = resourceCards(ctx, p.seat);
    const got: Record<string, number> = {};
    for (let i = 0; i < SEVEN_SHOW && pool.length; i++) {
      const [c] = pool.splice(ctx.rng.int(0, pool.length - 1), 1);
      got[c as string] = (got[c as string] ?? 0) + 1;
    }
    s.drawn[String(p.seat)] = got;
  }
  ctx.emit({ type: 'sevenDrawn', player: ctx.active, shown: s.shown ?? {}, drawn: s.drawn });
}

function finish(ctx: Ctx, to: string): void {
  investorsData(ctx).seven = null;
  ctx.setPhase({ id: to });
}

/** After a 7's robber: show cards, or go straight to the rates with none to show. */
export function startExchange(ctx: Ctx, to: string): void {
  if (resourceCards(ctx, ctx.active).length) ctx.setPhase({ id: 'sevenShow', returnTo: to });
  else {
    (investorsData(ctx).seven as { shown?: Cards }).shown = {};
    draw(ctx);
    ctx.setPhase({ id: 'sevenRates', returnTo: to });
  }
}

export const sevenShow = action<{ cards: Cards }>({
  phases: ['sevenShow'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    const want = Math.min(SEVEN_SHOW, resourceCards(ctx, a.player).length);
    const c = a.cards ?? {};
    if (!Object.entries(c).every(([k, n]) => isResource(k) && Number.isInteger(n) && n >= 0))
      return 'Pick resource cards';
    if (total(c) !== want) return `Show ${want} of your resource cards`;
    return ctx.has(a.player, c) ? null : 'You do not have those cards';
  },
  apply(ctx, a) {
    (investorsData(ctx).seven as { shown?: Cards }).shown = { ...a.cards };
    draw(ctx);
    ctx.setPhase({ id: 'sevenRates', returnTo: returnTo(ctx) });
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    // Suggest the biggest piles; any choice is allowed.
    const hand = { ...ctx.player(player).hand };
    const cards: Record<string, number> = {};
    const want = Math.min(SEVEN_SHOW, resourceCards(ctx, player).length);
    for (let i = 0; i < want; i++) {
      const top = RESOURCES.filter((r) => (hand[r] ?? 0) > 0).sort(
        (x, y) => (hand[y] ?? 0) - (hand[x] ?? 0),
      )[0] as string;
      hand[top] = (hand[top] ?? 0) - 1;
      cards[top] = (cards[top] ?? 0) + 1;
    }
    return [{ type: 'sevenShow', player, cards }];
  },
});

const samePair = (x: readonly string[], y: readonly string[]) =>
  x.length === y.length && x.every((r) => y.includes(r));

export const sevenRates = action<{ up: Resource[]; down: Resource[] }>({
  phases: ['sevenRates'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    if (!Array.isArray(a.up) || !upChoices(ctx).some((p) => samePair(p, a.up)))
      return 'Make the two resources seen most cheaper';
    if (!Array.isArray(a.down) || !downChoices(ctx, a.up).some((p) => samePair(p, a.down)))
      return 'Make two other resources dearer (not past 6:1)';
    return null;
  },
  apply(ctx, a) {
    const d = investorsData(ctx);
    for (const r of a.up) d.rates[r] = clampRate(rateOf(ctx, r) - 1);
    for (const r of a.down) d.rates[r] = clampRate(rateOf(ctx, r) + 1);
    ctx.emit({ type: 'ratesSet', player: a.player, up: a.up, down: a.down, rates: { ...d.rates } });
    if (keepChoices(ctx).length) ctx.setPhase({ ...ctx.state.phase, id: 'sevenKeep' });
    else finish(ctx, returnTo(ctx));
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    return upChoices(ctx).flatMap((up) =>
      downChoices(ctx, up).map((down) => ({ type: 'sevenRates', player, up, down })),
    );
  },
});

export const sevenKeep = action<{ from: number; card: Resource; source: 'drawn' | 'discarded' }>({
  phases: ['sevenKeep'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    return keepChoices(ctx).some(
      (k) => k.from === a.from && k.card === a.card && k.source === a.source,
    )
      ? null
      : 'Keep one of the cards your rivals showed or discarded';
  },
  apply(ctx, a) {
    if (a.source === 'drawn') ctx.transfer(a.from, a.player, { [a.card]: 1 });
    else ctx.grant(a.player, { [a.card]: 1 });
    ctx.emit({
      type: 'sevenKept',
      player: a.player,
      from: a.from,
      card: a.card,
      visibleTo: [a.player, a.from],
      redacted: { player: a.player, from: a.from },
    });
    finish(ctx, returnTo(ctx));
  },
  enumerate(ctx, player) {
    if (player !== ctx.active) return [];
    const seen = new Set<string>();
    return keepChoices(ctx)
      .filter((k) => {
        const key = `${k.from}:${k.card}:${k.source}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((k) => ({ type: 'sevenKeep', player, ...k }));
  },
});

export const marketActions: Record<string, ActionDef> = { sevenShow, sevenRates, sevenKeep };

/** Robber move on a 7: no stealing, the exchange follows. */
export function wrapMoveRobber(prev: ActionDef): ActionDef {
  return {
    ...prev,
    apply(ctx, a) {
      const s = investorsData(ctx).seven;
      if (!s || s.shown) return prev.apply(ctx, a);
      const to = returnTo(ctx);
      const hex = a.hex as HexId;
      const r = robber(ctx);
      if (r) ctx.move(r, { kind: 'hex', id: hex });
      else ctx.place('robber', null, { kind: 'hex', id: hex });
      ctx.emit({ type: 'robberMoved', player: a.player, hex });
      startExchange(ctx, to);
    },
  };
}

/** Discards on a 7 count toward the market. */
export function wrapDiscard(prev: ActionDef): ActionDef {
  return {
    ...prev,
    apply(ctx, a) {
      const s = investorsData(ctx).seven;
      if (s) {
        const mine = (s.discarded[String(a.player)] ??= {});
        add(mine as Record<string, number>, a.cards as Cards);
      }
      prev.apply(ctx, a);
    },
  };
}
