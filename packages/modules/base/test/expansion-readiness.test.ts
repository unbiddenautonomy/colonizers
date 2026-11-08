/**
 * Acceptance test for the engine core (PLAN.md section 4.1): every thing
 * Seafarers and Cities & Knights need from the core is exercised here by small
 * stand-in modules that only use the core's extension points. If one of these
 * needs a core change, the core design is wrong. See docs/EXPANSION-REQUIREMENTS.md.
 */
import { describe, expect, it } from 'vitest';
import {
  connectedRegions,
  Ctx,
  ModuleLibrary,
  type Action,
  type ActionDef,
  type CornerId,
  type EdgeId,
  type GameModule,
  type GameState,
  type HexId,
  type MapSpec,
} from '@colonizers/engine';
import { baseModule, connectsAt, ring, spiral } from '../src/index.ts';
import { canPlaceSettlement } from '../src/rules.ts';

// ---------- A stand-in Seafarers module ----------

const seaLike: GameModule = {
  id: 'sea-like',
  name: 'Seafarers stand-in',
  requires: ['base'],
  settings: { vpTarget: 12 },
  hexTypes: { gold: { terrain: 'land' } },
  pieceTypes: {
    ship: { on: 'edge', perPlayer: () => 15, route: 'sea' },
    pirate: { on: 'hex' },
  },
  costs: { ship: { lumber: 1, wool: 1 } },
  actions: {
    buildShip: {
      phases: ['main'],
      check(ctx, a) {
        const edge = a.edge as EdgeId;
        if (!ctx.isSeaEdge(edge)) return 'Ships go next to sea';
        if (ctx.piecesAt({ kind: 'edge', id: edge }).length) return 'Taken';
        const corners = ctx.geometry.edgeCorners.get(edge) ?? [];
        if (!corners.some((c) => connectsAt(ctx, a.player, c, 'sea'))) return 'Not connected';
        return ctx.has(a.player, ctx.cost('ship', a.player)) ? null : 'Can not afford';
      },
      apply(ctx, a) {
        ctx.pay(a.player, ctx.cost('ship', a.player));
        ctx.place('ship', a.player, { kind: 'edge', id: a.edge as EdgeId });
      },
    },
    moveShip: {
      phases: ['main'],
      check(ctx, a) {
        const ship = ctx.state.pieces[a.ship as string];
        if (!ship || ship.owner !== a.player || ship.type !== 'ship') return 'Not your ship';
        if (ship.placedTurn === ctx.state.turn.number) return 'Built this turn';
        return ctx.isSeaEdge(a.to as EdgeId) ? null : 'Ships go next to sea';
      },
      apply(ctx, a) {
        ctx.move(ctx.state.pieces[a.ship as string]!, { kind: 'edge', id: a.to as EdgeId });
      },
    },
    pickGold: {
      phases: ['pickGold'],
      check(ctx, a) {
        const owed = (ctx.state.phase.owed as Record<number, number>)[a.player];
        return owed ? null : 'Nothing to pick';
      },
      apply(ctx, a) {
        const owed = { ...(ctx.state.phase.owed as Record<number, number>) };
        ctx.grant(a.player, { [a.card as string]: owed[a.player]! });
        delete owed[a.player];
        if (Object.keys(owed).length) ctx.setPhase({ ...ctx.state.phase, owed });
        else ctx.setPhase({ id: 'main' });
      },
    },
  },
  wrapActions: {
    roll: (prev): ActionDef => ({
      ...prev,
      apply(ctx, a) {
        ctx.data<{ goldOwed: Record<number, number> }>('sea-like').goldOwed = {};
        prev.apply(ctx, a);
        const owed = ctx.data<{ goldOwed: Record<number, number> }>('sea-like').goldOwed;
        if (Object.keys(owed).length && ctx.state.phase.id === 'main')
          ctx.setPhase({ id: 'pickGold', owed });
      },
    }),
  },
  hooks: {
    piecePlaced(ctx, piece) {
      // Fog of war: a ship reveals the hexes next to it.
      if (piece.type !== 'ship' || piece.at.kind !== 'edge') return;
      for (const h of ctx.geometry.edgeHexes.get(piece.at.id) ?? []) {
        const hex = ctx.state.hexes[h]!;
        if (hex.hidden) {
          delete hex.hidden;
          ctx.emit({ type: 'revealed', hex: h, terrain: hex.type });
          ctx.hook('hexChanged', hex);
        }
      }
    },
  },
  reducers: {
    hexYield(ctx, hex, piece, value) {
      if (hex.type !== 'gold' || piece.owner === null) return value;
      const owed = ctx.data<{ goldOwed: Record<number, number> }>('sea-like').goldOwed;
      owed[piece.owner] =
        (owed[piece.owner] ?? 0) + (ctx.registry.pieceTypes[piece.type]?.production ?? 0);
      return {};
    },
    vp(ctx, seat, value) {
      // Island bonus: +2 for each island beyond the first with your settlement.
      const islands = connectedRegions(ctx.geometry, (h) => ctx.isLand(h));
      const mine = islands.filter((isle) =>
        isle.some((h) =>
          (ctx.geometry.hexCorners.get(h) ?? []).some((c) => ctx.buildingAt(c)?.owner === seat),
        ),
      );
      return value + Math.max(0, mine.length - 1) * 2;
    },
  },
};

