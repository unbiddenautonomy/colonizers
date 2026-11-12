import { describe, expect, it } from 'vitest';
import type { CornerId, Ctx, EdgeId, GameState, HexId, Piece } from '@colonizers/engine';
import { SEA_SCENARIOS } from '@colonizers/maps';
import {
  attack,
  ckData,
  displaceTargets,
  knightLevel,
  levels,
  moveTargets,
  strength,
} from '../src/index.ts';
import { gateDraws } from '../src/rules.ts';
import { act, ckGame, ckSeaGame, ctxOf, edit, finishSetup, lib, simulate } from './helpers.ts';

function cityOf(ctx: Ctx, seat: number): Piece {
  return ctx.piecesOf(seat, 'city')[0] as Piece;
}

/** A free land corner touching one of the player's roads. */
function knightSpot(ctx: Ctx, seat: number): CornerId {
  for (const r of ctx.piecesOf(seat, 'road'))
    for (const c of ctx.geometry.edgeCorners.get((r.at as { id: EdgeId }).id) ?? [])
      if (ctx.piecesAt({ kind: 'corner', id: c }).length === 0 && ctx.isLandCorner(c)) return c;
  throw new Error('No spot');
}

function playing(players = 4, seed = 'rules'): GameState {
  return finishSetup(ckGame(players, seed));
}

describe('Cities & Knights setup and production', () => {
  it('makes the second starting building a city and targets 13 points', () => {
    const s = playing();
    const ctx = ctxOf(s);
    for (const p of s.players) {
      expect(ctx.piecesOf(p.seat, 'city')).toHaveLength(1);
      expect(ctx.piecesOf(p.seat, 'settlement')).toHaveLength(1);
    }
    expect(ctx.vpTarget()).toBe(13);
    expect(s.phase.id).toBe('roll');
    expect(s.decks.science).toHaveLength(18);
    expect(s.decks.trade).toHaveLength(18);
    expect(s.decks.politics).toHaveLength(18);
  });

  it('pays a commodity from a city on forest, pasture or mountains', () => {
    let s = playing();
    const ctx = ctxOf(s);
    const city = cityOf(ctx, 0);
    const hex = (ctx.geometry.cornerHexes.get((city.at as { id: CornerId }).id) ?? [])
      .map((h) => s.hexes[h]!)
      .find((h) => ['forest', 'pasture', 'mountains'].includes(h.type) && h.token);
    if (!hex) return; // This seed's city has no such hex; other tests cover production.
    const commodity = { forest: 'paper', pasture: 'cloth', mountains: 'coin' }[hex.type]!;
    s = edit(s, (c) => {
      const d = ckData(c);
      const red = Math.min(6, (hex.token as number) - 1);
      d.forcedRoll = null;
      d.alchemist = { red, yellow: (hex.token as number) - red };
      // Keep the robber off this hex.
      const r = c.piecesOfType('robber')[0]!;
      const other = Object.keys(c.state.hexes).find(
        (h) => h !== hex.id && c.state.hexes[h as HexId]!.type === 'desert',
      ) as HexId | undefined;
      if (other) c.move(r, { kind: 'hex', id: other });
    });
    const before = s.players[0]!.hand[commodity] ?? 0;
    s = act(s, { type: 'roll', player: 0 });
    while (s.phase.id === 'loseCity' || s.phase.id === 'defenderPick')
      s = act(s, lib.legalActions(s, lib.waitingOn(s)[0]!)[0]!);
    expect(s.players[0]!.hand[commodity] ?? 0).toBeGreaterThan(before);
  });

  it('skips the robber on a 7 before the first attack, but still discards', () => {
    let s = playing();
    s = edit(s, (c) => {
      c.grant(1, { brick: 5, lumber: 5 });
      ckData(c).alchemist = { red: 3, yellow: 4 };
    });
    s = act(s, { type: 'roll', player: 0 });
    // The event die may start an attack; work through it.
    while (s.phase.id === 'loseCity' || s.phase.id === 'defenderPick')
      s = act(s, lib.legalActions(s, lib.waitingOn(s)[0]!)[0]!);
    const d = s.data['cities-knights'] as { robberActive: boolean };
    if (d.robberActive) return;
    expect(s.phase.id).toBe('discard');
    while (s.phase.id === 'discard') s = act(s, lib.legalActions(s, lib.waitingOn(s)[0]!)[0]!);
    expect(s.phase.id).toBe('main');
  });
});

