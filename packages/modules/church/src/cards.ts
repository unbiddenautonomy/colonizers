import type { Action, ActionDef, Cards, CornerId, Ctx, Phase, Piece } from '@colonizers/engine';
import { RESOURCES } from '@colonizers/module-base';
import {
  activeTracks,
  ckData,
  crusaderCard,
  defineFanCards,
  fanDeck,
  INDULGENCE,
  indulgenceCard,
  isActive,
  knightsOf,
  levels,
  others,
  pickTarget,
  progressCount,
  reformationCard,
  refugeCard,
  seatAt,
  takeFromEach,
  targets,
  type FanCard,
  type FanPlay as Play,
  type Track,
} from '@colonizers/module-cities-knights';
import { MODULE_ID } from './constants.ts';
import { churchData, churchView } from './rules.ts';

/**
 * The Religion deck: seventeen cards (eighteen with Witches, Wizards &
 * Dragons, which adds Witch Burning). Each card is a row in CARDS: when it can
 * be played, the choices it offers, and what it does.
 */

/** Resources a player's buildings touch: the most Anathema can ask for. */
export function producible(ctx: Ctx, seat: number): string[] {
  const out = new Set<string>();
  for (const b of ctx.piecesOf(seat)) {
    if (b.at.kind !== 'corner' || !ctx.registry.pieceTypes[b.type]?.building) continue;
    for (const h of ctx.geometry.cornerHexes.get(b.at.id) ?? []) {
      const hex = ctx.state.hexes[h];
      const res = hex && !hex.hidden ? ctx.registry.hexTypes[hex.type]?.produces : undefined;
      if (res && (RESOURCES as readonly string[]).includes(res)) out.add(res);
    }
  }
  return [...out];
}

/** Every way to name three of these resources (repeats allowed). */
function threeOf(cards: string[]): Cards[] {
  const out: Cards[] = [];
  for (let i = 0; i < cards.length; i++)
    for (let j = i; j < cards.length; j++)
      for (let k = j; k < cards.length; k++) {
        const c: Cards = {};
        for (const x of [cards[i]!, cards[j]!, cards[k]!]) c[x] = (c[x] ?? 0) + 1;
        out.push(c);
      }
  return out;
}

/** Tracks Anathema can shut: Science, and Magic when it is in the game. */
const banTracks = (ctx: Ctx): Track[] =>
  (['science', 'magic'] as Track[]).filter((t) => activeTracks(ctx).includes(t));

