import type { Action, ActionDef, Cards, CornerId, Ctx, Phase, Piece } from '@colonizers/engine';
import { RESOURCES } from '@colonizers/module-base';
import {
  activeTracks,
  canPlaceKnight,
  ckData,
  drawProgress,
  giveProgress,
  holdsProgress,
  INDULGENCE,
  INDULGENCE_REROLLS,
  indulgenceTiming,
  isActive,
  knightsOf,
  levels,
  playIndulgence,
  progressCount,
  progressHeld,
  spendProgress,
  type Track,
} from '@colonizers/module-cities-knights';
import { MODULE_ID } from './constants.ts';
import { churchData, churchView } from './rules.ts';

/**
 * The Religion deck: seventeen cards (eighteen with Witches, Wizards &
 * Dragons, which adds Witch Burning). Each card is a row in CARDS: when it can
 * be played, the choices it offers, and what it does.
 */

const MAIN: Phase = { id: 'main' };
const back = (ctx: Ctx) => ctx.setPhase(ctx.state.phase.returnTo as Phase);

type Play = Action & { card: string; target?: number; option?: string; cards?: Cards };
type When = 'main' | 'beforeOrAfter' | 'indulgence';

interface CardDef {
  count: number;
  /** Only with this track in the game (Witch Burning needs Magic). */
  needs?: Track;
  when?: When;
  options?(ctx: Ctx, seat: number): Partial<Play>[];
  check?(ctx: Ctx, a: Play): string | null;
  apply(ctx: Ctx, a: Play): void;
}

const others = (ctx: Ctx, seat: number) =>
  ctx.state.players.map((p) => p.seat).filter((s) => s !== seat);

const heldIn = (ctx: Ctx, seat: number, deck: Track) =>
  (ctx.player(seat).held[deck] ?? []).map((h) => h.card);

function returnHeld(ctx: Ctx, seat: number, deck: Track, card: string): void {
  const held = ctx.player(seat).held[deck] ?? [];
  const i = held.findIndex((h) => h.card === card);
  if (i < 0) return;
  held.splice(i, 1);
  (ctx.state.decks[deck] ??= []).push(card);
}

const pickTarget = (ctx: Ctx, a: Play): string | null =>
  Number.isInteger(a.target) && a.target !== a.player && ctx.state.players[a.target as number]
    ? null
    : 'Pick another player';

const targets = (ctx: Ctx, seat: number) => others(ctx, seat).map((target) => ({ target }));

/** Dogma and Witch Burning: a card of that deck from each other player; keep one. */
function takeFromEach(deck: Track): CardDef {
  return {
    count: 1,
    ...(deck === 'magic' ? { needs: 'magic' as Track } : {}),
    check: (ctx, a) =>
      others(ctx, a.player).some((s) => heldIn(ctx, s, deck).length)
        ? null
        : `Nobody else has a ${deck} card`,
    apply(ctx, a) {
      const pool: { card: string; deck: Track }[] = [];
      for (const s of others(ctx, a.player)) {
        const held = heldIn(ctx, s, deck);
        if (!held.length) continue;
        const card = held[ctx.rng.int(0, held.length - 1)] as string;
        const list = ctx.player(s).held[deck] ?? [];
        list.splice(
          list.findIndex((h) => h.card === card),
          1,
        );
        pool.push({ card, deck });
        ctx.emit({ type: 'progressTaken', player: a.player, from: s, deck });
      }
      if (pool.length === 1) giveProgress(ctx, a.player, deck, pool[0]!.card);
      else if (pool.length > 1)
        ctx.setPhase({ id: 'churchKeep', by: a.player, pool, returnTo: MAIN });
    },
  };
}

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

export const CARDS: Record<string, CardDef> = {
  superstition: {
    count: 1,
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
  [INDULGENCE]: {
    count: 1,
    when: 'indulgence',
    options: () => INDULGENCE_REROLLS.map((option) => ({ option })),
    check: (_ctx, a) =>
      INDULGENCE_REROLLS.includes(a.option ?? '') ? null : 'Pick the dice to throw again',
    apply(ctx, a) {
      playIndulgence(ctx, a.player, a.option as string);
    },
  },
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
      const owner = ctx.buildingAt(a.option as CornerId)?.owner;
      ctx.emit({ type: 'churchInquisitor', player: a.player, target: owner, at: a.option });
    },
  },
  anathema: {
    count: 2,
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
  crusader: {
    count: 2,
    check: (ctx, a) => {
      if (ctx.supplyLeft(a.player, 'knight1') <= 0) return 'No basic knights left';
      return ctx.geometry.corners.some((c) => !canPlaceKnight(ctx, a.player, c))
        ? null
        : 'There is no spot for a knight';
    },
    apply(ctx) {
      ctx.setPhase({ id: 'placeDeserter', knightType: 'knight1', active: true, returnTo: MAIN });
    },
  },
  reformation: {
    count: 1,
    options: () => [{ option: 'mine' }, { option: 'others' }],
    check(ctx, a) {
      if (a.option === 'mine')
        return progressCount(ctx, a.player) > 0 ? null : 'You have no other progress cards';
      if (a.option === 'others')
        return others(ctx, a.player).some((s) => progressCount(ctx, s) > 0)
          ? null
          : 'Nobody else has a progress card';
      return 'Pick one';
    },
    apply(ctx, a) {
      const seats = a.option === 'mine' ? [a.player] : others(ctx, a.player);
      for (const s of seats) {
        const had = progressHeld(ctx, s);
        for (const h of had) returnHeld(ctx, s, h.deck, h.card);
        for (const h of had) drawProgress(ctx, s, h.deck);
      }
      ctx.emit({ type: 'churchReformation', player: a.player, option: a.option });
    },
  },
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
  refuge: {
    count: 1,
    when: 'beforeOrAfter',
    check: (ctx, a) =>
      ckData(ctx).refuge?.includes(a.player) ? 'Your cities are already safe' : null,
    apply(ctx, a) {
      (ckData(ctx).refuge ??= []).push(a.player);
      ctx.emit({ type: 'churchRefuge', player: a.player });
    },
  },
};

