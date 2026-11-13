import type { ActionDef, Cards, Ctx, GameEvent, HexId } from '@colonizers/engine';
import { drawProgress, progressOverLimit, type Track } from '@colonizers/module-cities-knights';
import {
  action,
  builtWonders,
  hasStage,
  isResource,
  MODULE_ID,
  onlyActive,
  produceHex,
  wonderData,
  type WonderData,
} from './core.ts';
import { numberDice } from './dice.ts';

/**
 * Wonder abilities worked out from what just happened in the game:
 *
 * - **Pyramids II** (Nile Delta): on a 7, each desert beside your buildings
 *   gives you a resource of your choice.
 * - **Chichen Itza I** (Mayan Geometry): on a 1 and 2, or a 1 and 3, take a
 *   resource of your choice.
 * - **Cristo Redentor III** (the beaches): on a 7, the land hexes of your bay
 *   produce for you.
 * - **Mausoleum I** (Stronghold of the Persian Empire): on a 7 you discard
 *   half of what you would (at least 1).
 * - **Mausoleum III** (Siege of Halicarnassus): roll a 6 or 8 and you may move
 *   the robber (or the pirate) that turn.
 * - **Hanging Gardens III** (Mesopotamian Lion): moving the robber or pirate
 *   draws you a development card (a progress card with Cities & Knights).
 * - **Temple of Artemis I** (The Amazons of Ephesus): roll a 7 and you may take
 *   the merchant and the Greed, Wealth & Power neutral pieces off the board.
 *
 * Resources of your choice wait as picks: take them whenever you like.
 */

/** Pieces that wander the board and that the Amazons sweep off. */
export const ROAMING = ['merchant', 'duke', 'scholar', 'wizard', 'inquisitor', 'envoy'];

const ck = (ctx: Ctx) => ctx.state.modules.includes('cities-knights');

export function picksOf(ctx: Ctx, seat: number): number {
  return (ctx.state.data[MODULE_ID] as WonderData | undefined)?.picks?.[seat] ?? 0;
}

function addPicks(ctx: Ctx, seat: number, n: number, wonder: string): void {
  if (n <= 0) return;
  const d = wonderData(ctx);
  d.picks[seat] = (d.picks[seat] ?? 0) + n;
  ctx.emit({ type: 'wonderPicks', player: seat, wonder, count: n });
}

/** Desert hexes beside a player's settlements and cities. */
export function desertsBy(ctx: Ctx, seat: number): HexId[] {
  const out = new Set<HexId>();
  for (const p of ctx.piecesOf(seat)) {
    if (p.at.kind !== 'corner' || (p.type !== 'settlement' && p.type !== 'city')) continue;
    for (const h of ctx.geometry.cornerHexes.get(p.at.id) ?? [])
      if (ctx.state.hexes[h]?.type === 'desert') out.add(h);
  }
  return [...out];
}

/**
 * The bay of a Cristo Redentor: the sea hex beside its hex with the most of
 * the owner's buildings on its coast, and up to two land hexes around it
 * (the wonder's own hex first) that touch the owner's buildings.
 */
export function bayHexes(ctx: Ctx, seat: number, wonderHex: HexId): HexId[] {
  const mine = (h: HexId) =>
    (ctx.geometry.hexCorners.get(h) ?? []).filter((c) => ctx.buildingAt(c)?.owner === seat).length;
  const isSea = (h: HexId) => {
    const x = ctx.state.hexes[h];
    return !!x && ctx.registry.hexTypes[x.type]?.terrain === 'sea';
  };
  const seas = (ctx.geometry.hexNeighbours.get(wonderHex) ?? []).filter(isSea);
  const sea = seas.sort((x, y) => mine(y) - mine(x))[0];
  const land = sea
    ? (ctx.geometry.hexNeighbours.get(sea) ?? []).filter(
        (h) => h !== wonderHex && !isSea(h) && mine(h) > 0,
      )
    : [];
  land.sort((x, y) => mine(y) - mine(x));
  return [wonderHex, ...land].slice(0, 2);
}

function rollEvents(ctx: Ctx): { player: number; dice: Record<string, unknown>; total: number }[] {
  return ctx.events
    .filter((e: GameEvent) => e.type === 'rolled')
    .map((e) => ({
      player: e.player as number,
      dice: (e.dice ?? {}) as Record<string, unknown>,
      total: e.total as number,
    }));
}

/** Draws the Mesopotamian Lion's card. */
function lionDraw(ctx: Ctx, seat: number): void {
  if (!ck(ctx)) {
    const card = ctx.drawCard('dev');
    if (!card) return;
    (ctx.player(seat).held.dev ??= []).push({ card, acquiredTurn: ctx.state.turn.number });
    ctx.emit({
      type: 'wonderDraw',
      player: seat,
      card,
      visibleTo: [seat],
      redacted: { player: seat },
    });
    return;
  }
  // The deck of the player's best city improvement that still has cards.
  const levels = ((ctx.state.data['cities-knights'] as { levels?: Record<number, Cards> })
    ?.levels?.[seat] ?? {}) as Cards;
  const decks = Object.keys(ctx.state.decks)
    .filter((t) => (ctx.state.decks[t]?.length ?? 0) > 0 && t !== 'dev')
    .sort((x, y) => (levels[y] ?? 0) - (levels[x] ?? 0));
  const deck = decks[0];
  if (!deck || !drawProgress(ctx, seat, deck as Track)) return;
  ctx.emit({ type: 'wonderDraw', player: seat, deck });
  if (ctx.state.phase.id === 'progressDiscard') return;
  const owed = progressOverLimit(ctx);
  if (Object.keys(owed).length)
    ctx.setPhase({ id: 'progressDiscard', owed, returnTo: ctx.state.phase });
}

