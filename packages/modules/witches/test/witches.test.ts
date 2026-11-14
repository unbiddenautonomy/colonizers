import { describe, expect, it } from 'vitest';
import { Ctx, ModuleLibrary, type Action, type CornerId, type GameState } from '@colonizers/engine';
import { baseModule } from '@colonizers/module-base';
import { seafarersModule } from '@colonizers/module-seafarers';
import { canPlaceSettlement, stealCandidates } from '@colonizers/module-base';
import {
  activeTracks,
  barbarianTrack,
  citiesKnightsModule,
  citiesOf,
  ckData,
  eventFaces,
  giveProgress,
  holdsProgress,
  isActive,
  knightsOf,
  levels,
  type Track,
} from '@colonizers/module-cities-knights';
import { churchModule } from '@colonizers/module-church';
import { generateBoard } from '@colonizers/maps';
import { witchesModule, wizardOwner } from '../src/index.ts';

const lib = new ModuleLibrary([
  baseModule,
  seafarersModule,
  citiesKnightsModule,
  churchModule,
  witchesModule,
]);

function game(seed = 'witches', modules = ['base', 'cities-knights', 'witches']): GameState {
  const board = generateBoard({ seed, players: 4, mode: 'classic' });
  return lib.createGame({
    seed,
    players: ['A', 'B', 'C', 'D'],
    modules,
    map: board.map,
    fixedSeats: true,
  }).state;
}

const ctxOf = (s: GameState) => new Ctx(s, lib.registry(s.modules));
const act = (s: GameState, a: Action) => lib.apply(s, a).state;

function edit(state: GameState, fn: (ctx: Ctx) => void): GameState {
  const next = structuredClone(state);
  const ctx = ctxOf(next);
  fn(ctx);
  ctx.commit();
  return next;
}