export const CARDS = defineFanCards(MODULE_ID, {
  superstition: {
    count: 1,
    aims: true,
    options: targets,
    check(ctx, a) {
      const e = pickTarget(ctx, a);
      if (e) return e;
      const lv = levels(ctx, a.target as number);
      if (Math.max(lv.science, lv.magic) <= lv.religion)
        return 'Pick a player further on in Science or Magic than in Religion';
      return knightsOf(ctx, a.target as number).some(isActive)
        ? null
        : 'That player has no active knights';
    },
    apply(ctx, a) {
      for (const k of knightsOf(ctx, a.target as number)) {
        k.props.active = false;
        delete k.props.activatedTurn;
      }
      ctx.emit({
        type: 'knightsDeactivated',
        player: a.player,
        target: a.target,
        card: 'superstition',
      });
    },
  },
  [INDULGENCE]: indulgenceCard(1),
  bookBurning: {
    count: 1,
    check: (ctx) =>
      ctx.state.players.some((p) => progressCount(ctx, p.seat) > 0)
        ? null
        : 'Nobody holds a progress card',
    apply(ctx) {
      const owed: Record<number, number> = {};
      for (const p of ctx.state.players) if (progressCount(ctx, p.seat) > 0) owed[p.seat] = 1;
      ctx.setPhase({ id: 'progressDiscard', owed, reason: 'bookBurning', returnTo: MAIN });
    },
  },
  dogma: takeFromEach('science'),
  witchBurning: takeFromEach('magic'),
  exile: {
    count: 1,
    check: (ctx) => (exiles(ctx).length ? null : 'There is nothing to send away'),
    apply(ctx, a) {
      for (const p of exiles(ctx)) ctx.remove(p);
      const d = churchData(ctx);
      if (d.inquisitor) {
        d.inquisitor = null;
        syncInquisitor(ctx);
      }
      ctx.emit({ type: 'churchExile', player: a.player });
    },
  },
  lent: {
    count: 1,
    aims: true,
    when: 'beforeOrAfter',
    options: targets,
    check: (ctx, a) =>
      pickTarget(ctx, a) ?? (churchView(ctx).lent ? 'Someone is already fasting' : null),
    apply(ctx, a) {
      churchData(ctx).lent = { target: a.target as number, owed: { grain: 1, wool: 1 } };
      ctx.emit({ type: 'churchLent', player: a.player, target: a.target });
    },
  },
  inquisitor: {
    count: 3,
    options: (ctx) => inquisitorSpots(ctx).map((option) => ({ option })),
    check: (ctx, a) =>
      inquisitorSpots(ctx).includes(a.option as CornerId)
        ? null
        : 'Pick a city (not a Citadel) without the Inquisitor',
    apply(ctx, a) {
      churchData(ctx).inquisitor = a.option as CornerId;
      syncInquisitor(ctx);
      // The Inquisitor drives off a Wizard standing there (Witches, Wizards & Dragons).
      for (const p of ctx.piecesAt({ kind: 'corner', id: a.option as CornerId }))
        if (p.type === 'wizard') ctx.remove(p);
      const owner = ctx.buildingAt(a.option as CornerId)?.owner;
      ctx.emit({ type: 'churchInquisitor', player: a.player, target: owner, at: a.option });
    },
  },
  anathema: {
    count: 2,
    aims: true,
    options(ctx, seat) {
      const out: Partial<Play>[] = [];
      for (const target of others(ctx, seat)) {
        const names = producible(ctx, target);
        if (!names.length) continue;
        for (const option of banTracks(ctx))
          for (const cards of threeOf(names)) out.push({ target, option, cards });
      }
      return out;
    },
    check(ctx, a) {
      const e = pickTarget(ctx, a);
      if (e) return e;
      if (!banTracks(ctx).includes(a.option as Track)) return 'Pick Science or Magic';
      const t = a.target as number;
      if (churchView(ctx).bans?.some((b) => b.target === t && b.track === a.option))
        return 'That track is already shut';
      const c = a.cards ?? {};
      const names = producible(ctx, t);
      const total = Object.values(c).reduce((s, n) => s + n, 0);
      if (total !== 3 || Object.keys(c).some((r) => !names.includes(r)))
        return 'Name three resources their buildings can bring in';
      return null;
    },
    apply(ctx, a) {
      (churchData(ctx).bans ??= []).push({
        by: a.player,
        target: a.target as number,
        track: a.option as Track,
        owed: { ...(a.cards as Cards) },
      });
      ctx.emit({ type: 'churchAnathema', player: a.player, target: a.target, track: a.option });
    },
  },
  churchTax: {
    count: 1,
    check: (ctx, a) => (taxPayers(ctx, a.player).length ? null : 'Nobody has a resource'),
    apply(ctx, a) {
      const owed = Object.fromEntries(taxPayers(ctx, a.player).map((s) => [s, 1]));
      ctx.setPhase({ id: 'churchTax', owed, by: a.player, returnTo: MAIN });
    },
  },
  crusader: crusaderCard(2),
  reformation: reformationCard(),
  census: {
    count: 1,
    check: (ctx, a) => (Object.keys(censusOwed(ctx, a.player)).length ? null : 'Nobody owes'),
    apply(ctx, a) {
      ctx.setPhase({
        id: 'discard',
        owed: censusOwed(ctx, a.player),
        returnTo: 'main',
        skipRobber: true,
      });
    },
  },
  refuge: refugeCard(1),
} satisfies Record<string, FanCard>);

/** The Religion deck for the tracks in play. */
export const religionDeck = (tracks: readonly string[]) => fanDeck(CARDS, tracks);

// ---- Helpers for the cards ----

/** Exile: the robber, the pirate and the merchant leave the board (the Inquisitor too). */
function exiles(ctx: Ctx): Piece[] {
  return Object.values(ctx.state.pieces).filter((p) =>
    ['robber', 'pirate', 'merchant', 'wizard'].includes(p.type),
  );
}

/** Cities (not Citadels) the Inquisitor could go to. */
export function inquisitorSpots(ctx: Ctx): CornerId[] {
  const at = churchView(ctx).inquisitor ?? null;
  return Object.values(ctx.state.pieces).flatMap((p) =>
    p.type === 'city' && p.at.kind === 'corner' && seatAt(p) !== 'citadel' && p.at.id !== at
      ? [p.at.id]
      : [],
  );
}

/** The owner of the Inquisitor's city loses their level 3 abilities. */
export function syncInquisitor(ctx: Ctx): void {
  const corner = churchView(ctx).inquisitor;
  const b = corner ? ctx.buildingAt(corner) : undefined;
  if (corner && (!b || b.type !== 'city')) churchData(ctx).inquisitor = null;
  const seat = corner && b?.type === 'city' ? (b.owner as number) : null;
  const d = ckData(ctx);
  const want = seat === null ? [] : [seat];
  if (JSON.stringify(d.noAbilities ?? []) !== JSON.stringify(want)) d.noAbilities = want;
}