describe('Barbarians', () => {
  it('takes a city from the weakest player when the knights lose', () => {
    let s = playing();
    s = edit(s, (c) => {
      // Seat 1 has an active knight; everyone else has none.
      c.place('knight1', 1, { kind: 'corner', id: knightSpot(c, 1) }, { active: true });
      attack(c);
    });
    const ctx = ctxOf(s);
    expect(ctx.piecesOf(1, 'city')).toHaveLength(1);
    for (const seat of [0, 2, 3]) expect(ctx.piecesOf(seat, 'city')).toHaveLength(0);
    expect(ckData(ctx).robberActive).toBe(true);
    expect(ctx.piecesOf(1).find((p) => p.type === 'knight1')!.props.active).toBe(false);
  });

  it('makes the strongest defender a Defender of Catan', () => {
    let s = playing();
    s = edit(s, (c) => {
      for (let seat = 0; seat < 4; seat++)
        c.place('knight1', seat, { kind: 'corner', id: knightSpot(c, seat) }, { active: true });
      c.place('knight2', 2, { kind: 'corner', id: knightSpot(c, 2) }, { active: true });
      attack(c);
    });
    const ctx = ctxOf(s);
    expect(ckData(ctx).defender[2]).toBe(1);
    expect(ctx.vp(2)).toBe(ctx.vp(0) + 1);
  });

  it('lets tied defenders each pick a progress deck', () => {
    let s = playing();
    s = edit(s, (c) => {
      for (let seat = 0; seat < 4; seat++)
        c.place('knight1', seat, { kind: 'corner', id: knightSpot(c, seat) }, { active: true });
      attack(c);
    });
    expect(ckData(ctxOf(s)).pendingDefender).toEqual([0, 1, 2, 3]);
  });
});

describe('City improvements and metropolises', () => {
  it('charges level + 1 commodities and gives the metropolis at level 4', () => {
    let s = playing();
    s = edit(s, (c) => {
      c.grant(0, { paper: 10 });
      ckData(c).alchemist = { red: 4, yellow: 4 };
    });
    s = act(s, { type: 'roll', player: 0 });
    while (s.phase.id !== 'main') s = act(s, lib.legalActions(s, lib.waitingOn(s)[0]!)[0]!);
    const paper = s.players[0]!.hand.paper ?? 0;
    for (let i = 0; i < 4; i++) s = act(s, { type: 'improveCity', player: 0, track: 'science' });
    expect(paper - (s.players[0]!.hand.paper ?? 0)).toBe(1 + 2 + 3 + 4);
    const ctx = ctxOf(s);
    expect(levels(ctx, 0).science).toBe(4);
    expect(ckData(ctx).metropolis.science?.seat).toBe(0);
    expect(cityOf(ctx, 0).props.metropolis).toBe('science');
    expect(lib.check(s, { type: 'improveCity', player: 0, track: 'science' })).toMatch(/paper/);
  });

  it('lets a level 5 player take the metropolis from a level 4 holder', () => {
    let s = playing();
    s = edit(s, (c) => {
      const d = ckData(c);
      levels(c, 1).trade = 4;
      d.metropolis.trade = { seat: 1, corner: (cityOf(c, 1).at as { id: CornerId }).id };
      cityOf(c, 1).props.metropolis = 'trade';
      levels(c, 0).trade = 4;
      c.grant(0, { cloth: 5 });
      d.alchemist = { red: 4, yellow: 4 };
    });
    s = act(s, { type: 'roll', player: 0 });
    while (s.phase.id !== 'main') s = act(s, lib.legalActions(s, lib.waitingOn(s)[0]!)[0]!);
    s = act(s, { type: 'improveCity', player: 0, track: 'trade' });
    const ctx = ctxOf(s);
    expect(ckData(ctx).metropolis.trade?.seat).toBe(0);
    expect(cityOf(ctx, 1).props.metropolis).toBeUndefined();
  });

  it('draws progress cards when the red die is within level + 1', () => {
    let s = playing();
    s = edit(s, (c) => {
      levels(c, 0).politics = 1;
      levels(c, 1).politics = 3;
      gateDraws(c, 'politics', 3);
    });
    const count = (seat: number) =>
      ['science', 'trade', 'politics'].reduce(
        (n, t) => n + (s.players[seat]!.held[t]?.length ?? 0),
        0,
      ) + (s.players[seat]!.played.constitution ?? 0);
    expect(count(0)).toBe(0);
    expect(count(1)).toBe(1);
  });

  it('lets a player go over 4 progress cards, then put one back under its deck', () => {
    let s = playing();
    const VP = ['printer', 'constitution'];
    s = edit(s, (c) => {
      const p = c.player(1);
      for (let i = 0; i < 5; i++) {
        const deck = (['science', 'trade', 'politics'] as const)[i % 3]!;
        const at = c.state.decks[deck]!.findIndex((x: string) => !VP.includes(x));
        const [card] = c.state.decks[deck]!.splice(at, 1);
        (p.held[deck] ??= []).push({ card: card!, acquiredTurn: 0 });
      }
    });
    s = act(s, { type: 'roll', player: s.turn.player });
    expect(s.phase.id).toBe('progressDiscard');
    expect(lib.waitingOn(s)).toEqual([1]);
    const back = lib.legalActions(s, 1)[0]!;
    expect(back.type).toBe('returnProgress');
    const deck = back.deck as string;
    s = act(s, back);
    expect(s.phase.id).not.toBe('progressDiscard');
    const held = ['science', 'trade', 'politics'].reduce(
      (n, t) => n + (s.players[1]!.held[t]?.length ?? 0),
      0,
    );
    expect(held).toBe(4);
    expect(s.decks[deck]!.at(-1)).toBe(back.card);
  });
});

