import type { Action, ActionDef, Cards, Ctx, Phase } from '@colonizers/engine';
import type { Track } from './constants.ts';
import { indulgenceTiming, playIndulgence, REROLLS } from './indulgence.ts';
import { holdsProgress, resolvePlay, spendProgress } from './progress.ts';
import {
  attack,
  barbarianStrength,
  canPlaceKnight,
  ckData,
  continueRoll,
  defenseStrength,
  drawProgress,
  giveProgress,
  progressCount,
  progressHeld,
  takesProgress,
} from './rules.ts';

/**
 * Progress cards the fan expansions add (Church, Faith & Reformation's
 * Religion deck, Witches, Wizards & Dragons' Magic deck), played through one
 * engine so each module only lists its cards:
 *
 * - **When** a card can be played: after rolling on your turn (the default),
 *   before rolling, either, while a roll waits for an Indulgence, when a 7
 *   makes you discard, or when the barbarians land (on anyone's turn).
 * - **The barbarian window.** When the ship lands and someone holds a card
 *   for that moment (Refuge, Magic Power, Magic Veto), the attack waits in a
 *   `beforeAttack` step until each of them plays or passes.
 * - **Magic Veto.** A card that aims at one player (`aims`) waits in a `veto`
 *   step when that player holds the Veto, so they can turn it away.
 * - **Keep one.** Cards that pool other players' progress cards let the player
 *   keep one; the rest go back under their decks.
 */

export type CardTiming = 'main' | 'roll' | 'beforeOrAfter' | 'indulgence' | 'discard' | 'attack';

export type Play = Action & {
  card: string;
  target?: number;
  option?: string;
  cards?: Cards;
};

export interface FanCard {
  count: number;
  /** The deck it belongs to, for a module whose cards fill several decks. */
  deck?: Track;
  /** Only with this track in the game (Witch Burning needs Magic). */
  needs?: Track;
  /** When it can be played. Default: after rolling, on your turn. */
  when?: CardTiming | readonly CardTiming[];
  /** Aims something bad at `target` alone, so Magic Veto can turn it away. */
  aims?: boolean;
  /** The choices offered (merged into the action). One empty choice if left out. */
  options?(ctx: Ctx, seat: number): Partial<Play>[];
  check?(ctx: Ctx, a: Play): string | null;
  apply(ctx: Ctx, a: Play): void;
}

/** The card that answers an aimed card. */
export const VETO = 'magicVeto';

/** Steps the fan cards can be played in, besides the roll and the main phase. */
export const FAN_PHASES = ['indulgence', 'discard', 'beforeAttack'] as const;

const MAIN: Phase = { id: 'main' };

/** Each module's fan cards. Two modules may use one name (they never share a game). */
const BY_MODULE = new Map<string, Record<string, FanCard>>();

/** Lists a module's cards so the shared steps (the veto, the barbarian window) can find them. */
export function defineFanCards<T extends Record<string, FanCard>>(module: string, cards: T): T {
  BY_MODULE.set(module, cards);
  return cards;
}

/** A fan card of a module in this game. */
export function fanCard(ctx: Ctx, card: string): FanCard | undefined {
  for (const m of ctx.registry.modules) {
    const def = BY_MODULE.get(m.id)?.[card];
    if (def) return def;
  }
  return undefined;
}

/** A deck's card counts for the tracks in play. */
export function fanDeck(
  cards: Record<string, FanCard>,
  tracks: readonly string[],
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(cards)
      .filter(([, d]) => !d.needs || tracks.includes(d.needs))
      .map(([c, d]) => [c, d.count]),
  );
}

// ---- Helpers for card rows ----

export const others = (ctx: Ctx, seat: number): number[] =>
  ctx.state.players.map((p) => p.seat).filter((s) => s !== seat);

export const targets = (ctx: Ctx, seat: number): Partial<Play>[] =>
  others(ctx, seat).map((target) => ({ target }));

export const pickTarget = (ctx: Ctx, a: Play): string | null =>
  Number.isInteger(a.target) && a.target !== a.player && ctx.state.players[a.target as number]
    ? null
    : 'Pick another player';

export const heldIn = (ctx: Ctx, seat: number, deck: Track): string[] =>
  (ctx.player(seat).held[deck] ?? []).map((h) => h.card);

/** Takes a held card out of a player's hand (it goes nowhere yet). */
export function takeHeld(ctx: Ctx, seat: number, deck: Track, card: string): boolean {
  const held = ctx.player(seat).held[deck] ?? [];
  const i = held.findIndex((h) => h.card === card);
  if (i < 0) return false;
  held.splice(i, 1);
  return true;
}