// ---------- A stand-in Cities & Knights module ----------

const ckLike: GameModule = {
  id: 'ck-like',
  name: 'Cities & Knights stand-in',
  requires: ['base'],
  settings: { vpTarget: 13 },
  cardTypes: {
    paper: { category: 'commodity', countsForHandLimit: true, bank: () => 12 },
    cloth: { category: 'commodity', countsForHandLimit: true, bank: () => 12 },
    coin: { category: 'commodity', countsForHandLimit: true, bank: () => 12 },
  },
  decks: {
    science: { cards: () => ({ alchemist: 2, inventor: 2 }) },
    trade: { cards: () => ({ merchant: 6 }) },
    politics: { cards: () => ({ spy: 3 }) },
  },
  pieceTypes: {
    knight: { on: 'corner', perPlayer: () => 6 },
    wall: { on: 'corner', perPlayer: () => 3 },
  },
  dice(ctx) {
    const red = ctx.rng.int(1, 6);
    const yellow = ctx.rng.int(1, 6);
    const faces = ['ship', 'ship', 'ship', 'science', 'trade', 'politics'];
    const event = faces[ctx.rng.int(0, 5)]!;
    return { dice: { red, yellow, event }, total: red + yellow };
  },
  actions: {
    placeKnight: {
      phases: ['main'],
      check(ctx, a) {
        return ctx.piecesAt({ kind: 'corner', id: a.corner as CornerId }).length ? 'Taken' : null;
      },
      apply(ctx, a) {
        ctx.place(
          'knight',
          a.player,
          { kind: 'corner', id: a.corner as CornerId },
          { level: 1, active: false },
        );
      },
    },
    activateKnight: {
      phases: ['main'],
      check(ctx, a) {
        const k = ctx.state.pieces[a.knight as string];
        return k && k.owner === a.player && !k.props.active ? null : 'No inactive knight there';
      },
      apply(ctx, a) {
        ctx.pay(a.player, { grain: 1 });
        ctx.state.pieces[a.knight as string]!.props.active = true;
      },
    },
  },
  wrapActions: {
    roll: (prev): ActionDef => ({
      ...prev,
      apply(ctx, a) {
        prev.apply(ctx, a);
        const data = ctx.data<{ barbarians: number; attacked: boolean }>('ck-like');
        const rolled = ctx.events.find((e) => e.type === 'rolled') as {
          dice: { event: string; red: number };
        };
        if (rolled.dice.event === 'ship') data.barbarians = (data.barbarians ?? 0) + 1;
        else {
          // Progress cards drawn by the event die and the red die.
          const deck = rolled.dice.event;
          const level = (ctx.player(a.player).data[`improve_${deck}`] as number | undefined) ?? 0;
          if (level >= rolled.dice.red - 1) {
            const card = ctx.drawCard(deck);
            if (card)
              (ctx.player(a.player).held[deck] ??= []).push({
                card,
                acquiredTurn: ctx.state.turn.number,
              });
          }
        }
        // The robber stays inactive until the first barbarian attack.
        if (!data.attacked && ctx.state.phase.id === 'moveRobber') ctx.setPhase({ id: 'main' });
      },
    }),
  },
  reducers: {
    hexYield(ctx, hex, piece, value) {
      const commodity: Record<string, string> = {
        forest: 'paper',
        pasture: 'cloth',
        mountains: 'coin',
      };
      const c = commodity[hex.type];
      const res = ctx.registry.hexTypes[hex.type]?.produces;
      if (piece.type === 'city' && c && res) return { [res]: 1, [c]: 1 };
      return value;
    },
    handLimit(ctx, seat, value) {
      return value + 2 * ctx.piecesOf(seat, 'wall').length;
    },
    cost(_ctx, item, _seat, value) {
      return value;
    },
  },
};