function rng(seed: number): () => number {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

function finishSetup(state: GameState): GameState {
  let s = state;
  const rand = rng(3);
  while (s.phase.id === 'setup') {
    const seat = lib.waitingOn(s)[0]!;
    const options = lib.legalActions(s, seat);
    s = act(s, options[Math.floor(rand() * options.length)]!);
  }
  return s;
}

const main = (s: GameState, seat = 0) =>
  edit(s, (ctx) => {
    ctx.state.turn.player = seat;
    ctx.setPhase({ id: 'main' });
  });

const give = (s: GameState, seat: number, cards: Record<string, number>) =>
  edit(s, (ctx) => ctx.grant(seat, cards));

const legal = (s: GameState, seat: number, type: string) =>
  lib.legalActions(s, seat).filter((a) => a.type === type);

const cityOf = (s: GameState, seat: number): CornerId =>
  (citiesOf(ctxOf(s), seat)[0]!.at as { id: CornerId }).id;

const start = (modules?: string[]) => main(finishSetup(game('witches', modules)));

describe('Witches, Wizards & Dragons', () => {
  it('adds Magic and a ten-sided die; with Church, five tracks and twelve sides', () => {
    const alone = ctxOf(game());
    expect(activeTracks(alone)).toEqual(['science', 'trade', 'politics', 'magic']);
    expect(eventFaces(alone)).toHaveLength(10);
    const both = ctxOf(game('both', ['base', 'cities-knights', 'witches', 'church']));
    expect(activeTracks(both)).toEqual(['science', 'trade', 'politics', 'magic', 'religion']);
    const faces = eventFaces(both);
    expect(faces).toHaveLength(12);
    expect(faces.filter((f) => f === 'ship')).toHaveLength(6);
    expect(faces).toContain('joker');
    // Witch Burning joins the Religion deck.
    expect(both.state.decks.religion).toHaveLength(18);
    expect(both.state.decks.religion).toContain('witchBurning');
  });

  it('a Citadel opens Magic, is worth a point and turns a brick into Crystal', () => {
    let s = give(start(), 0, { ore: 1, brick: 2, crystal: 3 });
    expect(legal(s, 0, 'improveCity').some((a) => a.track === 'magic')).toBe(false);
    const vp = ctxOf(s).vp(0);
    const corner = cityOf(s, 0);
    s = act(s, { type: 'buildCitySeat', player: 0, seat: 'citadel', corner });
    expect(ctxOf(s).vp(0)).toBe(vp + 1);
    expect(legal(s, 0, 'buildCitySeat')).toHaveLength(0);
    expect(legal(s, 0, 'improveCity').some((a) => a.track === 'magic')).toBe(true);
    const ctx = ctxOf(s);
    const city = ctx.buildingAt(corner)!;
    const hills = Object.values(ctx.state.hexes).find((h) => h.type === 'hills')!;
    expect(ctx.reduce('hexYield', hills, city, { brick: 2 })).toEqual({ brick: 1, crystal: 1 });
  });

  it('a settlement goes straight to a Citadel for 3 ore, 2 grain and 2 brick', () => {
    let s = give(start(), 0, { ore: 3, grain: 2, brick: 2 });
    const town = ctxOf(s).piecesOf(0, 'settlement')[0];
    if (!town) return;
    const corner = (town.at as { id: CornerId }).id;
    const before = { ...ctxOf(s).player(0).hand };
    s = act(s, { type: 'buildCitySeat', player: 0, seat: 'citadel', corner });
    const ctx = ctxOf(s);
    expect(ctx.buildingAt(corner)!.type).toBe('city');
    const paid = (r: string) => (before[r] ?? 0) - (ctx.player(0).hand[r] ?? 0);
    expect([paid('ore'), paid('grain'), paid('brick')]).toEqual([3, 2, 2]);
  });

  it('a city is a Diocese or a Citadel, not both', () => {
    let s = give(start(['base', 'cities-knights', 'witches', 'church']), 0, {
      ore: 1,
      brick: 3,
      grain: 1,
      lumber: 1,
    });
    const corner = cityOf(s, 0);
    s = act(s, { type: 'buildCitySeat', player: 0, seat: 'diocese', corner });
    expect(() => act(s, { type: 'buildCitySeat', player: 0, seat: 'citadel', corner })).toThrow(
      /already a Diocese/,
    );
  });

  it('the Magic Kitchen swaps brick 1:1 for other resources on your turn', () => {
    let s = edit(give(start(), 0, { brick: 2 }), (ctx) => (levels(ctx, 0).magic = 3));
    s = act(s, { type: 'bankTrade', player: 0, give: 'brick', get: 'ore' });
    expect(ctxOf(s).player(0).hand.brick).toBe(1);
    expect(() => act(s, { type: 'bankTrade', player: 0, give: 'brick', get: 'crystal' })).toThrow();
  });

  it('level 4 in Science stops Magic at level 3', () => {
    let s = edit(start(), (ctx) => {
      levels(ctx, 0).science = 4;
      levels(ctx, 0).magic = 3;
    });
    const corner = cityOf(s, 0);
    s = give(s, 0, { ore: 1, brick: 2, crystal: 4 });
    s = act(s, { type: 'buildCitySeat', player: 0, seat: 'citadel', corner });
    expect(() => act(s, { type: 'improveCity', player: 0, track: 'magic' })).toThrow(
      /level 4 in science/,
    );
  });
});

const hold = (s: GameState, seat: number, card: string, deck: Track = 'magic') =>
  edit(s, (ctx) => giveProgress(ctx, seat, deck, card));

const play = (s: GameState, seat: number, card: string, extra: Partial<Action> = {}) =>
  act(s, { type: 'playProgress', player: seat, card, ...extra });

const knight = (s: GameState, seat: number, active = true) =>
  edit(s, (ctx) => {
    const corner = ctx.geometry.corners.find(
      (c) => ctx.piecesAt({ kind: 'corner', id: c }).length === 0,
    )!;
    ctx.place('knight1', seat, { kind: 'corner', id: corner }, { active });
  });

describe('the Magic cards', () => {
  it('Lightning turns a field into desert and leaves its number', () => {
    let s = play(hold(start(), 0, 'lightning'), 0, 'lightning');
    expect(s.phase.id).toBe('magicPick');
    const pick = legal(s, 0, 'magicPick')[0]!;
    const token = s.hexes[pick.hex as keyof typeof s.hexes]!.token;
    s = act(s, pick);
    const hex = s.hexes[pick.hex as keyof typeof s.hexes]!;
    expect(hex.type).toBe('desert');
    expect(hex.token).toBe(token);
    expect(s.phase.id).toBe('main');
  });

  it('Star Favor swaps any two numbers, 6 and 8 too', () => {
    let s = play(hold(start(), 0, 'starFavor'), 0, 'starFavor');
    const hexes = Object.values(s.hexes).filter((h) => h.token === 6 || h.token === 8);
    const [x, y] = [hexes[0]!, hexes.find((h) => h.token !== hexes[0]!.token) ?? hexes[1]!];
    const [tx, ty] = [x.token, y.token];
    s = act(s, { type: 'magicPick', player: 0, hex: x.id });
    s = act(s, { type: 'magicPick', player: 0, hex: y.id });
    expect([s.hexes[x.id]!.token, s.hexes[y.id]!.token]).toEqual([ty, tx]);
  });

  it('Enchanted Land swaps two fields with their numbers', () => {
    let s = play(hold(start(), 0, 'enchantedLand'), 0, 'enchantedLand');
    const land = Object.values(s.hexes).filter((h) => h.type !== 'desert' && h.token);
    const x = land[0]!;
    const y = land.find((h) => h.type !== x.type)!;
    const before = [x.type, x.token, y.type, y.token];
    s = act(s, { type: 'magicPick', player: 0, hex: x.id });
    s = act(s, { type: 'magicPick', player: 0, hex: y.id });
    const [a, b] = [s.hexes[x.id]!, s.hexes[y.id]!];
    expect([b.type, b.token, a.type, a.token]).toEqual(before);
  });

  it('the Wizard guards a building from the robber and is worth a point', () => {
    let s = hold(start(), 0, 'wizard');
    const vp = ctxOf(s).vp(0);
    const corner = cityOf(s, 0);
    s = play(s, 0, 'wizard');
    s = act(s, { type: 'magicPick', player: 0, corner });
    let ctx = ctxOf(s);
    expect(wizardOwner(ctx)).toBe(0);
    expect(ctx.vp(0)).toBe(vp + 1);
    // Robber beside the Wizard's city: it still produces, and no card is taken through it.
    const hex = ctx.geometry.cornerHexes.get(corner)!.find((h) => ctx.state.hexes[h]?.token)!;
    s = give(
      edit(s, (c) => c.move(c.piecesOfType('robber')[0]!, { kind: 'hex', id: hex })),
      0,
      { wool: 1 },
    );
    ctx = ctxOf(s);
    const city = ctx.buildingAt(corner)!;
    expect(ctx.reduce('hexBlocked', ctx.state.hexes[hex]!, city, true)).toBe(false);
    const others = ctx.geometry.cornerHexes.get(corner)!;
    const alone = !ctx
      .piecesOf(0)
      .some(
        (p) =>
          p.at.kind === 'corner' &&
          p.at.id !== corner &&
          ctx.registry.pieceTypes[p.type]?.building &&
          (ctx.geometry.cornerHexes.get(p.at.id) ?? []).includes(hex),
      );
    if (alone) expect(stealCandidates(ctx, hex, 1)).not.toContain(0);
    expect(others.length).toBeGreaterThan(0);
  });

  it('the Inquisitor drives the Wizard off', () => {
    const modules = ['base', 'cities-knights', 'witches', 'church'];
    let s = hold(start(modules), 0, 'wizard');
    const corner = cityOf(s, 0);
    s = act(play(s, 0, 'wizard'), { type: 'magicPick', player: 0, corner });
    s = hold(main(s, 1), 1, 'inquisitor', 'religion');
    s = play(s, 1, 'inquisitor', { option: corner });
    expect(wizardOwner(ctxOf(s))).toBeNull();
  });

  it("Witch's Spell puts a player's knights down for three turns", () => {
    let s = knight(hold(start(), 0, 'witchSpell'), 1);
    s = play(s, 0, 'witchSpell', { target: 1 });
    const k = knightsOf(ctxOf(s), 1)[0]!;
    expect(isActive(k)).toBe(false);
    s = give(main(s, 1), 1, { grain: 1 });
    expect(() => act(s, { type: 'activateKnight', player: 1, knight: k.id })).toThrow(/bewitched/);
    s = edit(s, (ctx) => (ctx.state.turn.number += 3));
    s = act(s, { type: 'activateKnight', player: 1, knight: k.id });
    expect(isActive(ctxOf(s).state.pieces[k.id]!)).toBe(true);
  });

  it('Magic Veto turns away a card aimed at you', () => {
    let s = knight(hold(hold(start(), 0, 'witchSpell'), 1, 'magicVeto'), 1);
    s = play(s, 0, 'witchSpell', { target: 1 });
    expect(s.phase.id).toBe('veto');
    expect(lib.waitingOn(s)).toEqual([1]);
    s = act(s, { type: 'answerVeto', player: 1, use: true });
    expect(s.phase.id).toBe('main');
    expect(isActive(knightsOf(ctxOf(s), 1)[0]!)).toBe(true);
    expect(holdsProgress(ctxOf(s), 1, 'magicVeto')).toBe(false);
  });

  it('letting the card through works it out', () => {
    let s = knight(hold(hold(start(), 0, 'witchSpell'), 1, 'magicVeto'), 1);
    s = play(s, 0, 'witchSpell', { target: 1 });
    s = act(s, { type: 'answerVeto', player: 1, use: false });
    expect(isActive(knightsOf(ctxOf(s), 1)[0]!)).toBe(false);
    expect(holdsProgress(ctxOf(s), 1, 'magicVeto')).toBe(true);
  });

  it("Magic Power is played when the ship lands, on anyone's turn", () => {
    let s = knight(hold(start(), 1, 'magicPower'), 1);
    s = edit(s, (ctx) => {
      const d = ckData(ctx);
      d.barbarian = barbarianTrack(ctx) - 1;
      d.forcedEvent = 'ship';
      ctx.setPhase({ id: 'roll' });
    });
    s = act(s, { type: 'roll', player: 0 });
    expect(s.phase.id).toBe('beforeAttack');
    expect(lib.waitingOn(s)).toEqual([1]);
    const r = lib.apply(s, { type: 'playProgress', player: 1, card: 'magicPower' });
    const attack = r.events.find((e) => e.type === 'barbarianAttack')!;
    expect((attack.strengths as number[])[1]).toBe(2);
    expect(r.state.phase.id).not.toBe('beforeAttack');
  });

  it('passing lets the attack come', () => {
    let s = hold(start(), 1, 'magicPower');
    s = edit(s, (ctx) => {
      ckData(ctx).barbarian = barbarianTrack(ctx) - 1;
      ckData(ctx).forcedEvent = 'ship';
      ctx.setPhase({ id: 'roll' });
    });
    s = act(s, { type: 'roll', player: 0 });
    const r = lib.apply(s, { type: 'passAttack', player: 1 });
    expect(r.events.some((e) => e.type === 'barbarianAttack')).toBe(true);
    expect(holdsProgress(ctxOf(r.state), 1, 'magicPower')).toBe(true);
  });

  it('Small Dragon keeps four more cards on a 7', () => {
    let s = give(hold(start(), 1, 'smallDragon'), 1, { wool: 5, ore: 5 });
    s = edit(s, (ctx) => {
      ckData(ctx).alchemist = { red: 3, yellow: 4 };
      ctx.setPhase({ id: 'roll' });
    });
    s = act(s, { type: 'roll', player: 0 });
    expect(s.phase.id).toBe('discard');
    expect((s.phase.owed as Record<number, number>)[1]).toBeGreaterThan(0);
    s = play(s, 1, 'smallDragon');
    expect((s.phase.owed as Record<number, number> | undefined)?.[1]).toBeUndefined();
  });

  it('the Great Dragon takes a rival improvement', () => {
    let s = edit(hold(start(), 0, 'greatDragon'), (ctx) => {
      levels(ctx, 0).politics = 1;
      levels(ctx, 1).politics = 2;
    });
    expect(
      legal(s, 0, 'playProgress').some((a) => a.card === 'greatDragon' && a.option === 'trade'),
    ).toBe(false);
    s = play(s, 0, 'greatDragon', { target: 1, option: 'politics' });
    const ctx = ctxOf(s);
    expect([levels(ctx, 0).politics, levels(ctx, 1).politics]).toEqual([2, 1]);
  });

  it('Magic Formula: everyone hands over a card, you keep one', () => {
    let s = hold(
      hold(hold(start(), 0, 'magicFormula'), 1, 'crane', 'science'),
      2,
      'smith',
      'politics',
    );
    s = play(s, 0, 'magicFormula');
    expect(s.phase.id).toBe('magicFormula');
    s = act(s, { type: 'formulaGive', player: 1, card: 'crane', deck: 'science' });
    s = act(s, { type: 'formulaGive', player: 2, card: 'smith', deck: 'politics' });
    expect(s.phase.id).toBe('keepOne');
    s = act(s, { type: 'keepOne', player: 0, index: 1 });
    const ctx = ctxOf(s);
    expect(holdsProgress(ctx, 0, 'smith')).toBe(true);
    expect(holdsProgress(ctx, 0, 'crane')).toBe(false);
    expect(holdsProgress(ctx, 1, 'crane')).toBe(false);
  });

  it('Magic Current can bring the ship in at once', () => {
    let s = hold(start(), 0, 'magicCurrent');
    s = edit(s, (ctx) => (ckData(ctx).barbarian = barbarianTrack(ctx) - 1));
    const r = lib.apply(s, {
      type: 'playProgress',
      player: 0,
      card: 'magicCurrent',
      option: 'forward',
    });
    expect(r.events.some((e) => e.type === 'barbarianAttack')).toBe(true);
    expect(ckData(ctxOf(r.state)).barbarian).toBe(0);
    expect(['main', 'loseCity']).toContain(r.state.phase.id);
  });

  it('Unicorn Dance sets the event die before the roll', () => {
    let s = edit(hold(start(), 0, 'unicornDance'), (ctx) => ctx.setPhase({ id: 'roll' }));
    s = play(s, 0, 'unicornDance', { option: 'politics' });
    const r = lib.apply(s, { type: 'roll', player: 0 });
    expect(r.events.find((e) => e.type === 'eventDie')?.face).toBe('politics');
  });

  it('Magic Move carries a settlement to a new spot on your roads', () => {
    // A road out to an open spot.
    let s = edit(hold(start(), 0, 'magicMove'), (ctx) => {
      const spot = ctx.geometry.corners.find(
        (c) => ctx.isLandCorner(c) && canPlaceSettlement(ctx, 0, c, false) === null,
      )!;
      const edge = ctx.geometry.cornerEdges.get(spot)!.find((e) => ctx.isLandEdge(e))!;
      ctx.place('road', 0, { kind: 'edge', id: edge });
    });
    s = play(s, 0, 'magicMove');
    const from = legal(s, 0, 'magicPick')[0]!.corner as CornerId;
    const type = ctxOf(s).buildingAt(from)!.type;
    s = act(s, { type: 'magicPick', player: 0, corner: from });
    const to = legal(s, 0, 'magicPick')[0]!.corner as CornerId;
    s = act(s, { type: 'magicPick', player: 0, corner: to });
    const ctx = ctxOf(s);
    expect(ctx.buildingAt(from)).toBeUndefined();
    expect(ctx.buildingAt(to)?.type).toBe(type);
  });

  it('White Magic is a point the moment it is drawn', () => {
    const s = start();
    const vp = ctxOf(s).vp(0);
    expect(ctxOf(hold(s, 0, 'whiteMagic')).vp(0)).toBe(vp + 1);
  });

  it('Nature Spell takes three resources', () => {
    let s = hold(start(), 0, 'natureSpell');
    const before = ctxOf(s).player(0).hand.ore ?? 0;
    s = play(s, 0, 'natureSpell', { cards: { ore: 3 } });
    expect(ctxOf(s).player(0).hand.ore).toBe(before + 3);
  });

  it('Magic Fortune knocks two cards off a settlement', () => {
    const s = play(hold(start(), 0, 'magicFortune'), 0, 'magicFortune', {
      cards: { brick: 1, lumber: 1 },
    });
    expect(ctxOf(s).cost('settlement', 0)).toEqual({ wool: 1, grain: 1 });
  });
});

describe('Witches, Wizards & Dragons, played at random', () => {
  for (const [seed, modules] of [
    ['hzd-a', ['base', 'cities-knights', 'witches']],
    ['hzd-b', ['base', 'cities-knights', 'witches', 'church']],
  ] as const)
    it(`never gets stuck (${seed})`, () => {
      let s = finishSetup(game(seed, [...modules]));
      const rand = rng(seed.length * 7 + seed.charCodeAt(4));
      const seen = new Set<string>();
      for (let i = 0; i < 3000 && s.winner === null; i++) {
        const seats = lib.waitingOn(s);
        expect(seats.length).toBeGreaterThan(0);
        const options = seats.flatMap((seat) => lib.legalActions(s, seat));
        expect(options.length).toBeGreaterThan(0);
        const pool = options.filter((a) => !a.type.endsWith('Trade') && a.type !== 'offerTrade');
        const from = pool.length ? pool : options;
        if (options.some((o) => o.type === 'buildCitySeat' && o.seat === 'citadel'))
          seen.add('could:citadel');
        const a = from[Math.floor(rand() * from.length)]!;
        seen.add(a.type === 'buildCitySeat' ? `seat:${a.seat as string}` : a.type);
        s = act(s, a);
      }
      expect(seen.has('could:citadel')).toBe(true);
    }, 120_000);
});