/** Puts a held progress card back under its deck. */
export function returnHeld(ctx: Ctx, seat: number, deck: Track, card: string): void {
  if (takeHeld(ctx, seat, deck, card)) (ctx.state.decks[deck] ??= []).push(card);
}

export interface Pooled {
  card: string;
  deck: Track;
}

/** The player keeps one of these cards (one their seats allow); the rest go under their decks. */
export function keepOne(ctx: Ctx, seat: number, pool: Pooled[], returnTo: Phase = MAIN): void {
  const keepable = pool.filter((p) => takesProgress(ctx, seat, p.deck));
  if (keepable.length === 0) {
    for (const p of pool) (ctx.state.decks[p.deck] ??= []).push(p.card);
    return;
  }
  if (pool.length === 1) {
    giveProgress(ctx, seat, pool[0]!.deck, pool[0]!.card);
    return;
  }
  ctx.setPhase({ id: 'keepOne', by: seat, pool, returnTo });
}

/**
 * A card lets a player off a 7's discard (Small Dragon, Intimidation): once
 * nobody owes, the robber moves (unless it isn't in play yet).
 */
export function excuseDiscard(ctx: Ctx, seat: number): void {
  const ph = ctx.state.phase;
  const owed = { ...(ph.owed as Record<number, number>) };
  delete owed[seat];
  if (Object.keys(owed).length) ctx.setPhase({ ...ph, owed });
  else if (ph.skipRobber) ctx.setPhase({ id: (ph.returnTo as string | undefined) ?? 'main' });
  else ctx.setPhase({ id: 'moveRobber', returnTo: ph.returnTo });
}

// ---- Card rows the Religion decks share ----

/** Dogma, Witch Burning: a random card of a deck from each other player; keep one. */
export function takeFromEach(deck: Track, extra: Partial<FanCard> = {}): FanCard {
  return {
    count: 1,
    needs: deck,
    check(ctx, a) {
      if (!takesProgress(ctx, a.player, deck)) return `You can not take ${deck} cards`;
      return others(ctx, a.player).some((s) => heldIn(ctx, s, deck).length)
        ? null
        : `Nobody else has a ${deck} card`;
    },
    apply(ctx, a) {
      const pool: Pooled[] = [];
      for (const s of others(ctx, a.player)) {
        const held = heldIn(ctx, s, deck);
        if (!held.length) continue;
        const card = held[ctx.rng.int(0, held.length - 1)] as string;
        takeHeld(ctx, s, deck, card);
        pool.push({ card, deck });
        ctx.emit({ type: 'progressTaken', player: a.player, from: s, deck });
      }
      keepOne(ctx, a.player, pool);
    },
    ...extra,
  };
}

