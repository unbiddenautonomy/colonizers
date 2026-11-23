import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { artFor } from './art.ts';
import { BASE, fill, skin, type BaseType } from './kit.tsx';

const files = {
  '../../art/navy/header.webp': '/a/header.webp',
  '../../art/navy/forest.png': '/a/forest.png',
  '../../art/navy/city.webp': '/a/city.webp',
  '../../art/navy/robber.jpg': '/a/robber.jpg',
  '../../art/heart/forest.webp': '/b/forest.webp',
  '../../art/navy/notes.txt': '/a/notes.txt',
};

const terrain = Object.fromEntries(BASE.map((t) => [t, '#888888'])) as Record<BaseType, string>;
const drawnHouse = () => <path d="M0,0" data-drawn="house" />;

function painted(paintings: ReturnType<typeof artFor>) {
  return skin({
    id: 't',
    name: 'T',
    description: '',
    terrain,
    sea: '#123456',
    seaEdge: '#000000',
    art: Object.fromEntries(BASE.map((t) => [t, fill('#888888')])) as never,
    seaPattern: null,
    rest: { pieces: { house: drawnHouse } },
    defs: <linearGradient id="t-grad" />,
    paintings,
  });
}

describe('painted artwork', () => {
  it('finds the files in one folder, by slot', () => {
    expect(artFor('navy', files)).toEqual({
      header: '/a/header.webp',
      forest: '/a/forest.png',
      city: '/a/city.webp',
      robber: '/a/robber.jpg',
    });
    expect(artFor('wano', files)).toEqual({});
  });

  it("keeps the skin's own gradients, which its drawings are painted with", () => {
    // A painted land does not replace the drawn number disc, and that disc is filled from
    // these: without them it would come out hollow on any crew that has artwork.
    for (const folder of ['navy', 'wano']) {
      const theme = painted(artFor(folder, files));
      expect(renderToStaticMarkup(<svg>{theme.patterns?.()}</svg>)).toContain('id="t-grad"');
    }
  });

  it('uses a painting where there is one and the drawing everywhere else', () => {
    const theme = painted(artFor('navy', files));
    const defs = renderToStaticMarkup(<svg>{theme.patterns?.()}</svg>);
    expect(defs).toContain('href="/a/forest.png"');
    expect(defs.match(/<image/g)).toHaveLength(1);

    const house = (city: boolean) =>
      renderToStaticMarkup(
        <svg>{theme.pieces?.house?.({ x: 0, y: 0, color: '#d55e00', city, s: 60 })}</svg>,
      );
    // The city is painted and tinted in the player's colour; the settlement is still drawn.
    expect(house(true)).toContain('href="/a/city.webp"');
    expect(house(true)).toContain('tint-enamel-d55e00');
    expect(house(true)).toContain('tableValues="0.020 0.209 0.418 0.626 0.794 0.860"');
    expect(house(false)).toContain('data-drawn="house"');
    expect(
      renderToStaticMarkup(<svg>{theme.pieces?.robber?.({ x: 0, y: 0, s: 60 })}</svg>),
    ).toContain('href="/a/robber.jpg"');
  });

  it('leaves a skin with no paintings as drawn', () => {
    const theme = painted({});
    expect(theme.pieces?.house).toBe(drawnHouse);
    expect(renderToStaticMarkup(<svg>{theme.patterns?.()}</svg>)).not.toContain('<image');
  });
});