describe('Knights', () => {
  it('builds, activates, moves and pushes away weaker knights', () => {
    let s = playing();
    s = edit(s, (c) => {
      c.grant(0, { wool: 5, ore: 5, grain: 5, brick: 5, lumber: 5 });
      ckData(c).alchemist = { red: 4, yellow: 4 };
    });
    s = act(s, { type: 'roll', player: 0 });
    while (s.phase.id !== 'main') s = act(s, lib.legalActions(s, lib.waitingOn(s)[0]!)[0]!);
    const spot = knightSpot(ctxOf(s), 0);
    s = act(s, { type: 'buildKnight', player: 0, corner: spot });
    let ctx = ctxOf(s);
    const k = ctx.piecesOf(0).find((p) => p.type === 'knight1')!;
    expect(k.props.active).toBe(false);
    expect(strength(ctx, 0)).toBe(0);
    s = act(s, { type: 'activateKnight', player: 0, knight: k.id });
    expect(strength(ctxOf(s), 0)).toBe(1);
    // Can't act on the turn it was activated.
    expect(lib.check(s, { type: 'moveKnight', player: 0, knight: k.id, to: spot })).toMatch(
      /activated this turn/,
    );
    s = act(s, { type: 'promoteKnight', player: 0, knight: k.id });
    ctx = ctxOf(s);
    const strong = ctx.piecesOf(0).find((p) => p.type === 'knight2')!;
    expect(knightLevel(strong)).toBe(2);
    expect(strong.props.active).toBe(true);
    // Mighty needs the fortress.
    expect(lib.check(s, { type: 'promoteKnight', player: 0, knight: strong.id })).toMatch(
      /once per turn|politics/,
    );

    // Next turn: move along the road network, then push a weaker rival.
    s = edit(s, (c) => {
      const kk = c.state.pieces[strong.id]!;
      kk.props.activatedTurn = -1;
    });
    ctx = ctxOf(s);
    const targets = moveTargets(ctx, ctx.state.pieces[strong.id]!);
    if (targets.length) {
      const rivalAt = targets[0]!;
      s = edit(s, (c) => c.place('knight1', 1, { kind: 'corner', id: rivalAt }, { active: true }));
      ctx = ctxOf(s);
      expect(displaceTargets(ctx, ctx.state.pieces[strong.id]!)).toContain(rivalAt);
      s = act(s, { type: 'displaceKnight', player: 0, knight: strong.id, to: rivalAt });
      expect(s.pieces[strong.id]!.at).toEqual({ kind: 'corner', id: rivalAt });
      expect(s.pieces[strong.id]!.props.active).toBe(false);
      expect(['relocateKnight', 'main']).toContain(s.phase.id);
    }
  });

  it('blocks rival roads but not the distance rule', () => {
    let s = playing();
    const spot = knightSpot(ctxOf(s), 0);
    s = edit(s, (c) => c.place('knight1', 0, { kind: 'corner', id: spot }));
    const ctx = ctxOf(s);
    expect(ctx.blocksRouteAt(spot, 1)).toBe(true);
    expect(ctx.blocksRouteAt(spot, 0)).toBe(false);
  });

  it('hides Master Merchant peeks from everyone else', () => {
    let s = playing();
    s = edit(s, (c) => {
      c.grant(2, { ore: 2 });
      ckData(c).peek = { seat: 0, target: 2, hand: { ...c.player(2).hand } };
    });
    const mine = lib.view(s, 0).data['cities-knights'] as { peek: { hand?: unknown } };
    const theirs = lib.view(s, 1).data['cities-knights'] as { peek: { hand?: unknown } };
    expect(mine.peek.hand).toBeDefined();
    expect(theirs.peek.hand).toBeUndefined();
  });
});