/** Reformation: swap all your other progress cards, or make everyone else swap theirs. */
export function reformationCard(extra: Partial<FanCard> = {}): FanCard {
  return {
    count: 1,
    options: () => [{ option: 'mine' }, { option: 'others' }],
    check(ctx, a) {
      // The Reformation itself is still in hand while this is checked.
      if (a.option === 'mine')
        return progressCount(ctx, a.player) > 1 ? null : 'You have no other progress cards';
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
    ...extra,
  };
}

/** Crusader: an active basic knight on a free corner along your roads. */
export function crusaderCard(count: number, extra: Partial<FanCard> = {}): FanCard {
  return {
    count,
    check(ctx, a) {
      if (ctx.supplyLeft(a.player, 'knight1') <= 0) return 'No basic knights left';
      return ctx.geometry.corners.some((c) => !canPlaceKnight(ctx, a.player, c))
        ? null
        : 'There is no spot for a knight';
    },
    apply(ctx) {
      ctx.setPhase({ id: 'placeDeserter', knightType: 'knight1', active: true, returnTo: MAIN });
    },
    ...extra,
  };
}

/** Indulgence: throw some of the dice again, right after any roll. */
export function indulgenceCard(count: number, extra: Partial<FanCard> = {}): FanCard {
  return {
    count,
    when: 'indulgence',
    options: () => REROLLS.map((option) => ({ option })),
    check: (_ctx, a) => (REROLLS.includes(a.option ?? '') ? null : 'Pick the dice to throw again'),
    apply(ctx, a) {
      playIndulgence(ctx, a.player, a.option as string);
    },
    ...extra,
  };
}

/** Refuge: your cities are safe from the next attack. On your turn, or when the ship lands. */
export function refugeCard(count: number, extra: Partial<FanCard> = {}): FanCard {
  return {
    count,
    when: ['beforeOrAfter', 'attack'],
    check(ctx, a) {
      if (ckData(ctx).refuge?.includes(a.player)) return 'Your cities are already safe';
      return attackHeld(ctx) ? 'The knights hold the barbarians off' : null;
    },
    apply(ctx, a) {
      (ckData(ctx).refuge ??= []).push(a.player);
      ctx.emit({ type: 'churchRefuge', player: a.player });
    },
    ...extra,
  };
}

// ---- Timing ----

const timings = (def: FanCard): readonly CardTiming[] =>
  def.when === undefined ? ['main'] : typeof def.when === 'string' ? [def.when] : def.when;

const owedIn = (ph: Phase, seat: number) =>
  !!(ph.owed as Record<number, number> | undefined)?.[seat];

const OUT_OF_TURN: Partial<Record<CardTiming, string>> = {
  indulgence: 'Play this right after a roll',
  discard: 'Play this when a 7 makes you discard',
  attack: 'Play this when the barbarians land',
};

function timingBlock(ctx: Ctx, seat: number, def: FanCard): string | null {
  const ph = ctx.state.phase;
  const when = timings(def);
  if (ph.id === 'indulgence')
    return when.includes('indulgence')
      ? indulgenceTiming(ctx, seat)
      : 'Not while a roll waits for an Indulgence';
  if (ph.id === 'discard')
    return when.includes('discard') && ph.seven === true && owedIn(ph, seat)
      ? null
      : 'Not while players discard';
  if (ph.id === 'beforeAttack')
    return when.includes('attack') && owedIn(ph, seat) ? null : 'Not while the barbarians land';
  const onTurn = when.filter((w) => w === 'main' || w === 'roll' || w === 'beforeOrAfter');
  if (!onTurn.length) return OUT_OF_TURN[when[0] ?? 'attack'] ?? 'Not now';
  if (seat !== ctx.active) return 'Not your turn';
  const early = when.includes('roll') || when.includes('beforeOrAfter');
  const late = when.includes('main') || when.includes('beforeOrAfter');
  if (ph.id === 'roll') return early ? null : 'Progress cards are played after rolling';
  if (ph.id === 'main') return late ? null : 'Play this before you roll';
  return 'Not now';
}

function checkCard(ctx: Ctx, a: Play, def: FanCard): string | null {
  if (!holdsProgress(ctx, a.player, a.card)) return 'You do not hold that card';
  return timingBlock(ctx, a.player, def) ?? def.check?.(ctx, a) ?? null;
}

/**
 * When an aimed card hits a player holding the Veto: wait for their answer.
 * Returns true when the card waits.
 */
export function askVeto(ctx: Ctx, a: Play): boolean {
  const t = a.target;
  if (typeof t !== 'number' || t === a.player || !holdsProgress(ctx, t, VETO)) return false;
  ctx.setPhase({ id: 'veto', owed: { [t]: 1 }, play: a, returnTo: ctx.state.phase });
  return true;
}

/**
 * Adds a module's cards to playProgress. Cards it doesn't own go to the
 * action below, in the phases that action knows.
 */
export function wrapFanCards(cards: Record<string, FanCard>): (prev: ActionDef) => ActionDef {
  const mine = (c: unknown): c is string => typeof c === 'string' && Object.hasOwn(cards, c);
  return (prev) => {
    const below = prev.phases;
    const belowHas = (ph: string) => !below || below.includes(ph);
    return {
      ...prev,
      ...(below ? { phases: [...new Set([...below, ...FAN_PHASES])] } : {}),
      check(ctx, a) {
        if (mine(a.card)) return checkCard(ctx, a as Play, cards[a.card]!);
        if (!belowHas(ctx.state.phase.id)) return 'Not now';
        return prev.check(ctx, a);
      },
      apply(ctx, a) {
        if (!mine(a.card)) return prev.apply(ctx, a);
        const def = cards[a.card]!;
        const landing = ctx.state.phase.id === 'beforeAttack';
        spendProgress(ctx, a.player, a.card);
        if (def.aims && askVeto(ctx, a as Play)) return;
        def.apply(ctx, a as Play);
        // Nothing more to play before the attack: that player is done.
        if (landing && ctx.state.phase.id === 'beforeAttack' && !attackWindow(ctx)[a.player])
          passAttack.apply(ctx, { type: 'passAttack', player: a.player });
      },
      enumerate(ctx, player) {
        const out = belowHas(ctx.state.phase.id)
          ? (prev.enumerate?.(ctx, player) ?? []).filter((a) => !mine(a.card))
          : [];
        const seen = new Set<string>();
        for (const { card } of progressHeld(ctx, player)) {
          if (seen.has(card) || !mine(card)) continue;
          seen.add(card);
          const def = cards[card]!;
          if (timingBlock(ctx, player, def)) continue;
          for (const o of def.options?.(ctx, player) ?? [{}]) {
            const a = { type: 'playProgress', player, card, ...o } as Play;
            if (!checkCard(ctx, a, def)) out.push(a);
          }
        }
        return out;
      },
    };
  };
}

// ---- Steps the cards share ----

const back = (ctx: Ctx) => ctx.setPhase(ctx.state.phase.returnTo as Phase);

/** Keep one of the pooled cards; the rest go back under their decks. */
const keepOneAction: ActionDef = {
  phases: ['keepOne'],
  check(ctx, a) {
    const ph = ctx.state.phase;
    if (a.player !== ph.by) return 'Not you';
    const p = Number.isInteger(a.index) ? (ph.pool as Pooled[])[a.index as number] : undefined;
    if (!p) return 'Pick a card';
    return takesProgress(ctx, a.player, p.deck) ? null : `You can not take ${p.deck} cards`;
  },
  apply(ctx, a) {
    const pool = ctx.state.phase.pool as Pooled[];
    pool.forEach((p, i) => {
      if (i === a.index) giveProgress(ctx, a.player, p.deck, p.card);
      else (ctx.state.decks[p.deck] ??= []).push(p.card);
    });
    back(ctx);
  },
  enumerate(ctx, player) {
    const ph = ctx.state.phase;
    if (player !== ph.by) return [];
    return (ph.pool as Pooled[]).map((_, index) => ({ type: 'keepOne', player, index }));
  },
};

/** Magic Veto: the target of an aimed card turns it away, or lets it happen. */
const answerVeto: ActionDef = {
  phases: ['veto'],
  check(ctx, a) {
    if (!owedIn(ctx.state.phase, a.player)) return 'Not you';
    if (a.use === true && !holdsProgress(ctx, a.player, VETO)) return 'You do not hold the Veto';
    return null;
  },
  apply(ctx, a) {
    const play = ctx.state.phase.play as Play;
    back(ctx);
    if (a.use === true) {
      spendProgress(ctx, a.player, VETO);
      ctx.emit({ type: 'vetoed', player: a.player, by: play.player, card: play.card });
      return;
    }
    const def = fanCard(ctx, play.card);
    if (def) def.apply(ctx, play);
    else resolvePlay(ctx, play);
  },
  enumerate(ctx, player) {
    if (!owedIn(ctx.state.phase, player)) return [];
    return [
      { type: 'answerVeto', player, use: true },
      { type: 'answerVeto', player, use: false },
    ];
  },
};

/** The ship is landing and the knights already hold it off: no city is at stake. */
export function attackHeld(ctx: Ctx): boolean {
  return ckData(ctx).attackPending === true && defenseStrength(ctx) >= barbarianStrength(ctx);
}

/** Seats holding a card they could play now that the barbarians land. */
export function attackWindow(ctx: Ctx): Record<number, number> {
  const out: Record<number, number> = {};
  for (const p of ctx.state.players) {
    const ready = progressHeld(ctx, p.seat).some(({ card }) => {
      const def = fanCard(ctx, card);
      if (!def || !timings(def).includes('attack')) return false;
      return !def.check?.(ctx, { type: 'playProgress', player: p.seat, card });
    });
    if (ready) out[p.seat] = 1;
  }
  return out;
}

/** Done with the barbarian window: the attack comes. */
const passAttack: ActionDef = {
  phases: ['beforeAttack'],
  check: (ctx, a) => (owedIn(ctx.state.phase, a.player) ? null : 'Not you'),
  apply(ctx, a) {
    const owed = { ...(ctx.state.phase.owed as Record<number, number>) };
    delete owed[a.player];
    if (Object.keys(owed).length) {
      ctx.setPhase({ ...ctx.state.phase, owed });
      return;
    }
    ckData(ctx).attackPending = false;
    attack(ctx);
    continueRoll(ctx);
  },
  enumerate: (ctx, player) =>
    owedIn(ctx.state.phase, player) ? [{ type: 'passAttack', player }] : [],
};

export const fanActions: Record<string, ActionDef> = {
  keepOne: keepOneAction,
  answerVeto,
  passAttack,
};