const taxPayers = (ctx: Ctx, seat: number) =>
  others(ctx, seat).filter((s) => RESOURCES.some((r) => ctx.has(s, { [r]: 1 })));

function censusOwed(ctx: Ctx, seat: number): Record<number, number> {
  const out: Record<number, number> = {};
  for (const s of others(ctx, seat)) {
    const n = Math.min(progressCount(ctx, s), ctx.handSize(s, false));
    if (n > 0) out[s] = n;
  }
  return out;
}

// ---- Steps after playing a card ----

const MAIN: Phase = { id: 'main' };
const back = (ctx: Ctx) => ctx.setPhase(ctx.state.phase.returnTo as Phase);

/** Church Tax: each other player hands over a resource of their choice. */
const churchTaxPay: ActionDef = {
  phases: ['churchTax'],
  check(ctx, a) {
    const owed = ctx.state.phase.owed as Record<number, number>;
    if (!owed[a.player]) return 'You owe nothing';
    if (!(RESOURCES as readonly string[]).includes(a.card as string)) return 'Pick a resource';
    return ctx.has(a.player, { [a.card as string]: 1 }) ? null : 'You do not have that';
  },
  apply(ctx, a) {
    const ph = ctx.state.phase;
    ctx.transfer(a.player, ph.by as number, { [a.card as string]: 1 });
    ctx.emit({ type: 'gift', player: a.player, to: ph.by, cards: { [a.card as string]: 1 } });
    const owed = ph.owed as Record<number, number>;
    delete owed[a.player];
    if (!Object.keys(owed).length) back(ctx);
  },
  enumerate(ctx, player) {
    if (!(ctx.state.phase.owed as Record<number, number>)[player]) return [];
    return RESOURCES.filter((r) => ctx.has(player, { [r]: 1 })).map((card) => ({
      type: 'churchTaxPay',
      player,
      card,
    }));
  },
};

/** Lent and Anathema: pay what you owe, a card at a time, whenever you like. */
const churchPay: ActionDef = {
  phases: ['main'],
  check(ctx, a) {
    if (a.player !== ctx.active) return 'Pay on your turn';
    const debt = debtOf(ctx, a.player, a.debt as string);
    if (!debt) return 'You owe nothing there';
    const card = a.card as string;
    if (!(debt[card] ?? 0)) return 'That is not owed';
    return ctx.has(a.player, { [card]: 1 }) ? null : 'You do not have that';
  },
  apply(ctx, a) {
    const d = churchData(ctx);
    const card = a.card as string;
    if (a.debt === 'lent' && d.lent) {
      ctx.pay(a.player, { [card]: 1 });
      d.lent.owed[card] = (d.lent.owed[card] ?? 0) - 1;
      if (Object.values(d.lent.owed).every((n) => n <= 0)) {
        d.lent = null;
        ctx.emit({ type: 'churchLentOver', player: a.player });
      }
      return;
    }
    const ban = d.bans?.find((b) => b.target === a.player && b.track === a.debt);
    if (!ban) return;
    ctx.transfer(a.player, ban.by, { [card]: 1 });
    ban.owed[card] = (ban.owed[card] ?? 0) - 1;
    if (Object.values(ban.owed).every((n) => n <= 0)) {
      d.bans = (d.bans ?? []).filter((b) => b !== ban);
      ctx.emit({ type: 'churchAnathemaOver', player: a.player, track: ban.track });
    }
  },
  enumerate(ctx, player) {
    const out: Action[] = [];
    if (player !== ctx.active) return out;
    const v = churchView(ctx);
    const debts: [string, Cards][] = [];
    if (v.lent?.target === player) debts.push(['lent', v.lent.owed]);
    for (const b of v.bans ?? []) if (b.target === player) debts.push([b.track, b.owed]);
    for (const [debt, owed] of debts)
      for (const [card, n] of Object.entries(owed))
        if (n > 0 && ctx.has(player, { [card]: 1 }))
          out.push({ type: 'churchPay', player, debt, card });
    return out;
  },
};

/** What a player still owes for Lent, or for Anathema on a track. */
export function debtOf(ctx: Ctx, seat: number, debt: string): Cards | null {
  const v = churchView(ctx);
  if (debt === 'lent') return v.lent?.target === seat ? v.lent.owed : null;
  return v.bans?.find((b) => b.target === seat && b.track === debt)?.owed ?? null;
}

export const cardActions: Record<string, ActionDef> = { churchTaxPay, churchPay };

export { MODULE_ID };
