import type { ReactNode } from 'react';
import type { Theme, ThemePieces } from '../clean.ts';
import { ICONS, resourceIcon } from './icons.tsx';
import { artFor } from './art.ts';
import { BASE, H, r1, seaTile, skin, W, type BaseType } from './kit.tsx';

/**
 * Grand Line · Straw Hat Pirates: the island as a colour page of a manga. Flat bright lands in
 * heavy ink with screentone shading toward the bottom of each tile, a sea of halftone dots and
 * little wave strokes. Number discs are straw hats seen from above, settlements wear straw-hat
 * roofs, cities are ships under a Jolly Roger, and the robber is a Marine cap: the Navy has
 * moved in, so nothing gets made there.
 */

interface Ink {
  land: Record<BaseType, string>;
  ink: string;
  paper: string;
  straw: string;
  strawLight: string;
  band: string;
  sea: string;
  seaDot: string;
  marine: string;
}

/** Screentone: dots that grow toward the bottom of the tile, the way manga shades a form. */
const TONE = (() => {
  let d = '';
  const top = H * 0.42;
  for (let row = 0, y = top; y < H; y += 5, row++) {
    const t = (y - top) / (H - top);
    const r = 0.3 + 1.25 * t ** 1.4;
    for (let x = row % 2 ? 2.5 : 5; x < W; x += 5)
      d += `M${r1(x - r)},${r1(y)}a${r1(r)},${r1(r)} 0 1 0 ${r1(2 * r)},0a${r1(r)},${r1(r)} 0 1 0 ${r1(-2 * r)},0`;
  }
  return d;
})();

function art(k: Ink): Record<BaseType, ReactNode> {
  const tile = (type: BaseType) => (
    <>
      <rect width={W} height={H} fill={k.land[type]} />
      <path d={TONE} fill={k.ink} opacity={0.16} />
      {resourceIcon(
        type,
        { body: k.paper, line: k.ink, solid: k.ink, grain: k.paper, width: 2 },
        ICONS,
      )}
    </>
  );
  return Object.fromEntries(BASE.map((t) => [t, tile(t)])) as Record<BaseType, ReactNode>;
}

function sea(k: Ink): ReactNode {
  let dots = '';
  for (let y = 3; y < 56; y += 7)
    for (let x = (y / 7) % 2 ? 3.5 : 7; x < 64; x += 7)
      dots += `M${x - 1},${y}a1,1 0 1 0 2,0a1,1 0 1 0 -2,0`;
  return seaTile(64, 56, [
    <rect key="bg" width={64} height={56} fill={k.sea} />,
    <path key="dots" d={dots} fill={k.seaDot} />,
    <path
      key="waves"
      d="M8,18 q5,-6 10,0 t10,0 M38,44 q5,-6 10,0 t10,0"
      fill="none"
      stroke={k.paper}
      strokeWidth={2.2}
      strokeLinecap="round"
    />,
  ]);
}