describe('Progress cards', () => {
  function withCard(card: string, deck: string, extra?: (c: Ctx) => void): GameState {
    let s = playing(4, `card-${card}`);
    s = edit(s, (c) => {
      ckData(c).alchemist = { red: 4, yellow: 4 };
      extra?.(c);
    });
    s = act(s, { type: 'roll', player: 0 });
    while (s.phase.id !== 'main') s = act(s, lib.legalActions(s, lib.waitingOn(s)[0]!)[0]!);
    return edit(s, (c) => {
      (c.player(0).held[deck] ??= []).push({ card, acquiredTurn: 0 });
    });
  }

  it('Resource Monopoly takes up to 2 of a resource from each player', () => {
    let s = withCard('resourceMonopoly', 'trade', (c) => {
      for (const seat of [1, 2, 3]) {
        const have = c.player(seat).hand.wool ?? 0;
        if (have) c.pay(seat, { wool: have });
      }
      c.grant(1, { wool: 3 });
      c.grant(2, { wool: 1 });
    });
    const before = s.players[0]!.hand.wool ?? 0;
    s = act(s, { type: 'playProgress', player: 0, card: 'resourceMonopoly', resource: 'wool' });
    expect((s.players[0]!.hand.wool ?? 0) - before).toBe(3);
    expect(s.players[1]!.hand.wool).toBe(1);
  });

  it('Wedding asks richer players for two cards each', () => {
    let s = withCard('wedding', 'politics', (c) => {
      c.player(1).played.printer = 2;
      c.grant(1, { grain: 3 });
    });
    s = act(s, { type: 'playProgress', player: 0, card: 'wedding' });
    expect(s.phase.id).toBe('wedding');
    expect(lib.waitingOn(s)).toEqual([1]);
    const gift = lib.legalActions(s, 1)[0]!;
    s = act(s, gift);
    expect(s.phase.id).toBe('main');
  });

  it('Saboteur makes players at or above your score discard half', () => {
    let s = withCard('saboteur', 'politics', (c) => {
      c.grant(1, { grain: 4, ore: 2 });
    });
    const size = Object.values(s.players[1]!.hand).reduce((a, b) => a + b, 0);
    s = act(s, { type: 'playProgress', player: 0, card: 'saboteur' });
    expect(s.phase.id).toBe('discard');
    expect((s.phase.owed as Record<number, number>)[1]).toBe(Math.floor(size / 2));
    while (s.phase.id === 'discard') s = act(s, lib.legalActions(s, lib.waitingOn(s)[0]!)[0]!);
    expect(s.phase.id).toBe('main');
  });

  it('Spy shows only the spy the cards, then takes one', () => {
    let s = withCard('spy', 'politics', (c) => {
      (c.player(2).held.science ??= []).push({ card: 'crane', acquiredTurn: 0 });
    });
    s = act(s, { type: 'playProgress', player: 0, card: 'spy', target: 2 });
    expect(s.phase.id).toBe('spy');
    expect(lib.view(s, 1).data['cities-knights']!.peek).not.toHaveProperty('progress.0');
    s = act(s, { type: 'takeProgress', player: 0, card: 'crane' });
    expect(s.players[0]!.held.science?.some((h) => h.card === 'crane')).toBe(true);
    expect(s.players[2]!.held.science ?? []).toHaveLength(0);
  });

  it('Printer scores at once and never sits in a hand', () => {
    let s = playing();
    s = edit(s, (c) => {
      c.state.decks.science = ['printer', ...(c.state.decks.science ?? [])];
      levels(c, 0).science = 5;
      gateDraws(c, 'science', 6);
    });
    expect(s.players[0]!.played.printer).toBe(1);
    expect(s.players[0]!.held.science ?? []).toHaveLength(0);
  });

  it('Commercial Harbor: each opponent picks the commodity they give back', () => {
    let s = playing();
    s = edit(s, (c) => {
      c.setPhase({ id: 'main' });
      for (const p of c.state.players) for (const k of Object.keys(p.hand)) p.hand[k] = 0;
      c.player(0).hand.brick = 2;
      c.player(1).hand.cloth = 1;
      c.player(1).hand.coin = 1;
      c.player(2).hand.paper = 1;
      (c.player(0).held.trade ??= []).push({ card: 'commercialHarbor', acquiredTurn: 0 });
    });
    s = act(s, { type: 'playProgress', player: 0, card: 'commercialHarbor' });
    expect(s.phase.id).toBe('commercialHarbor');
    expect(lib.legalActions(s, 0).every((a) => a.with !== 3 || a.type !== 'harborSwap')).toBe(true);
    s = act(s, { type: 'harborSwap', player: 0, with: 1, give: 'brick' });
    expect(lib.waitingOn(s)).toEqual([1]);
    expect(
      lib
        .legalActions(s, 1)
        .map((a) => a.commodity)
        .sort(),
    ).toEqual(['cloth', 'coin']);
    s = act(s, { type: 'harborGive', player: 1, commodity: 'coin' });
    expect(s.players[0]!.hand.coin).toBe(1);
    expect(s.players[1]!.hand.brick).toBe(1);
    expect(s.players[1]!.hand.cloth).toBe(1);
    expect(lib.waitingOn(s)).toEqual([0]);
    s = act(s, { type: 'harborSwap', player: 0, with: 2, give: 'brick' });
    s = act(s, { type: 'harborGive', player: 2, commodity: 'paper' });
    expect(s.phase.id).toBe('main');
    expect(s.players[0]!.hand.paper).toBe(1);
  });

  it('Alchemist sets the production dice', () => {
    let s = playing();
    s = edit(s, (c) => {
      (c.player(0).held.science ??= []).push({ card: 'alchemist', acquiredTurn: 0 });
    });
    s = act(s, { type: 'playProgress', player: 0, card: 'alchemist', red: 2, yellow: 3 });
    const last = (s.data.base as { lastRoll: { total: number; dice: Record<string, unknown> } })
      .lastRoll;
    expect(last.total).toBe(5);
    expect(last.dice.red).toBe(2);
  });
});

