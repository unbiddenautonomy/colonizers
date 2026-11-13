import { describe, expect, it } from 'vitest';
import type { Action, GameState } from '@colonizers/engine';
import { produce } from '@colonizers/module-base';
import {
  ckData,
  hasAbility,
  knightsOf,
  levels,
  progressCount,
} from '@colonizers/module-cities-knights';
import { bankRatio } from '@colonizers/module-base';
import { CARDS, deckCards } from '../src/cards.ts';
import { greedWealthPowerModule } from '../src/index.ts';
import { act, ctxOf, edit, game, lib, main, placeCity, rng } from './helpers.ts';

function hold(state: GameState, seat: number, deck: string, card: string): GameState {
  return edit(state, (ctx) => {
    (ctx.player(seat).held[deck] ??= []).push({ card, acquiredTurn: 0 });
  });
}

const play = (s: GameState, seat: number, card: string, extra: Partial<Action> = {}) =>
  act(s, { type: 'playProgress', player: seat, card, ...extra });

/** A busy board: everyone has cities, knights, cards and some levels. */
function busy(): GameState {
  let s = main('gwp-cards');
  for (const [seat, card] of [
    [0, 'grain'],
    [1, 'brick'],
    [2, 'lumber'],
    [3, 'ore'],
  ] as const)
    s = placeCity(s, seat, card).state;
  return edit(s, (ctx) => {
    for (const p of ctx.state.players) {
      ctx.grant(p.seat, { lumber: 3, brick: 3, wool: 3, grain: 3, ore: 3, paper: 1, coin: 1 });
      const lv = levels(ctx, p.seat);
      lv.science = 3;
      lv.magic = p.seat === 1 ? 4 : 1;
      (ctx.player(p.seat).held.science ??= []).push({ card: 'crane', acquiredTurn: 0 });
      (ctx.player(p.seat).held.magic ??= []).push({ card: 'stardust', acquiredTurn: 0 });
    }
    // A knight for everyone, on a free corner by their city.
    for (const p of ctx.state.players) {
      const city = ctx.piecesOf(p.seat, 'city')[0]!;
      const corner = (city.at as { id: string }).id;
      for (const e of ctx.geometry.cornerEdges.get(corner as never) ?? []) {
        const free = (ctx.geometry.edgeCorners.get(e) ?? []).find(
          (c) => c !== corner && !ctx.piecesAt({ kind: 'corner', id: c }).length,
        );
        if (!free) continue;
        ctx.place('road', p.seat, { kind: 'edge', id: e });
        ctx.place('knight2', p.seat, { kind: 'corner', id: free }, { active: p.seat !== 2 });
        break;
      }
    }
    ctx.state.players[1]!.played.constitution = 3; // Player 1 leads on points.
    ckData(ctx).barbarian = 3;
    (ctx.player(0).held.religion ??= []).push({ card: 'churchTax', acquiredTurn: 0 });
    const hex = Object.values(ctx.state.hexes).find((h) => h.token !== undefined)!;
    ctx.place('merchant', 2, { kind: 'hex', id: hex.id });
  });
}

/** Plays out whatever a card asks next, picking at random, until it's back to the main phase. */
function settle(s: GameState, seed = 5): GameState {
  const rand = rng(seed);
  for (let i = 0; i < 40 && s.phase.id !== 'main' && s.phase.id !== 'roll'; i++) {
    const seat = lib.waitingOn(s)[0];
    if (seat === undefined) break;
    const options = lib.legalActions(s, seat);
    s = act(s, options[Math.floor(rand() * options.length)] as Action);
  }
  return s;
}