function pieces(k: Ink): ThemePieces {
  const edge = { stroke: k.ink, strokeWidth: 2.2, strokeLinejoin: 'round' as const };
  return {
    house: ({ x, y, color, city, s }) => {
      const u = s * 0.1;
      if (!city) {
        // A hut under a straw hat: the brim is the eaves, the red band is the ridge.
        const crown = `M${x - 1.25 * u},${y - 0.55 * u} C${x - 1.3 * u},${y - 2.5 * u} ${x + 1.3 * u},${y - 2.5 * u} ${x + 1.25 * u},${y - 0.55 * u} Z`;
        return (
          <g>
            <rect
              x={x - 1.4 * u}
              y={y - 0.5 * u}
              width={2.8 * u}
              height={2.2 * u}
              fill={color}
              {...edge}
            />
            <rect x={x - 0.4 * u} y={y + 0.6 * u} width={0.8 * u} height={1.1 * u} fill={k.ink} />
            <ellipse cx={x} cy={y - 0.5 * u} rx={2.5 * u} ry={0.62 * u} fill={k.straw} {...edge} />
            <path d={crown} fill={k.straw} {...edge} />
            <path
              d={`M${x - 1.27 * u},${y - 0.95 * u} Q${x},${y - 1.25 * u} ${x + 1.27 * u},${y - 0.95 * u}`}
              fill="none"
              stroke={k.band}
              strokeWidth={0.45 * u}
            />
          </g>
        );
      }
      // A ship with a skull on its sail and the black flag at the masthead.
      const hull = `M${x - 2.7 * u},${y + 0.1 * u} H${x + 2.7 * u} Q${x + 2.3 * u},${y + 1.9 * u} ${x + 1.2 * u},${y + 1.9 * u} H${x - 1.5 * u} Q${x - 2.5 * u},${y + 1.6 * u} ${x - 2.7 * u},${y + 0.1 * u} Z`;
      const sail = `M${x - 1.5 * u},${y - 2.7 * u} Q${x},${y - 2.35 * u} ${x + 1.5 * u},${y - 2.7 * u} L${x + 1.6 * u},${y - 0.35 * u} Q${x},${y} ${x - 1.6 * u},${y - 0.35 * u} Z`;
      return (
        <g>
          <path d={`M${x},${y + 0.1 * u} V${y - 3.3 * u}`} {...edge} />
          <path
            d={`M${x},${y - 3.3 * u} h${1.3 * u} l${-0.3 * u},${0.35 * u} l${0.3 * u},${0.35 * u} h${-1.3 * u} Z`}
            fill={k.ink}
          />
          <path d={sail} fill={k.paper} {...edge} />
          <circle cx={x} cy={y - 1.75 * u} r={0.5 * u} fill={k.ink} />
          <path
            d={`M${x - 0.75 * u},${y - 1.1 * u} L${x + 0.75 * u},${y - 0.6 * u} M${x + 0.75 * u},${y - 1.1 * u} L${x - 0.75 * u},${y - 0.6 * u}`}
            stroke={k.ink}
            strokeWidth={1.3}
            strokeLinecap="round"
          />
          <path d={hull} fill={color} {...edge} />
          <path
            d={`M${x - 2.2 * u},${y + 0.75 * u} H${x + 2.2 * u}`}
            stroke={k.ink}
            strokeWidth={1.2}
            strokeOpacity={0.6}
          />
        </g>
      );
    },
    road: ({ a, b, color, s }) => (
      <>
        <line
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke={k.ink}
          strokeWidth={s * 0.18}
          strokeLinecap="round"
        />
        <line
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke={color}
          strokeWidth={s * 0.095}
          strokeLinecap="round"
        />
      </>
    ),
    robber: ({ x, y, s }) => {
      const u = s * 0.1;
      // A Marine officer's cap: white crown, blue band, black peak, and the gull on the front.
      const crown = `M${x - 2.3 * u},${y - 0.5 * u} C${x - 2.6 * u},${y - 2.4 * u} ${x - 1.2 * u},${y - 2.7 * u} ${x},${y - 2.7 * u} C${x + 1.2 * u},${y - 2.7 * u} ${x + 2.6 * u},${y - 2.4 * u} ${x + 2.3 * u},${y - 0.5 * u} Z`;
      return (
        <g>
          <ellipse cx={x} cy={y + 1.3 * u} rx={2.4 * u} ry={0.55 * u} fill={k.ink} opacity={0.3} />
          <path d={crown} fill={k.paper} {...edge} />
          <rect
            x={x - 2.3 * u}
            y={y - 0.75 * u}
            width={4.6 * u}
            height={0.95 * u}
            fill={k.marine}
            {...edge}
          />
          <path
            d={`M${x - 1.9 * u},${y + 0.2 * u} Q${x},${y + 1.4 * u} ${x + 1.9 * u},${y + 0.2 * u} Z`}
            fill={k.ink}
            {...edge}
          />
          <path
            d={`M${x - 0.95 * u},${y - 1.55 * u} q${0.48 * u},${-0.5 * u} ${0.95 * u},0 q${0.47 * u},${-0.5 * u} ${0.95 * u},0`}
            fill="none"
            stroke={k.marine}
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        </g>
      );
    },
    // A straw hat from above: the woven brim, the red band, and the number on the crown.
    token: ({ x, y, r }) => (
      <>
        <circle
          className="token-face"
          cx={x}
          cy={y}
          r={r}
          fill={k.straw}
          stroke={k.ink}
          strokeWidth={2.2}
        />
        <circle
          cx={x}
          cy={y}
          r={r * 0.9}
          fill="none"
          stroke={k.ink}
          strokeOpacity={0.35}
          strokeWidth={0.8}
          strokeDasharray="1.6 2.2"
        />
        <circle cx={x} cy={y} r={r * 0.79} fill={k.band} stroke={k.ink} strokeWidth={1} />
        <circle cx={x} cy={y} r={r * 0.68} fill={k.strawLight} stroke={k.ink} strokeWidth={1} />
      </>
    ),
  };
}

function strawHatSkin(id: string, name: string, k: Ink): Theme {
  return skin({
    id,
    name,
    description:
      'A manga colour page: screentone, heavy ink, straw-hat discs and a Marine cap for a robber.',
    terrain: k.land,
    sea: k.sea,
    seaEdge: k.ink,
    art: art(k),
    seaPattern: sea(k),
    paintings: artFor('strawhat'),
    rest: {
      token: k.strawLight,
      tokenText: k.ink,
      tokenHot: '#b3121f',
      outline: k.ink,
      robber: k.paper,
      landStroke: k.ink,
      landStrokeWidth: 3,
      harborWood: k.ink,
      harborFace: k.paper,
      harborText: k.ink,
      pieceEffect: 'lift',
      tokenFont: "'Bangers', 'Lilita One', system-ui, sans-serif",
      pieces: pieces(k),
      boardBackground: k.sea,
    },
  });
}

export const strawHatBoard = strawHatSkin('strawhat-sunny', 'Grand Line · Straw Hat Pirates', {
  land: {
    forest: '#2e9e5b',
    hills: '#e2603a',
    pasture: '#9ad25b',
    fields: '#f6c945',
    mountains: '#8f9bb0',
    desert: '#f1dcab',
  },
  ink: '#141414',
  paper: '#ffffff',
  straw: '#f2c240',
  strawLight: '#fff1c2',
  band: '#d62828',
  sea: '#3b9fe0',
  seaDot: '#2f8ccb',
  marine: '#2b5fae',
});