// ---------- 5–6 players: Special Building Phase ----------

const sbpLike: GameModule = {
  id: 'sbp-like',
  name: 'Special Building Phase stand-in',
  requires: ['base'],
  wrapActions: {
    endTurn: (prev): ActionDef => ({
      ...prev,
      apply(ctx, a) {
        const next = (ctx.active + 1) % ctx.playerCount;
        ctx.setPhase({ id: 'specialBuild', queue: [next, (next + 1) % ctx.playerCount], after: a });
      },
    }),
  },
  actions: {
    passSpecialBuild: {
      phases: ['specialBuild'],
      check(ctx, a) {
        return (ctx.state.phase.queue as number[])[0] === a.player
          ? null
          : 'Not your special build';
      },
      apply(ctx, a) {
        const queue = (ctx.state.phase.queue as number[]).slice(1);
        const after = ctx.state.phase.after as Action;
        if (queue.length) ctx.setPhase({ ...ctx.state.phase, queue });
        else {
          // Hand over to the base game's end of turn.
          ctx.setPhase({ id: 'main' });
          baseModule.actions!.endTurn!.apply(ctx, after ?? a);
        }
      },
    },
  },
};

const lib = new ModuleLibrary([baseModule, seaLike, ckLike, sbpLike]);

/** Two islands: the 7-hex main island and a 1-hex gold island, in a sea. */
function archipelago(hidden = false): MapSpec {
  const hexes: MapSpec['hexes'] = [];
  const terrains = ['forest', 'hills', 'pasture', 'fields', 'mountains', 'forest', 'pasture'];
  spiral(1).forEach((c, i) =>
    hexes.push({ q: c.q, r: c.r, type: terrains[i]!, token: 6 + (i % 2) * 2 }),
  );
  for (const c of ring(2)) {
    if (c.q === 2 && c.r === -2) continue;
    hexes.push({ q: c.q, r: c.r, type: 'sea' });
  }
  hexes.push({ q: 2, r: -2, type: 'sea' });
  for (const c of ring(3))
    hexes.push({
      q: c.q,
      r: c.r,
      type: c.q === 3 && c.r === -3 ? 'gold' : 'sea',
      token: 8,
      ...(hidden && c.q === 3 && c.r === -3 && { hidden: true }),
    });
  return { hexes, pieces: [{ type: 'robber', at: { kind: 'hex', id: 'h:0,0' } }] };
}

function game(modules: string[], map = archipelago()): GameState {
  if (!modules.includes('sea-like')) {
    map = {
      ...map,
      hexes: map.hexes.map((h) => (h.type === 'gold' ? { ...h, type: 'mountains' } : h)),
    };
  }
  return lib.createGame({ seed: 'exp', players: ['A', 'B', 'C'], modules, map, fixedSeats: true })
    .state;
}

function ctxOf(state: GameState): Ctx {
  return new Ctx(state, lib.registry(state.modules));
}

function edit(state: GameState, fn: (ctx: Ctx) => void): GameState {
  const next = structuredClone(state);
  const ctx = ctxOf(next);
  fn(ctx);
  ctx.commit();
  return next;
}

function mainPhase(state: GameState): GameState {
  return edit(state, (c) => {
    c.state.turn = { number: 3, player: 0, round: 1 };
    c.setPhase({ id: 'main' });
  });
}

const coastCorner = (ctx: Ctx): CornerId =>
  ctx.geometry.corners.find((c) => {
    const hs = ctx.geometry.cornerHexes.get(c) ?? [];
    return (
      hs.length === 3 &&
      hs.filter((h) => ctx.isLand(h)).length === 1 &&
      hs.some((h) => h === 'h:1,-1')
    );
  })!;