/** The Religion deck for the tracks in play. */
export function religionDeck(tracks: readonly string[]): Record<string, number> {
  return Object.fromEntries(
    Object.entries(CARDS)
      .filter(([, d]) => !d.needs || tracks.includes(d.needs))
      .map(([c, d]) => [c, d.count]),
  );
}

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
    p.type === 'city' && p.at.kind === 'corner' && !p.props.citadel && p.at.id !== at
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

// ---- Playing ----

const isChurchCard = (c: unknown): c is string => typeof c === 'string' && c in CARDS;

function timing(ctx: Ctx, a: Play, def: CardDef): string | null {
  const ph = ctx.state.phase;
  if (def.when === 'indulgence') return indulgenceTiming(ctx, a.player);
  if (ph.id === 'indulgence') return 'Not while a roll waits for an Indulgence';
  if (a.player !== ctx.active) return 'Not your turn';
  const when = def.when ?? 'main';
  if (when === 'main' && ph.id !== 'main') return 'Progress cards are played after rolling';
  if (when === 'beforeOrAfter' && ph.id !== 'roll' && ph.id !== 'main') return 'Not now';
  return null;
}

function checkCard(ctx: Ctx, a: Play): string | null {
  const def = CARDS[a.card] as CardDef;
  if (!holdsProgress(ctx, a.player, a.card)) return 'You do not hold that card';
  return timing(ctx, a, def) ?? def.check?.(ctx, a) ?? null;
}

/** Adds the Religion cards to playProgress. */
export function wrapCards(prev: ActionDef): ActionDef {
  return {
    ...prev,
    phases: [...(prev.phases ?? []), 'indulgence'],
    check(ctx, a) {
      if (isChurchCard(a.card)) return checkCard(ctx, a as Play);
      if (ctx.state.phase.id === 'indulgence') return 'Not while a roll waits for an Indulgence';
      return prev.check(ctx, a);
    },
    apply(ctx, a) {
      if (!isChurchCard(a.card)) return prev.apply(ctx, a);
      spendProgress(ctx, a.player, a.card);
      (CARDS[a.card] as CardDef).apply(ctx, a as Play);
    },
    enumerate(ctx, player) {
      const out =
        ctx.state.phase.id === 'indulgence'
          ? []
          : (prev.enumerate?.(ctx, player) ?? []).filter((a) => !isChurchCard(a.card));
      const seen = new Set<string>();
      for (const { card } of progressHeld(ctx, player)) {
        if (seen.has(card) || !isChurchCard(card)) continue;
        seen.add(card);
        for (const o of CARDS[card]!.options?.(ctx, player) ?? [{}]) {
          const a = { type: 'playProgress', player, card, ...o } as Play;
          if (!checkCard(ctx, a)) out.push(a);
        }
      }
      return out;
    },
  };
}

// ---- Steps after playing a card ----

const churchKeep: ActionDef = {
  phases: ['churchKeep'],
  check(ctx, a) {
    const ph = ctx.state.phase;
    if (a.player !== ph.by) return 'Not you';
    return Number.isInteger(a.index) && (ph.pool as unknown[])[a.index as number]
      ? null
      : 'Pick a card';
  },
  apply(ctx, a) {
    const pool = ctx.state.phase.pool as { card: string; deck: Track }[];
    pool.forEach((p, i) => {
      if (i === a.index) giveProgress(ctx, a.player, p.deck, p.card);
      else (ctx.state.decks[p.deck] ??= []).push(p.card);
    });
    back(ctx);
  },
  enumerate(ctx, player) {
    const ph = ctx.state.phase;
    if (player !== ph.by) return [];
    return (ph.pool as unknown[]).map((_, index) => ({ type: 'churchKeep', player, index }));
  },
};

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

export const cardActions: Record<string, ActionDef> = { churchKeep, churchTaxPay, churchPay };

export { MODULE_ID };