/** Everything a roll or robber move sets off. Runs after each action. */
export function afterEffects(ctx: Ctx): void {
  if (ctx.state.winner !== null) return;
  const built = builtWonders(ctx);
  const owner = (id: keyof typeof built, stage: number): number | null => {
    const w = built[id];
    return w && w.stages >= stage ? w.owner : null;
  };
  for (const r of rollEvents(ctx)) {
    const pair = numberDice(r.dice);
    // Chichen Itza I: 1 and 2, or 1 and 3.
    const chichen = owner('chichenItza', 1);
    if (chichen !== null && pair) {
      const [x, y] = [Math.min(...pair), Math.max(...pair)];
      if (x === 1 && (y === 2 || y === 3)) addPicks(ctx, chichen, 1, 'chichenItza');
    }
    if (r.total === 7) {
      const pyramids = owner('pyramids', 2);
      if (pyramids !== null) addPicks(ctx, pyramids, desertsBy(ctx, pyramids).length, 'pyramids');
      const cristo = owner('cristo', 3);
      if (cristo !== null) {
        const got: Cards = {};
        for (const h of bayHexes(ctx, cristo, built.cristo!.hex))
          for (const [c, n] of Object.entries(produceHex(ctx, h, cristo)[cristo] ?? {}))
            got[c] = (got[c] ?? 0) + n;
        if (Object.keys(got).length) ctx.emit({ type: 'wonderBay', player: cristo, got });
      }
      if (owner('artemis', 1) === r.player) wonderData(ctx).amazons = ctx.state.turn.number;
    }
    if ((r.total === 6 || r.total === 8) && owner('mausoleum', 3) === r.player) {
      const robberAwake =
        !ck(ctx) ||
        (ctx.state.data['cities-knights'] as { robberActive?: boolean }).robberActive === true;
      if (robberAwake) wonderData(ctx).siege = ctx.state.turn.number;
    }
  }
  // Mausoleum I: halve what its owner must discard on a 7.
  const mausoleum = owner('mausoleum', 1);
  const ph = ctx.state.phase;
  if (
    mausoleum !== null &&
    ph.id === 'discard' &&
    ph.skipRobber !== true &&
    ctx.events.some((e) => e.type === 'phase' && e.to === 'discard')
  ) {
    const owed = ph.owed as Record<number, number>;
    const n = owed[mausoleum];
    if (n) {
      owed[mausoleum] = Math.max(1, Math.floor(n / 2));
      ctx.emit({ type: 'wonderDiscard', player: mausoleum, from: n, to: owed[mausoleum] });
    }
  }
  // Hanging Gardens III: a card for moving the robber or pirate.
  const lion = owner('hangingGardens', 3);
  if (lion !== null)
    for (const e of ctx.events)
      if ((e.type === 'robberMoved' || e.type === 'pirateMoved') && e.player === lion)
        lionDraw(ctx, lion);
}

// ---- Actions ----

/** Takes one resource of your choice that a wonder owes you. */
const wonderPick = action<{ card: string }>({
  check(ctx, a) {
    if (ctx.state.phase.id === 'gameOver') return 'The game is over';
    if (picksOf(ctx, a.player) < 1) return 'No resource to pick';
    if (!isResource(a.card)) return 'Pick a resource';
    if (!ctx.bankHas({ [a.card]: 1 })) return 'The bank has none left';
    return null;
  },
  apply(ctx, a) {
    wonderData(ctx).picks[a.player] = picksOf(ctx, a.player) - 1;
    ctx.grant(a.player, { [a.card]: 1 });
    ctx.emit({ type: 'wonderPick', player: a.player, card: a.card });
  },
  enumerate(ctx, player) {
    if (picksOf(ctx, player) < 1) return [];
    return ['brick', 'lumber', 'wool', 'grain', 'ore'].map((card) => ({
      type: 'wonderPick',
      player,
      card,
    }));
  },
});

/** Mausoleum III: after a 6 or 8, move the robber. */
const wonderSiege = action<object>({
  phases: ['main'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    const d = ctx.state.data[MODULE_ID] as WonderData | undefined;
    return d?.siege === ctx.state.turn.number && hasStage(ctx, a.player, 'mausoleum', 3)
      ? null
      : 'Only after you roll a 6 or 8';
  },
  apply(ctx, a) {
    delete wonderData(ctx).siege;
    ctx.emit({ type: 'wonderSiege', player: a.player });
    ctx.setPhase({ id: 'moveRobber', returnTo: 'main' });
  },
  enumerate: (ctx, player) => [{ type: 'wonderSiege', player }],
});

export function roamingPieces(ctx: Ctx) {
  return Object.values(ctx.state.pieces).filter(
    (p) => ROAMING.includes(p.type) && p.at.kind === 'hex',
  );
}

/** Temple of Artemis I: after rolling a 7, sweep the roaming pieces off. */
const wonderSweep = action<object>({
  phases: ['main'],
  check(ctx, a) {
    const err = onlyActive(ctx, a);
    if (err) return err;
    const d = ctx.state.data[MODULE_ID] as WonderData | undefined;
    if (d?.amazons !== ctx.state.turn.number || !hasStage(ctx, a.player, 'artemis', 1))
      return 'Only after you roll a 7';
    return roamingPieces(ctx).length ? null : 'Nothing is roaming the board';
  },
  apply(ctx, a) {
    delete wonderData(ctx).amazons;
    const gone = roamingPieces(ctx);
    for (const p of gone) ctx.remove(p);
    ctx.emit({ type: 'wonderSweep', player: a.player, pieces: gone.map((p) => p.type) });
  },
  enumerate: (ctx, player) => [{ type: 'wonderSweep', player }],
});

export const effectActions: Record<string, ActionDef> = { wonderPick, wonderSiege, wonderSweep };
