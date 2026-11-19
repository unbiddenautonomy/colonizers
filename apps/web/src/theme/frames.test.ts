import { describe, expect, it } from 'vitest';
import { ISLAND_COAST, islandFrame } from './frames.ts';

const COLOURS = { land: '#fbf5e6', shore: '#17292a', water: '#4f9bd1' };

/** How far the land's own coast swings either side of the line it runs along. */
function bay(frame: string): number[] {
  const svg = decodeURIComponent(
    frame.replace(/^url\("data:image\/svg\+xml,/, '').replace(/"\)$/, ''),
  );
  const land = /<path d='([^']+)' fill='[^']+'/.exec(svg);
  expect(land).not.toBeNull();
  return [...land![1]!.matchAll(/[-\d.]+/g)]
    .map((m) => Number(m[0]))
    .filter((n) => Math.abs(n - ISLAND_COAST) <= 15);
}

const spread = (ns: number[]) => Math.max(...ns) - Math.min(...ns);

describe('islandFrame', () => {
  it('draws a coast with bays by default', () => {
    expect(spread(bay(islandFrame(COLOURS)))).toBeGreaterThan(14);
  });

  it('calm flattens the bays, so a panel reads as a card', () => {
    const calm = spread(bay(islandFrame({ ...COLOURS, calm: 0.4 })));
    expect(calm).toBeLessThan(spread(bay(islandFrame(COLOURS))));
    expect(calm).toBeGreaterThan(0);
  });

  it('fewer rings means fewer depth lines around it', () => {
    const count = (f: string) => (f.match(/stroke-opacity/g) ?? []).length;
    expect(count(islandFrame({ ...COLOURS, rings: 1 }))).toBeLessThan(
      count(islandFrame({ ...COLOURS, rings: 3 })),
    );
  });
});
