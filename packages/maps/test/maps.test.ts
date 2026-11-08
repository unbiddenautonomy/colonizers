import { describe, expect, it } from 'vitest';
import { ModuleLibrary } from '@colonizers/engine';
import { baseModule } from '@colonizers/module-base';
import {
  analyzeMap,
  ALL_RULES,
  brokenRules,
  componentsFor,
  generateBoard,
  layoutOf,
  PRESETS,
  SHAPES,
  validateMapFile,
  type Mode,
} from '../src/index.ts';

const lib = new ModuleLibrary([baseModule]);

describe('board shapes', () => {
  it('has the right number of land hexes', () => {
    expect(SHAPES.standard()).toHaveLength(19);
    expect(SHAPES.fiveSix()).toHaveLength(30);
    expect(SHAPES.sevenEight()).toHaveLength(37);
  });

  it('component sets fill their boards exactly', () => {
    for (const [players, shape] of [
      [4, SHAPES.standard()],
      [6, SHAPES.fiveSix()],
      [8, SHAPES.sevenEight()],
    ] as const) {
      const c = componentsFor(players);
      const hexes = Object.values(c.terrain).reduce((s, n) => s + n, 0);
      const tokens = Object.values(c.tokens).reduce((s, n) => s + n, 0);
      expect(hexes).toBe(shape.length);
      expect(tokens).toBe(hexes - (c.terrain.desert ?? 0));
    }
  });
});

describe('generator', () => {
  const modes: Mode[] = ['classic', 'balanced', 'wild', 'custom'];

  it('is deterministic for a seed', () => {
    for (const mode of modes) {
      const a = generateBoard({ seed: 'same', players: 4, mode });
      const b = generateBoard({ seed: 'same', players: 4, mode });
      expect(a.map).toEqual(b.map);
    }
    expect(generateBoard({ seed: 'x', players: 4 }).map).not.toEqual(
      generateBoard({ seed: 'y', players: 4 }).map,
    );
  });

  it('defaults to Classic', () => {
    expect(generateBoard({ seed: 's', players: 4 }).mode).toBe('classic');
  });

  for (const players of [3, 4, 5, 6, 7, 8]) {
    it(`makes boards that pass their mode's rules (${players} players)`, () => {
      const n = players === 4 ? 200 : 60;
      for (const mode of modes) {
        for (let i = 0; i < n; i++) {
          const board = generateBoard({
            seed: `t-${i}`,
            players,
            mode,
            ...(mode === 'balanced' && { iterations: 400 }),
            ...(mode === 'custom' && {
              custom: { rules: { redApart: true, extremesApart: true } },
            }),
          });
          const { info, layout } = layoutOf(board.map);
          expect(brokenRules(info, layout, board.rules), `${mode} ${board.seed}`).toEqual([]);
          const c = componentsFor(players);
          for (const [t, count] of Object.entries(c.terrain)) {
            expect(layout.terrain.filter((x) => x === t)).toHaveLength(count);
          }
          expect(board.map.harbors).toHaveLength(
            Object.values(c.harbors).reduce((s, x) => s + x, 0),
          );
        }
      }
    }, 60_000);
  }

  it('keeps 6s and 8s apart in Classic but not always in Wild', () => {
    let wildTouching = 0;
    for (let i = 0; i < 100; i++) {
      const w = layoutOf(generateBoard({ seed: `w${i}`, players: 4, mode: 'wild' }).map);
      if (brokenRules(w.info, w.layout, { redApart: true }).length) wildTouching++;
    }
    expect(wildTouching).toBeGreaterThan(0);
  });

  it('makes Balanced boards fairer than Classic on average', () => {
    let classic = 0;
    let balanced = 0;
    for (let i = 0; i < 50; i++) {
      classic += generateBoard({ seed: `f${i}`, players: 4, mode: 'classic' }).report.score;
      balanced += generateBoard({ seed: `f${i}`, players: 4, mode: 'balanced' }).report.score;
    }
    expect(balanced).toBeLessThan(classic * 0.7);
  });

  it('supports custom terrain mixes like "more ore"', () => {
    const board = generateBoard({
      seed: 'ore',
      players: 4,
      mode: 'custom',
      custom: { terrain: { forest: 3, pasture: 4, fields: 4, hills: 3, mountains: 4, desert: 1 } },
    });
    expect(board.map.hexes.filter((h) => h.type === 'mountains')).toHaveLength(4);
    expect(() =>
      generateBoard({
        seed: 'bad',
        players: 4,
        mode: 'custom',
        custom: { terrain: { forest: 2 } },
      }),
    ).toThrow(/Terrain has 2/);
  });

  it('puts the robber on the desert, harbors on the coast, and plays in the engine', () => {
    const board = generateBoard({ seed: 'play', players: 4, mode: 'balanced' });
    const desert = board.map.hexes.find((h) => h.type === 'desert')!;
    expect(board.map.pieces?.[0]).toEqual({
      type: 'robber',
      at: { kind: 'hex', id: `h:${desert.q},${desert.r}` },
    });
    const { state } = lib.createGame({
      seed: 'g',
      players: ['a', 'b', 'c', 'd'],
      modules: ['base'],
      map: board.map,
    });
    expect(lib.legalActions(state, state.turn.player).length).toBeGreaterThan(0);
    const { info } = layoutOf(board.map);
    for (const h of board.map.harbors!)
      expect(info.coast.some((c) => c.edge === h.edge)).toBe(true);
  });
});

describe('fairness report', () => {
  it('reports pips per resource, starting spots and a grade', () => {
    const r = generateBoard({ seed: 'rep', players: 4, mode: 'balanced' }).report;
    const total = Object.values(r.pipsPerResource).reduce((s, x) => s + x, 0);
    expect(total).toBe(58);
    expect(r.fairShare.lumber).toBeCloseTo(12.9, 0);
    expect(r.fairShare.ore).toBeCloseTo(9.7, 0);
    expect(r.startingSpots).toHaveLength(8);
    expect(['A', 'B', 'C']).toContain(r.grade);
  });
});

describe('presets', () => {
  it('are valid map files with A grades that start games', () => {
    expect(PRESETS.map((p) => p.id)).toEqual(['starter', 'classic-5-6', 'big-7-8']);
    for (const p of PRESETS) {
      expect(validateMapFile(p)).toEqual([]);
      const report = analyzeMap(p, p.players.max);
      expect(report.grade, p.id).toBe('A');
      const { info, layout } = layoutOf(p);
      expect(brokenRules(info, layout, ALL_RULES)).toEqual([]);
      const players = Array.from({ length: p.players.max }, (_, i) => `P${i}`);
      const { state } = lib.createGame({ seed: p.id, players, modules: p.modules, map: p });
      expect(state.phase.id).toBe('setup');
    }
  });
});