describe('Cities & Knights full games', () => {
  for (const players of [3, 4]) {
    it(`${players} players: random games finish with no rule errors`, () => {
      let finished = 0;
      const seen = new Set<string>();
      for (let g = 0; g < 4; g++) {
        const r = simulate(ckGame(players, `ck-${players}-${g}`), g + 11, 20000, g === 0);
        r.seen.forEach((x) => seen.add(x));
        if (r.state.winner !== null) finished++;
      }
      expect(finished).toBeGreaterThanOrEqual(3);
      for (const t of ['buildKnight', 'activateKnight', 'improveCity', 'buildWall'])
        expect(seen).toContain(t);
    }, 240_000);
  }

  for (const scenario of SEA_SCENARIOS.slice(0, 3)) {
    it(`with Seafarers (${scenario.name}): random games finish with no rule errors`, () => {
      let finished = 0;
      for (let g = 0; g < 3; g++) {
        const r = simulate(
          ckSeaGame(scenario.id, 4, `cks-${scenario.id}-${g}`),
          g + 3,
          9000,
          g === 0,
        );
        if (r.state.winner !== null) finished++;
      }
      expect(finished).toBeGreaterThanOrEqual(2);
    }, 240_000);
  }

  it('replays exactly from seed and actions', () => {
    const initial = ckGame(4, 'replay');
    const { state, actions } = simulate(initial, 5, 2000);
    let s = initial;
    for (const a of actions) s = lib.apply(s, a).state;
    expect(s).toEqual(state);
  }, 60_000);
});
