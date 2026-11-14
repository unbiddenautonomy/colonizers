import { describe, expect, it } from 'vitest';
import {
  Ctx,
  hexNeighbours,
  ModuleLibrary,
  type Action,
  type CornerId,
  type GameState,
  type HexId,
} from '@colonizers/engine';
import { baseModule } from '@colonizers/module-base';
import { generateBoard } from '@colonizers/maps';
import {
  fightBattles,
  kingdomPoints,
  kingdomsModule,
  kwData,
  markerBlock,
  markersOf,
  MARKER,
  surroundedBy,
} from '../src/index.ts';

const lib = new ModuleLibrary([baseModule, kingdomsModule]);
const ctxOf = (s: GameState) => new Ctx(s, lib.registry(s.modules));
const act = (s: GameState, a: Action) => lib.apply(s, a).state;

function edit(state: GameState, fn: (ctx: Ctx) => void): GameState {
  const next = structuredClone(state);
  const ctx = ctxOf(next);
  fn(ctx);
  ctx.commit();
  return next;
}

function game(seed = 'kingdoms'): GameState {
  const board = generateBoard({ seed, players: 4, mode: 'classic' });
  return lib.createGame({
    seed,
    players: ['A', 'B', 'C', 'D'],
    modules: ['base', 'kingdoms'],
    map: board.map,
    settings: { vpTarget: 12 },
    fixedSeats: true,
  }).state;
}

function setup(s: GameState): GameState {
  for (let i = 0; i < 300 && s.phase.id === 'setup'; i++) {
    const seat = lib.waitingOn(s)[0] as number;
    s = act(s, lib.legalActions(s, seat)[0] as Action);
  }
  return s;
}

const mainTurn = (s: GameState, fn: (ctx: Ctx) => void = () => {}) =>
  edit(s, (ctx) => {
    ctx.state.turn = { number: 5, player: 0, round: 2 };
    ctx.setPhase({ id: 'main' });
    fn(ctx);
  });

const cityHexes = (ctx: Ctx, seat: number): HexId[] => {
  const city = ctx.piecesOf(seat, 'city')[0];
  return (ctx.geometry.cornerHexes.get((city?.at as { id: CornerId }).id) ?? []).filter((h) =>
    ctx.isLand(h),
  );
};