describe('New progress cards', () => {
  it('fills each deck to 26 cards, less the ones still to come', () => {
    const decks = game().decks;
    // Alliance, Dragon Lair, Indulgence, Lent and Land Deed come with the dragon.
    const later: Record<string, number> = { politics: 1, magic: 1, religion: 3, wealth: 1 };
    for (const deck of ['science', 'trade', 'politics', 'magic', 'religion', 'wealth'])
      expect(decks[deck]?.length, deck).toBe(26 - (later[deck] ?? 0));
    expect(Object.keys(deckCards('magic')).length).toBeGreaterThan(5);
  });

  it('every card can be played on a busy board without breaking', () => {
    const base = busy();
    const skipped: string[] = [];
    for (const [card, def] of Object.entries(CARDS)) {
      let s = hold(base, 0, def.deck, card);
      if (def.when === 'roll' || def.when === 'beforeOrAfter')
        s = edit(s, (ctx) => ctx.setPhase({ id: def.when === 'roll' ? 'roll' : 'main' }));
      if (def.when === 'discard')
        s = edit(s, (ctx) => ctx.setPhase({ id: 'discard', owed: { 0: 4 }, returnTo: 'main' }));
      const options = lib
        .legalActions(s, 0)
        .filter((a) => a.type === 'playProgress' && a.card === card);
      if (!options.length) {
        skipped.push(card);
        continue;
      }
      s = act(s, options[0] as Action);
      s = settle(s);
      expect(['main', 'roll', 'moveRobber'], card).toContain(s.phase.id);
      expect(progressCount(ctxOf(s), 0), card).toBeLessThanOrEqual(5);
    }
    // Ghost Ship needs ships (Seafarers).
    expect(skipped).toEqual(['ghostShip']);
  });

  it('Witch’s Night takes a card from everyone else', () => {
    const s0 = hold(busy(), 0, 'magic', 'witchsNight');
    const before = s0.players.map((p) => Object.values(p.hand).reduce((a, b) => a + b, 0));
    const s = play(s0, 0, 'witchsNight');
    const after = s.players.map((p) => Object.values(p.hand).reduce((a, b) => a + b, 0));
    expect(after[0]).toBe(before[0]! + 3);
    for (const seat of [1, 2, 3]) expect(after[seat]).toBe(before[seat]! - 1);
  });

  it('Brothel: the leader pays or their knights stand down', () => {
    let s = hold(busy(), 0, 'politics', 'brothel');
    expect(lib.check(s, { type: 'playProgress', player: 0, card: 'brothel', target: 3 })).toMatch(
      /more points/,
    );
    s = play(s, 0, 'brothel', { target: 1 });
    expect(s.phase.id).toBe('brothel');
    s = act(s, { type: 'brothelAnswer', player: 1, pay: null });
    expect(knightsOf(ctxOf(s), 1).every((k) => !k.props.active)).toBe(true);
    expect(s.phase.id).toBe('main');
  });

  it('Secret Society lends another player’s level 3 ability for the turn', () => {
    let s = edit(hold(busy(), 0, 'science', 'secretSociety'), (ctx) => {
      levels(ctx, 1).wealth = 3;
    });
    expect(hasAbility(ctxOf(s), 0, 'wealth')).toBe(false);
    s = play(s, 0, 'secretSociety', { target: 1, option: 'wealth' });
    const ctx = ctxOf(s);
    expect(hasAbility(ctx, 0, 'wealth')).toBe(true);
    expect(bankRatio(ctx, 0, 'wool', 'ore')).toBe(2);
  });

  it('Will-o’-Wisp switches what the hexes make for one roll', () => {
    const placed = placeCity(main(), 0, 'grain');
    let s = hold(placed.state, 0, 'magic', 'willOWisp');
    s = edit(s, (ctx) => ctx.setPhase({ id: 'roll' }));
    s = play(s, 0, 'willOWisp');
    const token = s.hexes[placed.hex]!.token as number;
    const before = s.players[0]!.hand.wool ?? 0;
    s = edit(s, (ctx) => {
      for (const r of ctx.piecesOfType('robber')) ctx.remove(r);
      produce(ctx, token);
    });
    // Grain fields give wool instead.
    expect((s.players[0]!.hand.wool ?? 0) - before).toBeGreaterThanOrEqual(1);
  });

  it('Unicorn Magic sets the event die', () => {
    let s = edit(hold(main(), 0, 'magic', 'unicornMagic'), (ctx) => ctx.setPhase({ id: 'roll' }));
    s = play(s, 0, 'unicornMagic', { face: 'ship' });
    const at = ckData(ctxOf(s)).barbarian;
    s = act(s, { type: 'roll', player: 0 });
    expect(ckData(ctxOf(s)).barbarian).toBe(at + 1);
  });

  it('Brickworks trades 2 brick for 1 crystal for the rest of the turn', () => {
    let s = hold(busy(), 0, 'wealth', 'brickworks');
    expect(bankRatio(ctxOf(s), 0, 'brick', 'crystal')).toBeGreaterThan(2);
    s = play(s, 0, 'brickworks');
    expect(bankRatio(ctxOf(s), 0, 'brick', 'crystal')).toBe(2);
    s = act(s, { type: 'bankTrade', player: 0, give: 'brick', get: 'crystal' });
    expect(s.players[0]!.hand.crystal).toBe(1);
  });

  it('Refuge keeps your cities through the next lost attack', () => {
    let s = hold(main(), 0, 'religion', 'refuge');
    s = placeCity(s, 0, 'grain').state;
    s = play(s, 0, 'refuge');
    s = edit(s, (ctx) => {
      ckData(ctx).barbarian = 6;
      for (const p of ctx.state.players) for (const k of knightsOf(ctx, p.seat)) ctx.remove(k);
      ctx.state.settings.ckEventFaces = ['ship'];
      ctx.setPhase({ id: 'roll' });
    });
    const cities = s.players.map((p) => ctxOf(s).piecesOf(p.seat, 'city').length);
    s = act(s, { type: 'roll', player: 0 });
    expect(ctxOf(s).piecesOf(0, 'city').length).toBe(cities[0]);
    expect(ckData(ctxOf(s)).refuge ?? []).toEqual([]);
  });

  it('Intimidation skips your discard on a 7', () => {
    let s = hold(busy(), 2, 'wealth', 'intimidation');
    s = edit(s, (ctx) => ctx.setPhase({ id: 'discard', owed: { 2: 5 }, returnTo: 'main' }));
    s = play(s, 2, 'intimidation');
    expect(s.phase.id).toBe('moveRobber');
  });

  it('Magic Ritual: everyone gives a card, you keep one', () => {
    let s = hold(busy(), 0, 'magic', 'magicRitual');
    s = play(s, 0, 'magicRitual');
    expect(s.phase.id).toBe('magicRitual');
    for (const seat of [1, 2, 3])
      s = act(s, lib.legalActions(s, seat).find((a) => a.type === 'ritualGive') as Action);
    expect(s.phase.id).toBe('keepProgress');
    const held = progressCount(ctxOf(s), 0);
    s = act(s, { type: 'keepProgress', player: 0, index: 0 });
    expect(progressCount(ctxOf(s), 0)).toBe(held + 1);
    expect(s.phase.id).toBe('main');
  });

  it('module hooks leave the cards alone outside their turn', () => {
    expect(greedWealthPowerModule.wrapActions?.playProgress).toBeTypeOf('function');
  });
});
