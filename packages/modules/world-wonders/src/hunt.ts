import type { ActionDef, Ctx } from '@colonizers/engine';
import { giveProgress, type Track } from '@colonizers/module-cities-knights';
import { action, builtWonders, hasStage, MODULE_ID, wonderData, type WonderData } from './core.ts';

/**
 * Temple of Artemis III (Artemis, Goddess of the Hunt): once a round, when
 * the owner draws a development or progress card, they see the next card of
 * that deck too and keep one of the two. The other goes under the deck.
 *
 * The draw happens as usual; the next card is set aside until the owner
 * chooses, at the latest when the next turn ends.
 */

type Hunt = NonNullable<WonderData['hunt']>;

const DRAWS: Record<string, (e: Record<string, unknown>) => string | null> = {
  boughtDevCard: () => 'dev',
  progressDrawn: (e) => (typeof e.deck === 'string' ? e.deck : null),
  wonderDraw: (e) => (typeof e.card === 'string' ? 'dev' : null),
};

export function huntOf(ctx: Ctx, seat: number): Hunt | null {
  const h = (ctx.state.data[MODULE_ID] as WonderData | undefined)?.hunt;
  return h && h.seat === seat ? h : null;
}

/** Sets the next card aside when the owner draws, once a round. */
export function startHunt(ctx: Ctx): void {
  const w = builtWonders(ctx).artemis;
  if (!w || !hasStage(ctx, w.owner, 'artemis', 3)) return;
  const d = ctx.state.data[MODULE_ID] as WonderData | undefined;
  if (d?.hunt || d?.huntRound?.[w.owner] === ctx.state.turn.round) return;
  for (const e of ctx.events) {
    const deckOf = DRAWS[e.type];
    if (!deckOf || e.player !== w.owner || typeof e.card !== 'string') continue;
    const deck = deckOf(e);
    if (!deck) continue;
    const alt = ctx.state.decks[deck]?.shift();
    if (!alt) continue;
    const data = wonderData(ctx);
    data.hunt = { seat: w.owner, deck, card: e.card, alt, turn: ctx.state.turn.number };
    (data.huntRound ??= {})[w.owner] = ctx.state.turn.round;
    ctx.emit({ type: 'wonderHuntStarted', player: w.owner, deck });
    return;
  }
}

/** Index of the drawn card in the owner's hand, if it is still there. */
function heldIndex(ctx: Ctx, h: Hunt): number {
  const list = ctx.player(h.seat).held[h.deck] ?? [];
  for (let i = list.length - 1; i >= 0; i--) if (list[i]!.card === h.card) return i;
  return -1;
}

function settle(ctx: Ctx, swap: boolean): void {
  const d = wonderData(ctx);
  const h = d.hunt as Hunt;
  d.hunt = null;
  const deck = (ctx.state.decks[h.deck] ??= []);
  if (!swap) {
    deck.push(h.alt);
  } else {
    const held = ctx.player(h.seat).held[h.deck]!;
    held.splice(heldIndex(ctx, h), 1);
    deck.push(h.card);
    if (h.deck === 'dev') held.push({ card: h.alt, acquiredTurn: ctx.state.turn.number });
    else giveProgress(ctx, h.seat, h.deck as Track, h.alt);
  }
  ctx.emit({ type: 'wonderHunt', player: h.seat, deck: h.deck, swapped: swap });
}

/** A hunt left open when the next turn ends keeps the card drawn. */
export function endHunt(ctx: Ctx): void {
  const h = (ctx.state.data[MODULE_ID] as WonderData | undefined)?.hunt;
  if (h && h.turn < ctx.state.turn.number) settle(ctx, false);
}

const wonderHunt = action<{ swap: boolean }>({
  check(ctx, a) {
    if (ctx.state.phase.id === 'gameOver') return 'The game is over';
    const h = huntOf(ctx, a.player);
    if (!h) return 'Nothing to choose';
    if (typeof a.swap !== 'boolean') return 'Keep one card';
    if (a.swap && heldIndex(ctx, h) < 0) return 'You no longer hold the card you drew';
    return null;
  },
  apply(ctx, a) {
    settle(ctx, a.swap);
  },
  enumerate(ctx, player) {
    const h = huntOf(ctx, player);
    if (!h) return [];
    return [
      { type: 'wonderHunt', player, swap: false },
      { type: 'wonderHunt', player, swap: true },
    ];
  },
});

export const huntActions: Record<string, ActionDef> = { wonderHunt };

/** Only the hunter sees the two cards. */
export function redactHunt(data: Record<string, unknown>, viewer: number | null) {
  const h = (data as WonderData).hunt;
  if (h && h.seat !== viewer) data.hunt = { ...h, card: '', alt: '' };
  return data;
}
