import { describe, expect, it } from 'vitest';
import {
  Ctx,
  ModuleLibrary,
  type Action,
  type CornerId,
  type EdgeId,
  type GameState,
  type HexId,
} from '@colonizers/engine';
import { baseModule } from '@colonizers/module-base';
import { variantsModule } from '@colonizers/module-variants';
import { generateEpBoard } from '@colonizers/maps';
import { chooseAction, newMemory, type BotConfig, type BotMemory } from '@colonizers/bots';
import {
  catchFish,
  cargoOf,
  epData,
  lairCrews,
  missionSteps,
  pirateHexes,
  pirateShip,
  sailPlan,
  coastal,
  explorersPiratesModule,
  GOLD,
  movesLeft,
  nearFog,
  sailRange,
} from '../src/index.ts';

const lib = new ModuleLibrary([baseModule, explorersPiratesModule, variantsModule]);

function rng(seed: number): () => number {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

function game(players = 3, seed = 'ep', scenario = 'land-ho'): GameState {
  const b = generateEpBoard({ seed, players, scenario });
  return lib.createGame({
    seed,
    players: Array.from({ length: players }, (_, i) => `P${i}`),
    modules: [...b.modules, 'variants'],
    map: b.map,
    settings: { vpTarget: 10, ...b.settings },
    fixedSeats: true,
  }).state;
}

const ctxOf = (s: GameState) => new Ctx(s, lib.registry(s.modules));
const act = (s: GameState, a: Action) => lib.apply(s, a).state;

function edit(s: GameState, fn: (c: Ctx) => void): GameState {
  const t = structuredClone(s);
  const c = ctxOf(t);
  fn(c);
  c.commit();
  return t;
}

function finishSetup(s: GameState, seed = 1): GameState {
  const rand = rng(seed);
  while (s.phase.id === 'setup') {
    const seat = lib.waitingOn(s)[0]!;
    const o = lib.legalActions(s, seat);
    s = act(s, o[Math.floor(rand() * o.length)]!);
  }
  return s;
}

/** Rolls until the main phase, skipping 7s' discards. */
function toMain(s: GameState): GameState {
  for (let i = 0; i < 20 && s.phase.id !== 'main'; i++) {
    const seat = lib.waitingOn(s)[0]!;
    const o = lib.legalActions(s, seat);
    s = act(s, o[0]!);
  }
  return s;
}

const shipOf = (s: GameState, seat: number) =>
  Object.values(s.pieces).find((p) => p.type === 'ship' && p.owner === seat)!;

describe('Land Ho! boards', () => {
  it('put a visible home island in a sea of fog, with no harbors or robber', () => {
    for (const players of [2, 3, 4]) {
      for (let i = 0; i < 12; i++) {
        const b = generateEpBoard({ seed: `b${i}`, players, scenario: 'land-ho' });
        expect(b.map.harbors).toEqual([]);
        expect(b.map.pieces ?? []).toEqual([]);
        const home = b.settings.setupHexes as HexId[];
        expect(home.length).toBeGreaterThanOrEqual(10);
        expect(b.map.hexes.filter((h) => h.hidden).length).toBeGreaterThan(20);
        expect(b.map.hexes.filter((h) => h.hidden && h.type !== 'sea').length).toBeGreaterThan(8);
      }
    }
  });
});

describe('Setup', () => {
  it('starts with a harbor settlement and a ship carrying a settler, then a settlement and road', () => {
    let s = game(3);
    const c = ctxOf(s);
    const seat = lib.waitingOn(s)[0]!;
    // An inland corner is refused for the harbor settlement.
    const home = s.settings.setupHexes as HexId[];
    const inland = c.geometry.corners.find((x) => {
      const hs = c.geometry.cornerHexes.get(x) ?? [];
      return hs.length === 3 && hs.every((h) => home.includes(h));
    })!;
    expect(lib.check(s, { type: 'placeSetupSettlement', player: seat, corner: inland })).toMatch(
      /coast/,
    );
    const coast = lib.legalActions(s, seat).find((a) => a.type === 'placeSetupSettlement')!
      .corner as CornerId;
    expect(coastal(c, coast)).toBe(true);
    s = act(s, { type: 'placeSetupSettlement', player: seat, corner: coast });
    expect(Object.values(s.pieces).some((p) => p.type === 'harbor' && p.owner === seat)).toBe(true);
    const legal = lib.legalActions(s, seat);
    expect(legal.some((a) => a.type === 'placeSetupRoad')).toBe(false);
    s = act(
      s,
      legal.find((a) => a.type === 'placeSetupShip')!,
    );
    expect(cargoOf(shipOf(s, seat))).toEqual(['settler']);

    s = finishSetup(s);
    const cs = ctxOf(s);
    for (const p of s.players) {
      expect(cs.piecesOf(p.seat, 'harbor')).toHaveLength(1);
      expect(cs.piecesOf(p.seat, 'settlement')).toHaveLength(1);
      expect(cs.piecesOf(p.seat, 'road')).toHaveLength(1);
      expect(cs.piecesOf(p.seat, 'ship')).toHaveLength(1);
      expect(p.hand[GOLD]).toBe(2);
      expect(cs.vp(p.seat)).toBe(3);
    }
    expect(cs.vpTarget()).toBe(8);
    expect(Object.values(s.pieces).some((p) => p.type === 'robber')).toBe(false);
  });
});

describe('Turns', () => {
  it('have no cities or development cards, trade 3:1, and sell three of a kind for gold', () => {
    let s = toMain(finishSetup(game(3)));
    const seat = s.turn.player;
    s = edit(s, (c) => c.grant(seat, { grain: 4, ore: 4, wool: 3 }));
    const corner = (
      Object.values(s.pieces).find((p) => p.type === 'settlement' && p.owner === seat)!.at as {
        id: CornerId;
      }
    ).id;
    expect(lib.check(s, { type: 'buildCity', player: seat, corner })).toMatch(/no cities/);
    expect(lib.check(s, { type: 'buyDevCard', player: seat })).toMatch(/no development/);
    const gold = s.players[seat]!.hand[GOLD] ?? 0;
    const wool = s.players[seat]!.hand.wool ?? 0;
    s = act(s, { type: 'bankTrade', player: seat, give: 'wool', get: GOLD });
    expect(s.players[seat]!.hand[GOLD]).toBe(gold + 1);
    expect(s.players[seat]!.hand.wool ?? 0).toBe(wool - 3);
    expect(lib.check(s, { type: 'bankTrade', player: seat, give: GOLD, get: 'wool' })).not.toBe(
      null,
    );
  });

  it('let gold buy two resources a turn', () => {
    let s = toMain(finishSetup(game(3)));
    const seat = s.turn.player;
    s = edit(s, (c) => c.grant(seat, { [GOLD]: 10 }));
    s = act(s, { type: 'buyWithGold', player: seat, resource: 'ore' });
    s = act(s, { type: 'buyWithGold', player: seat, resource: 'ore' });
    expect(lib.check(s, { type: 'buyWithGold', player: seat, resource: 'ore' })).toMatch(
      /at most 2/,
    );
  });

  it('pay 1 gold to everyone a roll gives nothing, and skip the robber on a 7', () => {
    let s = finishSetup(game(3));
    for (let i = 0; i < 30; i++) {
      const before = s.players.map((p) => p.hand[GOLD] ?? 0);
      const seat = s.turn.player;
      const r = lib.apply(s, { type: 'roll', player: seat });
      s = r.state;
      const total = (s.data.base as { lastRoll: { total: number } }).lastRoll.total;
      const prod = r.events.find((e) => e.type === 'production');
      if (total === 7) {
        expect(['main', 'discard']).toContain(s.phase.id);
      } else {
        const received = prod!.received as Record<number, Record<string, number>>;
        for (const p of s.players) {
          const got = Object.values(received[p.seat] ?? {}).reduce((a, n) => a + n, 0);
          expect(s.players[p.seat]!.hand[GOLD] ?? 0).toBe(before[p.seat]! + (got ? 0 : 1));
        }
      }
      while (s.phase.id === 'discard') {
        const w = lib.waitingOn(s)[0]!;
        s = act(s, lib.legalActions(s, w)[0]!);
      }
      expect(s.phase.id).toBe('main');
      s = act(s, { type: 'endTurn', player: seat });
    }
  });
});

describe('Ships', () => {
  it('sail 4 edges, 6 with extra sails, and stop at the fog', () => {
    let s = toMain(finishSetup(game(3)));
    const seat = s.turn.player;
    let ship = shipOf(s, seat);
    let c = ctxOf(s);
    const range = sailRange(c, ship);
    expect(Math.max(...range.values())).toBeLessThanOrEqual(4);
    expect(range.size).toBeGreaterThan(0);
    s = edit(s, (x) => x.grant(seat, { wool: 1 }));
    s = act(s, { type: 'boostShip', player: seat, ship: ship.id });
    expect(s.phase.id).toBe('sail');
    // No building once the ships are out.
    expect(lib.legalActions(s, seat).some((a) => a.type.startsWith('build'))).toBe(false);
    ship = shipOf(s, seat);
    c = ctxOf(s);
    expect(movesLeft(ship)).toBe(6);
    const far = sailRange(c, ship);
    expect(Math.max(...far.values())).toBeGreaterThan(Math.max(...range.values()) - 1);

    // Sail to the fog: it turns over, pays, and the ship stops.
    const fogEdge = [...far.keys()].find((e) =>
      (c.geometry.edgeCorners.get(e) ?? []).some((x) => nearFog(c, x)),
    );
    expect(fogEdge).toBeDefined();
    const hand = { ...s.players[seat]!.hand };
    const r = lib.apply(s, { type: 'sailShip', player: seat, ship: ship.id, to: fogEdge! });
    s = r.state;
    expect(r.events.some((e) => e.type === 'revealed')).toBe(true);
    const found = r.events.filter((e) => e.type === 'discovered');
    expect(found.length).toBeGreaterThan(0);
    const cardsAfter = Object.values(s.players[seat]!.hand).reduce((a, n) => a + n, 0);
    const cardsBefore = Object.values(hand).reduce((a, n) => a + n, 0);
    expect(cardsAfter).toBeGreaterThan(cardsBefore);
    expect(movesLeft(shipOf(s, seat))).toBeLessThanOrEqual(0);
    expect(lib.legalActions(s, seat).some((a) => a.type === 'sailShip' && a.ship === ship.id)).toBe(
      false,
    );
    // Its moves come back next turn.
    s = act(s, { type: 'endTurn', player: seat });
    expect(shipOf(s, seat).props.used).toBe(0);
  });

  it('found a settlement from a ship with a settler, and both go back to the supply', () => {
    let s = toMain(finishSetup(game(3)));
    const seat = s.turn.player;
    const ship = shipOf(s, seat);
    let c = ctxOf(s);
    // Find a free corner on land: move the ship beside it by hand.
    let target: { edge: EdgeId; corner: CornerId } | null = null;
    for (const e of c.geometry.edges) {
      if (c.piecesAt({ kind: 'edge', id: e }).length) continue;
      if (!(c.geometry.edgeHexes.get(e) ?? []).some((h) => c.isSea(h))) continue;
      for (const corner of c.geometry.edgeCorners.get(e) ?? []) {
        if (!c.isLandCorner(corner) || nearFog(c, corner)) continue;
        if (c.piecesAt({ kind: 'corner', id: corner }).length) continue;
        const near = [corner, ...(c.geometry.cornerNeighbours.get(corner) ?? [])];
        if (near.some((x) => c.buildingAt(x))) continue;
        target = { edge: e, corner };
      }
      if (target) break;
    }
    expect(target).not.toBeNull();
    s = edit(s, (x) => x.move(x.state.pieces[ship.id]!, { kind: 'edge', id: target!.edge }));
    const vp = ctxOf(s).vp(seat);
    s = act(s, { type: 'foundSettlement', player: seat, ship: ship.id, corner: target!.corner });
    c = ctxOf(s);
    expect(c.vp(seat)).toBe(vp + 1);
    expect(c.piecesOf(seat, 'ship')).toHaveLength(0);
    expect(c.buildingAt(target!.corner)?.type).toBe('settlement');
  });

  it('are built beside a harbor settlement and take settlers aboard', () => {
    let s = toMain(finishSetup(game(3)));
    const seat = s.turn.player;
    s = edit(s, (c) => c.grant(seat, { lumber: 3, wool: 3, brick: 2, grain: 2 }));
    const builds = lib.legalActions(s, seat).filter((a) => a.type === 'buildShip');
    expect(builds.length).toBeGreaterThan(0);
    s = act(s, builds[0]!);
    const fresh = Object.values(s.pieces).find(
      (p) => p.type === 'ship' && p.owner === seat && cargoOf(p).length === 0,
    )!;
    // The starting ship already holds a settler, and only two settlers are out at a time.
    s = act(s, { type: 'buildSettler', player: seat, at: fresh.id });
    expect(cargoOf(s.pieces[fresh.id]!)).toEqual(['settler']);
    const harbor = Object.values(s.pieces).find((p) => p.type === 'harbor' && p.owner === seat)!;
    expect(lib.check(s, { type: 'buildSettler', player: seat, at: harbor.id })).toMatch(
      /No settlers left|afford/,
    );
    // A ship beside the harbor swaps its cargo with the dock.
    s = act(s, { type: 'swapCargo', player: seat, ship: fresh.id });
    expect(cargoOf(s.pieces[harbor.id]!)).toEqual(['settler']);
    expect(cargoOf(s.pieces[fresh.id]!)).toEqual([]);
  });
});

describe('Bots', () => {
  for (const players of [3, 4]) {
    it(`play Land Ho! with ${players} players to a winner`, () => {
      let s = game(players, `bot-${players}`);
      const bot: BotConfig = { level: 'medium', style: 'balanced' };
      const rand = rng(5);
      const memory: BotMemory[] = Array.from({ length: players }, () => newMemory());
      let clock = 0;
      for (let i = 0; i < 4000 && s.winner === null; i++) {
        clock += 1000;
        const waiting = lib.waitingOn(s);
        expect(waiting.length).toBeGreaterThan(0);
        let acted = false;
        for (const seat of waiting) {
          const a = chooseAction(lib, s, seat, bot, memory[seat]!, { rand, now: clock });
          if (!a) continue;
          s = act(s, a);
          acted = true;
          break;
        }
        if (!acted) clock += 20_000;
      }
      expect(s.winner).not.toBe(null);
      const c = ctxOf(s);
      // Someone sailed out and founded a settlement on new land.
      const settled = Object.values(s.pieces).filter((p) => p.type === 'settlement').length;
      expect(settled + c.piecesOfType('harbor').length).toBeGreaterThan(players * 2);
    }, 120_000);
  }
});

describe('Pirate Lairs', () => {
  const lairGame = (players = 3, seed = 'lairs') =>
    toMain(finishSetup(game(players, seed, 'pirate-lairs')));

  /** Turns over a lair's gold field and puts ships with crews beside it. */
  function atLair(s: GameState, seats: number[], crews = 2) {
    let hex = '' as HexId;
    let edges: EdgeId[] = [];
    s = edit(s, (c) => {
      hex = Object.keys(epData(c).lairs)[0] as HexId;
      const h = c.state.hexes[hex]!;
      delete h.hidden;
      for (const n of c.geometry.hexNeighbours.get(hex) ?? []) delete c.state.hexes[n]!.hidden;
      edges = (c.geometry.hexEdges.get(hex) ?? []).filter(
        (e) => !c.piecesAt({ kind: 'edge', id: e }).length,
      );
      seats.forEach((seat, i) => {
        c.place(
          'ship',
          seat,
          { kind: 'edge', id: edges[i]! },
          {
            cargo: Array<string>(crews).fill('crew'),
            used: 0,
          },
        );
      });
    });
    return {
      s,
      hex,
      ship: (seat: number) =>
        Object.values(s.pieces).find(
          (p) =>
            p.type === 'ship' &&
            p.owner === seat &&
            p.at.kind === 'edge' &&
            edges.includes(p.at.id),
        )!,
    };
  }

  it('hide a lair on a gold field for each player plus one', () => {
    for (const players of [2, 3, 4]) {
      const s = game(players, `g${players}`, 'pirate-lairs');
      const gold = Object.values(s.hexes).filter((h) => h.type === 'gold');
      expect(gold).toHaveLength(players + 1);
      expect(gold.every((h) => h.hidden && h.token !== 6 && h.token !== 8)).toBe(true);
      expect(Object.keys(epData(ctxOf(s)).lairs)).toHaveLength(players + 1);
      expect(ctxOf(s).vpTarget()).toBe(12);
    }
  });

  it('fall to the third crew: gold and a mission step for everyone, one more for the hero', () => {
    let s = lairGame();
    const me = s.turn.player;
    const other = (me + 1) % 3;
    const at = atLair(s, [me, other], 2);
    s = at.s;
    // Another player's crews already wait at the lair.
    s = edit(s, (c) => {
      epData(c).lairs[at.hex] = { [other]: 1 };
    });
    const vp = s.players.map((p) => ctxOf(s).vp(p.seat));
    const gold = s.players.map((p) => p.hand[GOLD] ?? 0);
    const r = lib.apply(s, { type: 'landCrew', player: me, ship: at.ship(me).id, hex: at.hex });
    s = r.state;
    const c = ctxOf(s);
    // Only the 2 crews the lair needed went ashore.
    expect(lairCrews(c, at.hex)).toBe(0);
    expect(epData(c).captured).toContain(at.hex);
    const cap = r.events.find((e) => e.type === 'lairCaptured')!;
    expect(cap.players).toEqual([me, other].sort());
    for (const seat of [me, other]) {
      expect(s.players[seat]!.hand[GOLD]).toBe(gold[seat]! + 2);
      expect(missionSteps(c, seat)).toBe(seat === cap.hero ? 2 : 1);
      expect(c.vp(seat)).toBe(vp[seat]! + missionSteps(c, seat));
    }
    // A captured field pays 2 gold to a settlement beside it.
    const field = s.hexes[at.hex]!;
    const piece = Object.values(s.pieces).find((p) => p.type === 'settlement')!;
    expect(c.reduce('hexYield', field, piece, {})).toEqual({ [GOLD]: 2 });
  });

  it('have crews built onto a harbor or a ship beside it', () => {
    let s = lairGame();
    const me = s.turn.player;
    s = edit(s, (c) => c.grant(me, { ore: 3, wool: 3 }));
    const harbor = Object.values(s.pieces).find((p) => p.type === 'harbor' && p.owner === me)!;
    s = act(s, { type: 'buildCrew', player: me, at: harbor.id });
    s = act(s, { type: 'buildCrew', player: me, at: harbor.id });
    expect(cargoOf(s.pieces[harbor.id]!)).toEqual(['crew', 'crew']);
    expect(lib.check(s, { type: 'buildCrew', player: me, at: harbor.id })).toMatch(/no room/);
  });

  it('move the pirate on a 7, rob a ship beside it, and charge tribute', () => {
    let s = lairGame();
    const me = s.turn.player;
    const victim = (me + 1) % 3;
    s = edit(s, (c) => c.setPhase({ id: 'moveRobber', returnTo: 'main' }));
    const legal = lib.legalActions(s, me);
    expect(legal.some((a) => a.type === 'moveRobber')).toBe(false);
    expect(legal.every((a) => a.type === 'movePirate')).toBe(true);
    // Put the victim's ship beside a pirate spot.
    const c0 = ctxOf(s);
    const spot = pirateHexes(c0).find((h) =>
      (c0.geometry.hexEdges.get(h) ?? []).some((e) => !c0.piecesAt({ kind: 'edge', id: e }).length),
    )!;
    const edge = (c0.geometry.hexEdges.get(spot) ?? []).find(
      (e) => !c0.piecesAt({ kind: 'edge', id: e }).length,
    )!;
    s = edit(s, (c) => {
      for (const p of c.piecesOf(victim, 'ship')) c.remove(p);
      c.place('ship', victim, { kind: 'edge', id: edge }, { cargo: [], used: 0 });
      c.player(victim).hand = { [GOLD]: 3 };
    });
    s = act(s, { type: 'movePirate', player: me, hex: spot });
    expect(s.phase.id).toBe('main');
    // No resources: the pirate takes a gold.
    expect(s.players[victim]!.hand[GOLD]).toBe(2);
    expect(pirateShip(ctxOf(s))?.at).toEqual({ kind: 'hex', id: spot });

    // Sailing onto an edge beside the pirate costs a gold.
    s = edit(s, (c) => {
      const mine = c.piecesOf(me, 'ship')[0]!;
      const near = (c.geometry.hexEdges.get(spot) ?? []).find((e) => e !== edge)!;
      const before = [...(c.geometry.edgeCorners.get(near) ?? [])]
        .flatMap((x) => c.geometry.cornerEdges.get(x) ?? [])
        .find(
          (e) =>
            !(c.geometry.hexEdges.get(spot) ?? []).includes(e) &&
            (c.geometry.edgeHexes.get(e) ?? []).some((h) => c.isSea(h)) &&
            !c.piecesAt({ kind: 'edge', id: e }).length,
        )!;
      c.move(mine, { kind: 'edge', id: before });
      mine.props.used = 0;
      c.player(me).hand[GOLD] = 5;
    });
    const ship = ctxOf(s).piecesOf(me, 'ship')[0]!;
    const plan = sailPlan(ctxOf(s), ship);
    const taxed = [...plan].find(([, o]) => o.tribute > 0);
    expect(taxed).toBeDefined();
    s = act(s, { type: 'sailShip', player: me, ship: ship.id, to: taxed![0] });
    expect(s.players[me]!.hand[GOLD]).toBe(4);
    // A ship that has moved can't chase the pirate.
    expect(lib.check(s, { type: 'chasePirate', player: me, ship: ship.id })).not.toBe(null);
  });
});

describe('Pirate Lairs bots', () => {
  it('play to a winner', () => {
    const players = 3;
    let s = game(players, 'bot-lairs', 'pirate-lairs');
    const bot: BotConfig = { level: 'medium', style: 'balanced' };
    const rand = rng(7);
    const memory: BotMemory[] = Array.from({ length: players }, () => newMemory());
    let clock = 0;
    for (let i = 0; i < 6000 && s.winner === null; i++) {
      clock += 1000;
      const waiting = lib.waitingOn(s);
      expect(waiting.length).toBeGreaterThan(0);
      let acted = false;
      for (const seat of waiting) {
        const a = chooseAction(lib, s, seat, bot, memory[seat]!, { rand, now: clock });
        if (!a) continue;
        s = act(s, a);
        acted = true;
        break;
      }
      if (!acted) clock += 20_000;
    }
    expect(s.winner).not.toBe(null);
  }, 180_000);
});

describe('Fishing Grounds and Spice Islands', () => {
  const play = (scenario: string, players = 3, seed = 'goods') =>
    toMain(finishSetup(game(players, seed, scenario)));

  /** Turns over a hex and its neighbours and puts one of our empty ships beside it. */
  function beside(s: GameState, seat: number, hex: HexId, cargo: string[] = []) {
    let ship = '';
    s = edit(s, (c) => {
      delete c.state.hexes[hex]!.hidden;
      for (const n of c.geometry.hexNeighbours.get(hex) ?? []) delete c.state.hexes[n]!.hidden;
      const edge = (c.geometry.hexEdges.get(hex) ?? []).find(
        (e) =>
          !c.piecesAt({ kind: 'edge', id: e }).length &&
          (c.geometry.edgeHexes.get(e) ?? []).some((h) => c.isSea(h)),
      )!;
      for (const p of c.piecesOf(seat, 'ship')) c.remove(p);
      ship = c.place('ship', seat, { kind: 'edge', id: edge }, { cargo, used: 0 }).id;
    });
    return { s, ship };
  }

  it('hide fishing grounds and spice villages in the fog', () => {
    for (const players of [2, 3, 4]) {
      const fish = game(players, `f${players}`, 'fishing-grounds');
      const shoals = Object.values(fish.hexes).filter((h) => h.type === 'shoal');
      expect(shoals).toHaveLength(players + 2);
      expect(shoals.every((h) => h.hidden && h.token && h.token !== 6 && h.token !== 8)).toBe(true);
      expect(ctxOf(fish).vpTarget()).toBe(10);
      expect(pirateShip(ctxOf(fish))).toBeUndefined();

      const spice = game(players, `s${players}`, 'spice-islands');
      const villages = Object.values(spice.hexes).filter((h) => h.props?.village);
      expect(villages).toHaveLength(players + 1);
      expect(villages.every((h) => h.hidden && h.type !== 'sea')).toBe(true);

      const full = game(players, `v${players}`, 'full-voyage');
      const kinds = Object.values(full.hexes);
      expect(kinds.filter((h) => h.type === 'gold')).toHaveLength(players + 1);
      expect(kinds.filter((h) => h.type === 'shoal')).toHaveLength(players + 1);
      expect(kinds.filter((h) => h.props?.village)).toHaveLength(players + 1);
      expect(ctxOf(full).vpTarget()).toBe(13);
    }
  });

  it('put a fish aboard each ship beside a fishing ground when its number is rolled', () => {
    let s = play('fishing-grounds');
    const me = s.turn.player;
    const shoal = Object.values(s.hexes).find((h) => h.type === 'shoal')!;
    const at = beside(s, me, shoal.id, ['fish']);
    s = at.s;
    s = edit(s, (c) => {
      expect(catchFish(c, shoal.token! === 3 ? 4 : 3)).toEqual({});
      expect(catchFish(c, shoal.token!)).toEqual({ [me]: 1 });
      // A full hold takes no more.
      expect(catchFish(c, shoal.token!)).toEqual({});
    });
    expect(cargoOf(s.pieces[at.ship]!)).toEqual(['fish', 'fish']);
  });

  it('turn every 2 fish or spice brought home into a point', () => {
    let s = play('fishing-grounds');
    const me = s.turn.player;
    const harbor = Object.values(s.pieces).find((p) => p.type === 'harbor' && p.owner === me)!;
    const ship = shipOf(s, me);
    // The setup ship sits beside the harbor; fill it with fish.
    s = edit(s, (c) => {
      const p = c.state.pieces[ship.id]!;
      p.props.cargo = ['fish', 'fish'];
      c.state.pieces[harbor.id]!.props.cargo = ['settler'];
    });
    expect(lib.check(s, { type: 'swapCargo', player: me, ship: ship.id })).toMatch(/Deliver/);
    const vp = ctxOf(s).vp(me);
    s = act(s, { type: 'deliverGoods', player: me, ship: ship.id });
    const c = ctxOf(s);
    expect(cargoOf(s.pieces[ship.id]!)).toEqual([]);
    expect(missionSteps(c, me, 'fish')).toBe(1);
    expect(c.vp(me)).toBe(vp + 1);
    // One sack of spice is half a step.
    s = edit(s, (x) => {
      x.state.pieces[ship.id]!.props.cargo = ['spice'];
    });
    s = act(s, { type: 'deliverGoods', player: me, ship: ship.id });
    expect(missionSteps(ctxOf(s), me, 'spices')).toBe(0);
    expect(epData(ctxOf(s)).delivered[me]).toEqual({ fish: 2, spice: 1 });
  });

  it('sell spice for 2 gold to a ship beside a village', () => {
    let s = play('spice-islands');
    const me = s.turn.player;
    const village = Object.values(s.hexes).find((h) => h.props?.village)!;
    const hidden = beside(s, me, village.id);
    // Still in the fog: nothing to buy.
    s = edit(hidden.s, (c) => {
      c.state.hexes[village.id]!.hidden = true;
      c.player(me).hand[GOLD] = 5;
    });
    expect(lib.check(s, { type: 'buySpice', player: me, ship: hidden.ship })).toMatch(/village/);
    s = edit(s, (c) => {
      delete c.state.hexes[village.id]!.hidden;
    });
    s = act(s, { type: 'buySpice', player: me, ship: hidden.ship });
    s = act(s, { type: 'buySpice', player: me, ship: hidden.ship });
    expect(cargoOf(s.pieces[hidden.ship]!)).toEqual(['spice', 'spice']);
    expect(s.players[me]!.hand[GOLD]).toBe(1);
    expect(lib.check(s, { type: 'buySpice', player: me, ship: hidden.ship })).not.toBe(null);
  });

  for (const scenario of ['fishing-grounds', 'spice-islands']) {
    it(`bots play ${scenario} to a winner and bring goods home`, () => {
      const players = 3;
      let s = game(players, `bot-${scenario}`, scenario);
      const bot: BotConfig = { level: 'medium', style: 'balanced' };
      const rand = rng(11);
      const memory: BotMemory[] = Array.from({ length: players }, () => newMemory());
      let clock = 0;
      for (let i = 0; i < 6000 && s.winner === null; i++) {
        clock += 1000;
        const waiting = lib.waitingOn(s);
        expect(waiting.length).toBeGreaterThan(0);
        let acted = false;
        for (const seat of waiting) {
          const a = chooseAction(lib, s, seat, bot, memory[seat]!, { rand, now: clock });
          if (!a) continue;
          s = act(s, a);
          acted = true;
          break;
        }
        if (!acted) clock += 20_000;
      }
      expect(s.winner).not.toBe(null);
      const d = epData(ctxOf(s));
      const brought = Object.values(d.delivered).reduce(
        (n, x) => n + (x.fish ?? 0) + (x.spice ?? 0),
        0,
      );
      expect(brought).toBeGreaterThan(0);
    }, 180_000);
  }
});
