import { describe, expect, it } from 'vitest';
import {
  Ctx,
  ModuleLibrary,
  type Action,
  type CornerId,
  type EdgeId,
  type GameState,
  type HexId,
  type Piece,
} from '@colonizers/engine';
import { baseModule } from '@colonizers/module-base';
import {
  barbarianStrength,
  citiesKnightsModule,
  ckData,
  cityAtRisk,
  knightStrength,
  strength,
} from '@colonizers/module-cities-knights';
import { generateBoard } from '@colonizers/maps';
import {
  DUKE_CARD,
  junker,
  junkerHex,
  SCHOLAR_CARD,
  scholar,
  strategistModule,
} from '../src/index.ts';

const lib = new ModuleLibrary([baseModule, citiesKnightsModule, strategistModule]);
const ctxOf = (s: GameState) => new Ctx(s, lib.registry(s.modules));
const act = (s: GameState, a: Action) => lib.apply(s, a).state;

function edit(state: GameState, fn: (ctx: Ctx) => void): GameState {
  const next = structuredClone(state);
  const ctx = ctxOf(next);
  fn(ctx);
  ctx.commit();
  return next;
}

function game(seed = 'sf'): GameState {
  const board = generateBoard({ seed, players: 4, mode: 'classic' });
  return lib.createGame({
    seed,
    players: ['A', 'B', 'C', 'D'],
    modules: ['base', 'cities-knights', 'strategist'],
    map: board.map,
    fixedSeats: true,
  }).state;
}

function setup(s: GameState): GameState {
  for (let i = 0; i < 300 && s.phase.id !== 'roll'; i++) {
    const seat = lib.waitingOn(s)[0] as number;
    s = act(s, lib.legalActions(s, seat)[0] as Action);
  }
  return s;
}

const main = (s: GameState, fn: (ctx: Ctx) => void = () => {}) =>
  edit(s, (ctx) => {
    ctx.state.turn = { number: 5, player: 0, round: 2 };
    ctx.setPhase({ id: 'main' });
    fn(ctx);
  });

/** Rolls doubles (2 and 2) and works out anything the roll asks for. */
function rollDoubles(s: GameState): GameState {
  s = edit(s, (ctx) => {
    ctx.state.turn.player = 0;
    ctx.setPhase({ id: 'roll' });
    ckData(ctx).alchemist = { red: 2, yellow: 2 };
    ckData(ctx).forcedEvent = 'trade';
  });
  s = act(s, { type: 'roll', player: 0 });
  for (let i = 0; i < 20 && !['main', 'placeJunker'].includes(s.phase.id); i++)
    s = act(s, lib.legalActions(s, lib.waitingOn(s)[0] as number)[0] as Action);
  return s;
}

const cityCorner = (ctx: Ctx, seat: number) =>
  (ctx.piecesOf(seat, 'city')[0]?.at as { id: CornerId }).id;

const hexOfCorner = (ctx: Ctx, c: CornerId) =>
  (ctx.geometry.cornerHexes.get(c) ?? []).find(
    (h) => ctx.registry.hexTypes[ctx.state.hexes[h]!.type]?.terrain === 'land',
  ) as HexId;