describe('core supports Seafarers', () => {
  it('ships are a second kind of edge piece that only goes next to sea', () => {
    let s = mainPhase(game(['sea-like']));
    const ctx = ctxOf(s);
    const corner = coastCorner(ctx);
    s = edit(s, (c) => {
      c.place('settlement', 0, { kind: 'corner', id: corner });
      c.grant(0, { lumber: 3, wool: 3 });
    });
    const seaEdge = ctx.geometry.cornerEdges.get(corner)!.find((e) => ctx.isSeaEdge(e))!;
    const landOnly = ctx.geometry.edges.find((e) => ctx.isLandEdge(e) && !ctx.isSeaEdge(e))!;
    expect(lib.check(s, { type: 'buildShip', player: 0, edge: landOnly })).toMatch(/next to sea/);
    s = lib.apply(s, { type: 'buildShip', player: 0, edge: seaEdge }).state;
    expect(ctxOf(s).piecesOf(0, 'ship')).toHaveLength(1);
  });

  it('roads and ships join into one trade route only through your own settlement', () => {
    const s = mainPhase(game(['sea-like']));
    const ctx = ctxOf(s);
    const corner = coastCorner(ctx);
    const roadEdge =
      ctx.geometry.cornerEdges.get(corner)!.find((e) => ctx.isLandEdge(e) && !ctx.isSeaEdge(e)) ??
      ctx.geometry.cornerEdges.get(corner)!.find((e) => ctx.isLandEdge(e))!;
    const shipEdge = ctx.geometry.cornerEdges
      .get(corner)!
      .find((e) => e !== roadEdge && ctx.isSeaEdge(e))!;
    const noBuilding = edit(s, (c) => {
      c.place('road', 0, { kind: 'edge', id: roadEdge });
      c.place('ship', 0, { kind: 'edge', id: shipEdge });
    });
    expect(ctxOf(noBuilding).longestRoute(0)).toBe(1);
    const withBuilding = edit(noBuilding, (c) =>
      c.place('settlement', 0, { kind: 'corner', id: corner }),
    );
    expect(ctxOf(withBuilding).longestRoute(0)).toBe(2);
    void s;
  });

  it('pieces can move (ships), but not the turn they were built', () => {
    let s = mainPhase(game(['sea-like']));
    const ctx = ctxOf(s);
    const [e1, e2] = ctx.geometry.edges.filter((e) => ctx.isSeaEdge(e) && !ctx.isLandEdge(e));
    s = edit(s, (c) => c.place('ship', 0, { kind: 'edge', id: e1! }));
    const ship = Object.values(s.pieces).find((p) => p.type === 'ship')!;
    expect(lib.check(s, { type: 'moveShip', player: 0, ship: ship.id, to: e2 })).toMatch(
      /this turn/,
    );
    s = edit(s, (c) => (c.state.turn.number += 1));
    s = lib.apply(s, { type: 'moveShip', player: 0, ship: ship.id, to: e2 }).state;
    expect(s.pieces[ship.id]!.at).toEqual({ kind: 'edge', id: e2 });
  });

  it('hidden hexes are redacted for players and revealed by exploring', () => {
    let s = mainPhase(game(['sea-like'], archipelago(true)));
    const goldId = 'h:3,-3' as HexId;
    expect(lib.view(s, 0).hexes[goldId]).toMatchObject({ type: 'hidden', hidden: true });
    expect(lib.view(s, 0).hexes[goldId]!.token).toBeUndefined();
    const ctx = ctxOf(s);
    const edge = ctx.geometry.hexEdges
      .get(goldId)!
      .find((e) => (ctx.geometry.edgeHexes.get(e) ?? []).length === 2)!;
    s = edit(s, (c) => c.place('ship', 0, { kind: 'edge', id: edge }));
    expect(s.hexes[goldId]!.hidden).toBeUndefined();
    expect(lib.view(s, 1).hexes[goldId]!.type).toBe('gold');
  });

  it('gold fields make players choose their resource during production', () => {
    let s = mainPhase(game(['sea-like']));
    const ctx = ctxOf(s);
    const goldCorner = ctx.geometry.hexCorners.get('h:3,-3')![3]!;
    s = edit(s, (c) => {
      for (const h of Object.values(c.state.hexes)) if (h.type !== 'gold') delete h.token;
      c.place('city', 1, { kind: 'corner', id: goldCorner });
      c.setPhase({ id: 'roll' });
    });
    let rolled = false;
    for (let i = 0; i < 300 && !rolled; i++) {
      const t = edit(s, (c) => {
        for (let k = 0; k < i; k++) c.rng.nextUint32();
      });
      const r = lib.apply(t, { type: 'roll', player: 0 });
      if ((r.events.find((e) => e.type === 'rolled') as { total: number }).total === 8) {
        expect(r.state.phase).toMatchObject({ id: 'pickGold', owed: { 1: 2 } });
        const after = lib.apply(r.state, { type: 'pickGold', player: 1, card: 'ore' }).state;
        expect(after.players[1]!.hand.ore).toBe(2);
        expect(after.phase.id).toBe('main');
        rolled = true;
      }
    }
    expect(rolled).toBe(true);
  });

  it('the pirate is a second hex occupant next to the robber', () => {
    let s = game(['sea-like']);
    s = edit(s, (c) => c.place('pirate', null, { kind: 'hex', id: 'h:2,-2' }));
    const ctx = ctxOf(s);
    expect(ctx.piecesOfType('robber')).toHaveLength(1);
    expect(ctx.piecesOfType('pirate')[0]!.at).toEqual({ kind: 'hex', id: 'h:2,-2' });
  });

  it('islands are found from the board, for island bonuses, and the VP target changes', () => {
    let s = game(['sea-like']);
    const ctx = ctxOf(s);
    expect(connectedRegions(ctx.geometry, (h) => ctx.isLand(h))).toHaveLength(2);
    const main = ctx.geometry.hexCorners.get('h:0,0')![0]!;
    const isle = ctx.geometry.hexCorners.get('h:3,-3')![3]!;
    s = edit(s, (c) => {
      c.place('settlement', 0, { kind: 'corner', id: main });
      c.place('settlement', 0, { kind: 'corner', id: isle });
    });
    expect(ctxOf(s).vp(0)).toBe(2 + 2);
    expect(ctxOf(s).vpTarget()).toBe(12);
  });
});

