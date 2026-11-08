import { describe, expect, it } from 'vitest';
import { buildGeometry, connectedRegions } from './board.ts';
import {
  cornerHexes,
  edgeCorners,
  edgeHexes,
  hexCorners,
  hexDistance,
  hexEdges,
  hexId,
  parseHexId,
  type HexId,
} from './hex.ts';
import { buildRegistry, resolveModules, type GameModule } from './module.ts';

function disc(radius: number): HexId[] {
  const out: HexId[] = [];
  for (let q = -radius; q <= radius; q++) {
    for (let r = -radius; r <= radius; r++) {
      if (hexDistance({ q: 0, r: 0 }, { q, r }) <= radius) out.push(hexId(q, r));
    }
  }
  return out;
}

describe('hex ids', () => {
  it('round-trips hex ids', () => {
    expect(parseHexId(hexId(-2, 3))).toEqual({ q: -2, r: 3 });
  });

  it('agrees between neighbours on shared corners and edges', () => {
    for (const id of disc(2)) {
      const { q, r } = parseHexId(id);
      for (const c of hexCorners(q, r)) expect(cornerHexes(c)).toContain(id);
      for (const e of hexEdges(q, r)) expect(edgeHexes(e)).toContain(id);
      // Consecutive corners of a hex are the ends of the edge between them.
      const cs = hexCorners(q, r);
      const es = hexEdges(q, r);
      es.forEach((e, i) =>
        expect(new Set(edgeCorners(e))).toEqual(new Set([cs[i], cs[(i + 1) % 6]])),
      );
    }
  });

  it('counts corners and edges of a standard 19-hex board', () => {
    const g = buildGeometry(disc(2));
    expect(g.hexes).toHaveLength(19);
    expect(g.corners).toHaveLength(54);
    expect(g.edges).toHaveLength(72);
    expect(g.hexNeighbours.get(hexId(0, 0))).toHaveLength(6);
  });

  it('finds connected regions', () => {
    const g = buildGeometry([...disc(1), hexId(4, 0), hexId(5, 0)]);
    const regions = connectedRegions(g, () => true);
    expect(regions.map((r) => r.length).sort()).toEqual([2, 7]);
  });
});

describe('modules', () => {
  const a: GameModule = { id: 'a', name: 'A' };
  const b: GameModule = { id: 'b', name: 'B', requires: ['a'] };
  const c: GameModule = { id: 'c', name: 'C', requires: ['b'], conflicts: ['d'] };
  const d: GameModule = { id: 'd', name: 'D', requires: ['a'] };
  const all = new Map([a, b, c, d].map((m) => [m.id, m]));

  it('loads dependencies first', () => {
    expect(resolveModules(['c'], all).map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });

  it('refuses conflicts, unknown modules and cycles', () => {
    expect(() => resolveModules(['c', 'd'], all)).toThrow(/can't be combined/);
    expect(() => resolveModules(['zzz'], all)).toThrow(/Unknown/);
    const x: GameModule = { id: 'x', name: 'X', requires: ['y'] };
    const y: GameModule = { id: 'y', name: 'Y', requires: ['x'] };
    expect(() => resolveModules(['x'], new Map([x, y].map((m) => [m.id, m])))).toThrow(/cycle/);
  });

  it('lets later modules wrap earlier actions and override costs', () => {
    const calls: string[] = [];
    const base: GameModule = {
      id: 'base',
      name: 'Base',
      costs: { road: { brick: 1 } },
      actions: { go: { check: () => null, apply: () => void calls.push('base') } },
    };
    const ext: GameModule = {
      id: 'ext',
      name: 'Ext',
      requires: ['base'],
      costs: { road: { brick: 2 } },
      wrapActions: {
        go: (prev) => ({
          ...prev,
          apply(ctx, act) {
            calls.push('before');
            prev.apply(ctx, act);
          },
        }),
      },
    };
    const reg = buildRegistry([base, ext]);
    reg.actions.go!.apply(undefined as never, { type: 'go', player: 0 });
    expect(calls).toEqual(['before', 'base']);
    expect(reg.costs.road).toEqual({ brick: 2 });
  });
});