describe('Strategist & Commander', () => {
  it('moves the Smith to politics and adds five Dukes and five Scholars', () => {
    const s = game();
    expect(s.decks.science?.filter((c) => c === 'smith')).toHaveLength(0);
    expect(s.decks.politics?.filter((c) => c === 'smith')).toHaveLength(2);
    expect(s.decks.politics?.filter((c) => c === DUKE_CARD)).toHaveLength(5);
    expect(s.decks.science?.filter((c) => c === SCHOLAR_CARD)).toHaveLength(5);
  });

  it('puts the Junker down on doubles, and keeps it there until the first attack', () => {
    let s = setup(game());
    s = rollDoubles(s);
    expect(s.phase.id).toBe('placeJunker');
    const hex = (lib.legalActions(s, 0)[0] as Action).hex as HexId;
    s = act(s, { type: 'placeJunker', player: 0, hex });
    expect(junkerHex(ctxOf(s))).toBe(hex);
    expect(s.phase.id).toBe('main');
    // Doubles again: it stays, as the barbarians have not landed yet.
    s = rollDoubles(s);
    expect(s.phase.id).toBe('main');
    // Once they have, doubles move it.
    s = edit(s, (ctx) => {
      ckData(ctx).attacks = 1;
    });
    s = rollDoubles(s);
    expect(s.phase.id).toBe('placeJunker');
    // It is gone again (the attack count moved on since it landed); doubles bring it back.
    expect(junker(ctxOf(s))).toBeUndefined();
  });

  it('freezes the field: no building, no knight moves, no robber', () => {
    let s = setup(game('sf-freeze'));
    const c0 = ctxOf(s);
    const corner = cityCorner(c0, 0);
    const hex = hexOfCorner(c0, corner);
    s = main(s, (ctx) => {
      ctx.place(
        'junker',
        null,
        { kind: 'hex', id: hex },
        {
          attacks: 0,
        },
      );
      ctx.grant(0, { grain: 5, ore: 5, brick: 5, lumber: 5, wool: 5 });
      ckData(ctx).robberActive = true;
    });
    const legal = lib.legalActions(s, 0);
    expect(legal.some((a) => a.type === 'buildWall' && a.corner === corner)).toBe(false);
    expect(() => act(s, { type: 'buildWall', player: 0, corner } as Action)).toThrow(/Junker/);
    const edges = ctxOf(s).geometry.hexEdges.get(hex) as EdgeId[];
    expect(legal.some((a) => a.type === 'buildRoad' && edges.includes(a.edge as EdgeId))).toBe(
      false,
    );
    s = edit(s, (ctx) => ctx.setPhase({ id: 'moveRobber', returnTo: 'main' }));
    expect(lib.legalActions(s, 0).some((a) => a.type === 'moveRobber' && a.hex === hex)).toBe(
      false,
    );
  });

  it('hides knights and cities on its field from the barbarians', () => {
    let s = setup(game('sf-fog'));
    const c0 = ctxOf(s);
    const corner = cityCorner(c0, 0);
    const hex = hexOfCorner(c0, corner);
    const knightAt = (c0.geometry.hexCorners.get(hex) ?? []).find(
      (c) => c !== corner && c0.piecesAt({ kind: 'corner', id: c }).length === 0,
    ) as CornerId;
    s = main(s, (ctx) => {
      ctx.place('knight2', 0, { kind: 'corner', id: knightAt }, { active: true });
    });
    const before = barbarianStrength(ctxOf(s));
    expect(strength(ctxOf(s), 0)).toBe(2);
    s = edit(s, (ctx) => {
      ctx.place('junker', null, { kind: 'hex', id: hex }, { attacks: 0 });
    });
    const c = ctxOf(s);
    const onHex = (c.geometry.hexCorners.get(hex) ?? []).filter(
      (x) => c.buildingAt(x)?.type === 'city',
    ).length;
    expect(onHex).toBeGreaterThan(0);
    expect(barbarianStrength(c)).toBe(before - onHex);
    expect(strength(c, 0)).toBe(0);
    expect(cityAtRisk(c, 0).some((p) => (p.at as { id: CornerId }).id === corner)).toBe(false);
  });

  it('plays the Duke: stronger beside your own knight, weaker beside a rival’s', () => {
    let s = setup(game('sf-duke'));
    let mine = '';
    let theirs = '';
    s = main(s, (ctx) => {
      const free = (Object.keys(ctx.state.hexes) as HexId[])
        .flatMap((h) => ctx.geometry.hexCorners.get(h) ?? [])
        .filter(
          (c) =>
            ctx.isLandCorner(c) &&
            ctx.piecesAt({ kind: 'corner', id: c }).length === 0 &&
            (ctx.geometry.cornerNeighbours.get(c) ?? []).every(
              (n) => ctx.piecesAt({ kind: 'corner', id: n }).length === 0,
            ),
        );
      mine = ctx.place('knight3', 0, { kind: 'corner', id: free[0]! }, { active: true }).id;
      theirs = ctx.place('knight1', 1, { kind: 'corner', id: free[5]! }, { active: true }).id;
      ctx.player(0).held.politics = [
        { card: DUKE_CARD, acquiredTurn: 1 },
        { card: DUKE_CARD, acquiredTurn: 1 },
      ];
    });
    s = act(s, { type: 'playProgress', player: 0, card: DUKE_CARD } as Action);
    expect(s.phase.id).toBe('placeSfDuke');
    s = act(s, { type: 'placeSfDuke', player: 0, knight: mine } as Action);
    // Mighty already: 3 at most.
    expect(knightStrength(ctxOf(s), s.pieces[mine] as Piece)).toBe(3);
    s = act(s, { type: 'playProgress', player: 0, card: DUKE_CARD } as Action);
    s = act(s, { type: 'placeSfDuke', player: 0, knight: theirs } as Action);
    // A basic knight stays at 1, and the Duke left the first knight.
    expect(knightStrength(ctxOf(s), s.pieces[theirs] as Piece)).toBe(1);
    expect(s.pieces[mine]?.props.duke).toBeUndefined();
    s = edit(s, (ctx) => {
      const k = ctx.state.pieces[theirs] as Piece;
      ctx.upgrade(k, 'knight2');
    });
    const promoted = Object.values(s.pieces).find((p) => p.type === 'knight2') as Piece;
    // It stays with the knight when promoted, and takes 1 off.
    expect(knightStrength(ctxOf(s), promoted)).toBe(1);
  });

  it('plays the Scholar: its owner gets the building’s yield again, until the next attack', () => {
    let s = setup(game('sf-scholar'));
    const c0 = ctxOf(s);
    const corner = cityCorner(c0, 1);
    const hex = (c0.geometry.cornerHexes.get(corner) ?? [])
      .map((h) => s.hexes[h]!)
      .find((h) => h.token && h.token !== 7 && c0.registry.hexTypes[h.type]?.produces);
    if (!hex) return;
    s = main(s, (ctx) => {
      ctx.player(0).held.science = [{ card: SCHOLAR_CARD, acquiredTurn: 1 }];
      const r = ctx.piecesOfType('robber')[0]!;
      const away = (Object.keys(ctx.state.hexes) as HexId[]).find(
        (h) =>
          !(ctx.geometry.hexCorners.get(h) ?? []).includes(corner) &&
          ctx.state.hexes[h]?.type === 'desert',
      );
      if (away) ctx.move(r, { kind: 'hex', id: away });
      for (const p of ctx.state.players)
        for (const [c, n] of Object.entries({ ...p.hand })) if (n) ctx.pay(p.seat, { [c]: n });
    });
    s = act(s, { type: 'playProgress', player: 0, card: SCHOLAR_CARD } as Action);
    s = act(s, { type: 'placeSfScholar', player: 0, corner } as Action);
    expect(scholar(ctxOf(s))?.mark.owner).toBe(0);
    s = edit(s, (ctx) => {
      ctx.setPhase({ id: 'roll' });
      const t = hex.token as number;
      const red = Math.min(6, t - 1);
      ckData(ctx).alchemist = { red, yellow: t - red };
      ckData(ctx).forcedEvent = 'trade';
    });
    s = act(s, { type: 'roll', player: 0 });
    const total = (seat: number) =>
      Object.values(s.players[seat]?.hand ?? {}).reduce((a, b) => a + b, 0);
    expect(total(0)).toBeGreaterThanOrEqual(2);
    expect(total(1)).toBeGreaterThanOrEqual(2);
    // An attack sends it away.
    s = edit(s, (ctx) => {
      ckData(ctx).attacks += 1;
      ctx.setPhase({ id: 'main' });
    });
    s = act(s, { type: 'endTurn', player: 0 });
    expect(scholar(ctxOf(s))).toBeNull();
  });

  it('lets a strong knight step down to move the barbarian ship', () => {
    let s = setup(game('sf-ship'));
    let k = '';
    s = main(s, (ctx) => {
      const c = (Object.keys(ctx.state.hexes) as HexId[])
        .flatMap((h) => ctx.geometry.hexCorners.get(h) ?? [])
        .find((x) => ctx.isLandCorner(x) && ctx.piecesAt({ kind: 'corner', id: x }).length === 0)!;
      k = ctx.place('knight2', 0, { kind: 'corner', id: c }, { active: true }).id;
      ckData(ctx).barbarian = 3;
    });
    s = act(s, { type: 'shiftBarbarians', player: 0, knight: k, steps: -1 } as Action);
    expect(ckData(ctxOf(s)).barbarian).toBe(2);
    expect(s.pieces[k]?.props.active).toBe(false);
    expect(() =>
      act(s, { type: 'shiftBarbarians', player: 0, knight: k, steps: 1 } as Action),
    ).toThrow(/active/);
  });

  it('takes the merchant’s point away', () => {
    let s = setup(game('sf-merchant'));
    const before = ctxOf(s).vp(0);
    s = edit(s, (ctx) => {
      const h = Object.keys(ctx.state.hexes)[0] as HexId;
      ctx.place('merchant', 0, { kind: 'hex', id: h });
    });
    expect(ctxOf(s).vp(0)).toBe(before);
  });
});

describe('Strategist & Commander in a random game', () => {
  it('plays without getting stuck', () => {
    let x = 31;
    const rand = () => {
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      return (x >>> 0) / 4294967296;
    };
    let s = game('sf-random');
    let junkers = 0;
    for (let i = 0; i < 6000 && s.winner === null; i++) {
      const seat = lib.waitingOn(s)[0];
      expect(seat, `${s.phase.id} at step ${i}`).toBeDefined();
      const options = lib.legalActions(s, seat as number);
      expect(options.length, `${s.phase.id} at step ${i}`).toBeGreaterThan(0);
      const pick =
        options.find((a) => ['buildSettlement', 'buildCity', 'placeJunker'].includes(a.type)) ??
        options.find((a) => a.type === 'playProgress' && rand() < 0.7) ??
        options[Math.floor(rand() * options.length)];
      const r = lib.apply(s, pick as Action);
      if (r.events.some((e) => e.type === 'junkerPlaced')) junkers++;
      s = r.state;
    }
    expect(s.turn.number).toBeGreaterThan(20);
    expect(junkers).toBeGreaterThan(0);
  }, 90_000);
});