describe('core supports Cities & Knights', () => {
  it('cities on forest, pasture and mountains make commodities', () => {
    let s = mainPhase(game(['ck-like']));
    const corner = ctxOf(s).geometry.hexCorners.get('h:0,0')![0]!;
    s = edit(s, (c) => {
      c.state.hexes['h:0,0' as HexId]!.type = 'forest';
      c.place('city', 0, { kind: 'corner', id: corner });
    });
    const ctx = ctxOf(s);
    const got = ctx.reduce('hexYield', s.hexes['h:0,0' as HexId]!, ctx.buildingAt(corner)!, {
      lumber: 2,
    });
    expect(got).toEqual({ lumber: 1, paper: 1 });
    expect(ctx.registry.cardTypes.paper?.countsForHandLimit).toBe(true);
  });

  it('a module can replace the dice with red, yellow and event dice', () => {
    const s = edit(game(['ck-like']), (c) => {
      c.state.turn = { number: 3, player: 0, round: 1 };
      c.setPhase({ id: 'roll' });
    });
    const { events } = lib.apply(s, { type: 'roll', player: 0 });
    const rolled = events.find((e) => e.type === 'rolled') as {
      dice: Record<string, unknown>;
      total: number;
    };
    expect(Object.keys(rolled.dice).sort()).toEqual(['event', 'red', 'yellow']);
    expect(rolled.total).toBe((rolled.dice.red as number) + (rolled.dice.yellow as number));
    void s;
  });

  it('three progress decks exist and the event die drives a global barbarian track', () => {
    const s0 = edit(game(['ck-like']), (c) => {
      c.state.turn = { number: 3, player: 0, round: 1 };
      c.setPhase({ id: 'roll' });
      c.player(0).data.improve_science = 5;
      c.player(0).data.improve_trade = 5;
      c.player(0).data.improve_politics = 5;
    });
    expect(Object.keys(s0.decks).sort()).toEqual(['dev', 'politics', 'science', 'trade']);
    let ships = 0;
    let drawn = 0;
    for (let i = 0; i < 60; i++) {
      const t = edit(s0, (c) => {
        for (let k = 0; k < i; k++) c.rng.nextUint32();
      });
      const after = lib.apply(t, { type: 'roll', player: 0 }).state;
      ships += (after.data['ck-like']?.barbarians as number | undefined) ?? 0;
      drawn += Object.values(after.players[0]!.held).reduce((n, cs) => n + cs.length, 0);
    }
    expect(ships).toBeGreaterThan(0);
    expect(drawn).toBeGreaterThan(0);
  });

  it('pieces have levels and an active state, and knights block settlements but not the distance rule', () => {
    let s = mainPhase(game(['ck-like']));
    const corner = ctxOf(s).geometry.hexCorners.get('h:0,0')![0]!;
    s = lib.apply(s, { type: 'placeKnight', player: 0, corner }).state;
    const knight = Object.values(s.pieces).find((p) => p.type === 'knight')!;
    expect(knight.props).toEqual({ level: 1, active: false });
    s = edit(s, (c) => c.grant(0, { grain: 1 }));
    s = lib.apply(s, { type: 'activateKnight', player: 0, knight: knight.id }).state;
    expect(s.pieces[knight.id]!.props.active).toBe(true);
    const ctx = ctxOf(s);
    expect(ctx.buildingAt(corner)).toBeUndefined();
    const neighbour = ctx.geometry.cornerNeighbours.get(corner)![0]!;
    expect(canPlaceSettlement(ctx, 0, corner, false)).toMatch(/taken/);
    expect(canPlaceSettlement(ctx, 0, neighbour, false)).toBeNull();
  });

  it('city walls raise the hand limit', () => {
    let s = mainPhase(game(['ck-like']));
    const corner = ctxOf(s).geometry.hexCorners.get('h:0,0')![0]!;
    s = edit(s, (c) => c.place('wall', 0, { kind: 'corner', id: corner }));
    expect(ctxOf(s).reduce('handLimit', 0, 7)).toBe(9);
    expect(ctxOf(s).reduce('handLimit', 1, 7)).toBe(7);
  });

  it('the robber can start inactive, and the VP target is 13', () => {
    const s = edit(game(['ck-like']), (c) => {
      c.state.turn = { number: 3, player: 0, round: 1 };
      c.setPhase({ id: 'roll' });
    });
    for (let i = 0; i < 200; i++) {
      const t = edit(s, (c) => {
        for (let k = 0; k < i; k++) c.rng.nextUint32();
      });
      const r = lib.apply(t, { type: 'roll', player: 0 });
      if ((r.events.find((e) => e.type === 'rolled') as { total: number }).total === 7) {
        expect(r.state.phase.id).toBe('main');
        break;
      }
    }
    expect(ctxOf(s).vpTarget()).toBe(13);
  });
});

