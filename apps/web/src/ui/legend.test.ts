import { describe, expect, it } from 'vitest';
import type { GameState } from '@colonizers/engine';
import { framed, LEGEND, legendFor, sampleState } from './Legend.tsx';

const game = (modules: string[], hexTypes: string[], extra: Partial<GameState> = {}): GameState =>
  ({
    modules,
    settings: {},
    players: [0, 1, 2].map((seat) => ({
      seat,
      name: `P${seat}`,
      hand: {},
      held: {},
      played: {},
      data: {},
    })),
    hexes: Object.fromEntries(
      hexTypes.map((type, i) => [`h:${i},0`, { id: `h:${i},0`, q: i, r: 0, type }]),
    ),
    harbors: [],
    pieces: {},
    data: {},
    ...extra,
  }) as unknown as GameState;

const ids = (list: { id: string }[]) => list.map((e) => e.id);

describe('legend', () => {
  it('every entry has a unique id', () => {
    expect(new Set(ids(LEGEND)).size).toBe(LEGEND.length);
  });

  it('covers every land type the game knows', () => {
    const lands = LEGEND.filter((e) => e.id.startsWith('tile-')).map((e) => e.sample.land);
    for (const t of [
      'forest',
      'hills',
      'pasture',
      'fields',
      'mountains',
      'desert',
      'sea',
      'gold',
      'volcano',
      'lake',
      'oasis',
      'castle',
      'quarry',
      'glassworks',
      'shoal',
      'fishingLake',
      'swamp',
      'hidden',
    ])
      expect(lands).toContain(t);
  });

  it('a base game lists the base lands and pieces first, and every expansion after', () => {
    const { mine, others } = legendFor(game(['base'], ['forest', 'desert', 'sea']));
    expect(ids(mine)).toEqual(
      expect.arrayContaining(['tile-hills', 'settlement', 'city', 'road', 'robber', 'token']),
    );
    expect(ids(mine).some((id) => id.startsWith('ck-'))).toBe(false);
    expect(ids(others)).toEqual(expect.arrayContaining(['ck-knights', 'tile-gold', 'ww-pyramids']));
  });

  it('Explorers & Pirates has no city or robber anywhere in its legend', () => {
    const { mine, others } = legendFor(game(['base', 'explorers-pirates'], ['sea']));
    for (const list of [mine, others]) {
      expect(ids(list)).not.toContain('city');
      expect(ids(list)).not.toContain('robber');
    }
    expect(ids(mine)).toContain('ep-harbor');
  });

  it('each sample builds a small state with its pieces in the viewer’s colour', () => {
    const base = game(['base'], ['forest']);
    for (const e of LEGEND) {
      const s = sampleState(base, e, 2);
      expect(Object.keys(s.hexes).length).toBeGreaterThan(0);
      for (const p of Object.values(s.pieces)) expect([2, 0, null]).toContain(p.owner);
      // Another expansion's item is drawn as that expansion's game would draw it.
      for (const m of e.modules) expect(s.modules).toContain(m);
    }
  });

  it('variants sit side by side, each in its own spot', () => {
    const dragons = LEGEND.find((e) => e.id === 'td-dragons')!;
    const s = sampleState(game(['base'], []), dragons, 0);
    const spots = Object.values(s.pieces).map((p) => (p.at as { id: string }).id);
    expect(new Set(spots).size).toBe(3);
  });

  it('frames pad the item and keep the picture’s shape', () => {
    const f = framed({ x: 0, y: 0, width: 10, height: 20 }, 1);
    expect(f.width).toBeCloseTo(f.height);
    expect(f.height).toBeCloseTo(24);
    expect(f.x + f.width / 2).toBeCloseTo(5);
  });
});