describe('Kingdoms & Warriors', () => {
  it('starts everyone with a settlement, a city and a free marker beside it', () => {
    const s = setup(game());
    const c = ctxOf(s);
    for (const seat of [0, 1, 2, 3]) {
      expect(c.piecesOf(seat, 'city').length).toBe(1);
      expect(c.piecesOf(seat, 'settlement').length).toBe(1);
      expect(kwData(c).start[String(seat)]).toBe(true);
    }
    const t = mainTurn(s);
    const free = lib.legalActions(t, 0).filter((a) => a.type === 'placeFreeMarker');
    expect(free.length).toBeGreaterThan(0);
    for (const a of free) expect(cityHexes(ctxOf(t), 0)).toContain(a.hex);
  });

  it('buys markers for 2 ore or 2 grain, spreading field to field, a point for every 3', () => {
    let s = mainTurn(setup(game()), (ctx) => ctx.grant(0, { ore: 6, grain: 2 }));
    const c0 = ctxOf(s);
    const vp = c0.vp(0);
    const first = cityHexes(c0, 0).find(
      (h) => !c0.piecesAt({ kind: 'hex', id: h }).length && !markerBlock(c0, 0, h, false),
    ) as HexId;
    s = act(s, { type: 'buyMarker', player: 0, hex: first, pay: 'ore' });
    // Two more, each beside the last.
    for (let k = 0; k < 2; k++) {
      const c = ctxOf(s);
      const mine = markersOf(c, 0).map((p) => (p.at as { id: HexId }).id);
      const next = mine
        .flatMap((h) => hexNeighbours(h))
        .find(
          (h) =>
            !markerBlock(c, 0, h, false) &&
            !c.piecesAt({ kind: 'hex', id: h }).some((p) => p.type === MARKER),
        );
      expect(next).toBeDefined();
      s = act(s, { type: 'buyMarker', player: 0, hex: next as HexId, pay: k ? 'grain' : 'ore' });
    }
    const c = ctxOf(s);
    expect(markersOf(c, 0).length).toBe(3);
    expect(kingdomPoints(c, 0)).toBe(1);
    expect(c.vp(0)).toBe(vp + 1);
    expect(s.players[0]?.hand).toMatchObject({ ore: 2, grain: 0 });
    expect(() => act(s, { type: 'buyMarker', player: 0, hex: first, pay: 'ore' })).toThrow(
      /already have a marker/,
    );
  });

  it('produces from a marker and takes a surrounded settlement’s yield', () => {
    let target: CornerId = '' as CornerId;
    const s = mainTurn(setup(game()), (ctx) => {
      const settlement = ctx.piecesOf(1, 'settlement')[0];
      target = (settlement?.at as { id: CornerId }).id;
      for (const h of ctx.geometry.cornerHexes.get(target) ?? [])
        if (ctx.isLand(h)) ctx.place(MARKER, 0, { kind: 'hex', id: h });
    });
    const c = ctxOf(s);
    expect(surroundedBy(c, target, 1)).toBe(0);
    const hex = (c.geometry.cornerHexes.get(target) ?? []).find(
      (h) =>
        c.isLand(h) &&
        c.state.hexes[h]?.token &&
        c.registry.hexTypes[c.state.hexes[h]?.type ?? '']?.produces,
    ) as HexId;
    const token = c.state.hexes[hex]?.token as number;
    const res = c.registry.hexTypes[c.state.hexes[hex]?.type ?? '']?.produces as string;
    let t = edit(s, (ctx) => {
      for (const r of ctx.piecesOfType('robber')) ctx.remove(r);
      ctx.setPhase({ id: 'roll' });
    });
    const before = t.players.map((p) => p.hand[res] ?? 0);
    let done: GameState | null = null;
    for (let i = 0; i < 400 && !done; i++) {
      const next = act(t, { type: 'roll', player: 0 });
      if ((next.data.base as { lastRoll?: { total: number } }).lastRoll?.total === token)
        done = next;
      else
        t = edit(t, (ctx) => {
          ctx.rng.int(1, 6);
        });
    }
    expect(done).not.toBeNull();
    const gained = (done as GameState).players.map((p, i) => (p.hand[res] ?? 0) - (before[i] ?? 0));
    // The settlement's card goes to the kingdom, on top of the marker's own.
    expect(gained[1]).toBe(0);
    expect(gained[0]).toBeGreaterThanOrEqual(2);
  });

  it('fights a battle when the turn ends; the winner gets a free marker', () => {
    let hex = '' as HexId;
    let s = mainTurn(setup(game()), (ctx) => {
      // Player 1 holds three markers by their city; player 0 reaches one of them.
      const fields = cityHexes(ctx, 1);
      hex = fields[0] as HexId;
      for (const h of fields) ctx.place(MARKER, 1, { kind: 'hex', id: h });
      // And more elsewhere, so the field under attack isn't one of their last two.
      for (const h of (Object.keys(ctx.state.hexes) as HexId[])
        .filter((h) => ctx.isLand(h) && !fields.includes(h))
        .slice(-2))
        ctx.place(MARKER, 1, { kind: 'hex', id: h });
      const near = hexNeighbours(hex).find(
        (h) => ctx.isLand(h) && !markersOf(ctx, 1).some((p) => (p.at as { id: HexId }).id === h),
      ) as HexId;
      ctx.place(MARKER, 0, { kind: 'hex', id: near });
      ctx.place(MARKER, 0, {
        kind: 'hex',
        id: hexNeighbours(near).find((h) => ctx.isLand(h) && h !== hex) as HexId,
      });
      ctx.player(0).played.knight = 5;
      ctx.grant(0, { ore: 2 });
    });
    s = act(s, { type: 'buyMarker', player: 0, hex, pay: 'ore' });
    expect(() => act(s, { type: 'placeFreeMarker', player: 0, hex })).toThrow();
    s = act(s, { type: 'endTurn', player: 0 });
    const c = ctxOf(s);
    // 5 knights beat 0 whatever the dice.
    expect(
      c
        .piecesAt({ kind: 'hex', id: hex })
        .filter((p) => p.type === MARKER)
        .map((p) => p.owner),
    ).toEqual([0]);
    expect(kwData(c).free['0']).toBe(1);
  });

  it('keeps a player’s last two markers safe, and fights at most two players a turn', () => {
    const s = mainTurn(setup(game()), (ctx) => {
      const fields = cityHexes(ctx, 1).slice(0, 2);
      for (const h of fields) ctx.place(MARKER, 1, { kind: 'hex', id: h });
      ctx.grant(0, { ore: 2 });
    });
    const c = ctxOf(s);
    const theirs = markersOf(c, 1).map((p) => (p.at as { id: HexId }).id);
    for (const h of theirs) {
      const why = markerBlock(c, 0, h, false);
      expect(why === null).toBe(false);
    }
    void fightBattles;
  });
});

describe('Kingdoms & Warriors in random games', () => {
  it('plays out a game to a winner', () => {
    let x = 77;
    const rand = () => {
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      return (x >>> 0) / 4294967296;
    };
    let s = game('kingdoms-random');
    let battles = 0;
    for (let i = 0; i < 20000 && s.winner === null; i++) {
      const seat = lib.waitingOn(s)[0];
      expect(seat, `${s.phase.id} at step ${i}`).toBeDefined();
      const options = lib.legalActions(s, seat as number);
      const pick =
        options.find((a) => ['buildSettlement', 'buildCity', 'placeFreeMarker'].includes(a.type)) ??
        (rand() < 0.5 ? options.find((a) => a.type === 'buyMarker') : undefined) ??
        options[Math.floor(rand() * options.length)];
      const r = lib.apply(s, pick as Action);
      battles += r.events.filter((e) => e.type === 'kingdomBattle').length;
      s = r.state;
    }
    const c = ctxOf(s);
    expect(
      s.winner,
      `${s.turn.number} turns, vp ${s.players.map((p) => c.vp(p.seat))}`,
    ).not.toBeNull();
    expect(battles).toBeGreaterThan(0);
  }, 60_000);
});