describe('core supports combinations and new phases', () => {
  it('Seafarers and Cities & Knights load together', () => {
    const s = game(['sea-like', 'ck-like']);
    expect(s.modules).toEqual(['base', 'sea-like', 'ck-like']);
    const reg = lib.registry(s.modules);
    expect(reg.pieceTypes.ship && reg.pieceTypes.knight).toBeTruthy();
    // Both wrap the roll; each wrapper calls through to the one before it.
    let t = edit(s, (c) => {
      c.state.turn = { number: 3, player: 0, round: 1 };
      c.setPhase({ id: 'roll' });
    });
    t = lib.apply(t, { type: 'roll', player: 0 }).state;
    expect(['main', 'pickGold', 'discard']).toContain(t.phase.id);
  });

  it('a module can add a phase between turns (Special Building Phase)', () => {
    let s = mainPhase(game(['sbp-like']));
    s = lib.apply(s, { type: 'endTurn', player: 0 }).state;
    expect(s.phase).toMatchObject({ id: 'specialBuild', queue: [1, 2] });
    s = lib.apply(s, { type: 'passSpecialBuild', player: 1 }).state;
    s = lib.apply(s, { type: 'passSpecialBuild', player: 2 }).state;
    expect(s.phase.id).toBe('roll');
    expect(s.turn.player).toBe(1);
  });

  it('rejects unknown and conflicting modules', () => {
    const conflicting: GameModule = {
      id: 'x',
      name: 'X',
      requires: ['base'],
      conflicts: ['sea-like'],
    };
    const l = new ModuleLibrary([baseModule, seaLike, conflicting]);
    expect(() => l.registry(['x', 'sea-like'])).toThrow(/can't be combined/);
    expect(() => l.registry(['nope'])).toThrow(/Unknown module/);
    const dup: GameModule = {
      id: 'y',
      name: 'Y',
      requires: ['base'],
      pieceTypes: { road: { on: 'edge' } },
    };
    expect(() => new ModuleLibrary([baseModule, dup]).registry(['y'])).toThrow(/redefines/);
  });
});
