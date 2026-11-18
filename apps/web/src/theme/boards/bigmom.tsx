import type { ReactNode } from 'react';
import type { Theme, ThemePieces } from '../clean.ts';
import { resourceIcon } from './icons.tsx';
import { WONDER_ICONS } from './iconSets.ts';
import { artFor } from './art.ts';
import { BASE, CX, H, r1, seaTile, skin, W, type BaseType } from './kit.tsx';

/**
 * Grand Line · Big Mom Pirates: Totto Land, where the islands are dessert. Every land is a slice
 * of cake with icing dripping off its top edges and sprinkles on the icing, the sea is fizzy soda,
 * and the number discs are macarons. Settlements are cupcakes, cities are tiered cakes with a
 * candle, and the robber is Mama's fork: wherever it is stuck in, that field is hers.
 */

interface Ink {
  land: Record<BaseType, string>;
  ink: string;
  icing: string;
  shell: string;
  sea: string;
  fizz: string;
  sprinkles: string[];
  cherry: string;
  silver: string;
}

/** Icing over the top of the tile: a band along both upper edges, dripping in six places. */
const ICING = (() => {
  const ly = (x: number) => (x < CX ? 40 - (x / CX) * 28 : 12 + ((x - CX) / CX) * 28);
  const drips: [number, number][] = [
    [90, 9],
    [73, 5],
    [60, 11],
    [41, 6],
    [27, 10],
    [11, 5],
  ];
  let d = `M0,0 H${W} V40`;
  let prev = W;
  for (const [x, len] of drips) {
    if (prev > CX && x < CX) d += ` L${r1(CX)},12`;
    const b = Math.max(ly(x + 3), ly(x - 3)) + len;
    d += ` L${r1(x + 3)},${r1(ly(x + 3))} V${r1(b)} A3,3 0 0 1 ${r1(x - 3)},${r1(b)} V${r1(ly(x - 3))}`;
    prev = x;
  }
  return `${d} L0,40 Z`;
})();

/** Where the sprinkles lie on the icing: x, y, turn. */
const SPRINKLES: [number, number, number][] = [
  [30, 18, 35],
  [45, 10, -30],
  [58, 9, 70],
  [70, 16, 15],
  [86, 25, -50],
  [17, 26, 80],
];

function art(k: Ink): Record<BaseType, ReactNode> {
  const tile = (type: BaseType) => (
    <>
      <rect width={W} height={H} fill={k.land[type]} />
      <path d={ICING} fill={k.ink} opacity={0.18} transform="translate(0 2)" />
      <path d={ICING} fill={k.icing} />
      {SPRINKLES.map(([x, y, a], i) => (
        <rect
          key={i}
          x={x - 2.4}
          y={y - 0.9}
          width={4.8}
          height={1.8}
          rx={0.9}
          fill={k.sprinkles[i % k.sprinkles.length]}
          transform={`rotate(${a} ${x} ${y})`}
        />
      ))}
      {resourceIcon(
        type,
        { body: k.icing, line: k.ink, solid: k.ink, grain: k.icing, width: 1.7 },
        WONDER_ICONS,
      )}
    </>
  );
  return Object.fromEntries(BASE.map((t) => [t, tile(t)])) as Record<BaseType, ReactNode>;
}

function sea(k: Ink): ReactNode {
  const fizz = (x: number, y: number, r: number, key: string) => (
    <circle key={key} cx={x} cy={y} r={r} fill={k.fizz} fillOpacity={0.45} />
  );
  return seaTile(64, 64, [
    <rect key="bg" width={64} height={64} fill={k.sea} />,
    fizz(10, 12, 2.2, 'a'),
    fizz(15, 6, 1.2, 'b'),
    fizz(44, 40, 1.8, 'c'),
    fizz(48, 34, 1, 'd'),
    fizz(30, 58, 1.4, 'e'),
    <rect
      key="s1"
      x={52}
      y={12}
      width={4.6}
      height={1.7}
      rx={0.85}
      fill={k.sprinkles[0]}
      opacity={0.7}
      transform="rotate(30 54 13)"
    />,
    <rect
      key="s2"
      x={20}
      y={36}
      width={4.6}
      height={1.7}
      rx={0.85}
      fill={k.sprinkles[2]}
      opacity={0.7}
      transform="rotate(-40 22 37)"
    />,
  ]);
}

function pieces(k: Ink): ThemePieces {
  const edge = { stroke: k.ink, strokeWidth: 1.9, strokeLinejoin: 'round' as const };
  /** A wavy band of icing along the top of a tier from x0 to x1 at height y. */
  const tierIcing = (x0: number, x1: number, y: number, u: number) => {
    const n = 4;
    const step = (x1 - x0) / n;
    let d = `M${x0},${y - 0.2 * u} H${x1} V${y + 0.35 * u}`;
    for (let i = n - 1; i >= 0; i--)
      d += ` A${step / 2},${step / 2.4} 0 0 1 ${r1(x0 + i * step)},${r1(y + 0.35 * u)}`;
    return `${d} Z`;
  };
  return {
    house: ({ x, y, color, city, s }) => {
      const u = s * 0.1;
      if (!city) {
        // A cupcake: a pleated case, a swirl of frosting and a cherry.
        const frosting = `M${x - 1.7 * u},${y + 0.3 * u} C${x - 2.3 * u},${y - 0.8 * u} ${x - 1 * u},${y - 1.2 * u} ${x - 0.6 * u},${y - 1 * u} C${x - 0.8 * u},${y - 2.1 * u} ${x + 0.8 * u},${y - 2.3 * u} ${x + 0.6 * u},${y - 1 * u} C${x + 1 * u},${y - 1.2 * u} ${x + 2.3 * u},${y - 0.8 * u} ${x + 1.7 * u},${y + 0.3 * u} Z`;
        return (
          <g>
            <path
              d={`M${x - 1.4 * u},${y + 0.2 * u} H${x + 1.4 * u} L${x + 1 * u},${y + 1.9 * u} H${x - 1 * u} Z`}
              fill={k.icing}
              {...edge}
            />
            <path
              d={`M${x - 0.45 * u},${y + 0.3 * u} L${x - 0.35 * u},${y + 1.8 * u} M${x + 0.45 * u},${y + 0.3 * u} L${x + 0.35 * u},${y + 1.8 * u}`}
              stroke={k.ink}
              strokeOpacity={0.5}
              strokeWidth={1}
            />
            <path d={frosting} fill={color} {...edge} />
            <circle
              cx={x + 0.1 * u}
              cy={y - 2.05 * u}
              r={0.45 * u}
              fill={k.cherry}
              {...edge}
              strokeWidth={1.2}
            />
          </g>
        );
      }
      // A two-tier cake with icing down each tier and a candle on top.
      return (
        <g>
          <rect
            x={x - 0.15 * u}
            y={y - 2.9 * u}
            width={0.3 * u}
            height={1.2 * u}
            fill={k.icing}
            stroke={k.ink}
            strokeWidth={1}
          />
          <path
            d={`M${x},${y - 3.6 * u} q${0.35 * u},${0.35 * u} 0,${0.65 * u} q${-0.35 * u},${-0.3 * u} 0,${-0.65 * u} Z`}
            fill="#ffc83d"
            stroke={k.ink}
            strokeWidth={0.8}
          />
          <rect
            x={x - 2.5 * u}
            y={y - 0.1 * u}
            width={5 * u}
            height={2 * u}
            rx={0.3 * u}
            fill={color}
            {...edge}
          />
          <path
            d={tierIcing(x - 2.5 * u, x + 2.5 * u, y - 0.1 * u, u)}
            fill={k.icing}
            {...edge}
            strokeWidth={1.2}
          />
          <rect
            x={x - 1.6 * u}
            y={y - 1.7 * u}
            width={3.2 * u}
            height={1.6 * u}
            rx={0.3 * u}
            fill={color}
            {...edge}
          />
          <path
            d={tierIcing(x - 1.6 * u, x + 1.6 * u, y - 1.7 * u, u)}
            fill={k.icing}
            {...edge}
            strokeWidth={1.2}
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
          strokeWidth={s * 0.1}
          strokeLinecap="round"
        />
      </>
    ),
    robber: ({ x, y, s }) => {
      const u = s * 0.1;
      // Mama's fork, stuck in at a slant, with a few crumbs where it went in.
      const fork = `M${x - 0.3 * u},${y - 4.2 * u} h${0.6 * u} V${y - 1.3 * u} C${x + 0.3 * u},${y - 0.9 * u} ${x + 1.1 * u},${y - 0.8 * u} ${x + 1.1 * u},${y - 0.1 * u} V${y + 1.4 * u} h${-0.4 * u} V${y + 0.1 * u} h${-0.3 * u} V${y + 1.4 * u} h${-0.4 * u} V${y + 0.1 * u} h${-0.3 * u} V${y + 1.4 * u} h${-0.4 * u} V${y + 0.1 * u} h${-0.3 * u} V${y + 1.4 * u} h${-0.4 * u} V${y - 0.1 * u} C${x - 1.1 * u},${y - 0.8 * u} ${x - 0.3 * u},${y - 0.9 * u} ${x - 0.3 * u},${y - 1.3 * u} Z`;
      return (
        <g>
          <ellipse
            cx={x - 0.3 * u}
            cy={y + 1.5 * u}
            rx={1.9 * u}
            ry={0.5 * u}
            fill={k.ink}
            opacity={0.35}
          />
          <g transform={`rotate(24 ${x} ${y + 1.4 * u})`}>
            <path
              d={fork}
              fill={k.silver}
              stroke={k.ink}
              strokeWidth={1.4}
              strokeLinejoin="round"
            />
            <path
              d={`M${x - 0.1 * u},${y - 3.9 * u} V${y - 1.5 * u}`}
              stroke="#ffffff"
              strokeOpacity={0.8}
              strokeWidth={1}
              strokeLinecap="round"
            />
          </g>
          <circle cx={x - 1.6 * u} cy={y + 1.2 * u} r={0.25 * u} fill={k.ink} opacity={0.6} />
          <circle cx={x + 1.2 * u} cy={y + 1.5 * u} r={0.2 * u} fill={k.ink} opacity={0.6} />
        </g>
      );
    },
    // A macaron from above: a frilled pink shell, cream in the middle for the number.
    token: ({ x, y, r }) => {
      const n = 14;
      const r0 = r * 0.9;
      const pts = Array.from({ length: n }, (_, i) => {
        const a = (2 * Math.PI * i) / n;
        return [x + r0 * Math.cos(a), y + r0 * Math.sin(a)] as const;
      });
      const bump = r1(r0 * Math.sin(Math.PI / n) * 1.15);
      const d =
        `M${r1(pts[0]![0])},${r1(pts[0]![1])} ` +
        pts
          .map((_, i) => {
            const [px, py] = pts[(i + 1) % n]!;
            return `A${bump},${bump} 0 0 1 ${r1(px)},${r1(py)}`;
          })
          .join(' ') +
        ' Z';
      return (
        <>
          <path className="token-face" d={d} fill={k.shell} stroke={k.ink} strokeWidth={1.5} />
          <circle cx={x} cy={y} r={r * 0.74} fill={k.icing} stroke={k.ink} strokeWidth={1} />
        </>
      );
    },
  };
}

function bigMomSkin(id: string, name: string, k: Ink): Theme {
  return skin({
    id,
    name,
    description:
      'Totto Land: cake islands, a soda sea, macaron discs and Mama’s fork for a robber.',
    terrain: k.land,
    sea: k.sea,
    seaEdge: k.ink,
    art: art(k),
    seaPattern: sea(k),
    paintings: artFor('bigmom'),
    rest: {
      token: k.icing,
      tokenText: k.ink,
      tokenHot: '#b0174f',
      outline: k.ink,
      robber: k.silver,
      landStroke: k.ink,
      landStrokeWidth: 2.6,
      harborWood: k.ink,
      harborFace: k.icing,
      harborText: k.ink,
      pieceEffect: 'lift',
      tokenFont: "'Chewy', 'Fredoka', system-ui, sans-serif",
      pieces: pieces(k),
      boardBackground: k.sea,
    },
  });
}

export const bigMomBoard = bigMomSkin('bigmom-cake', 'Grand Line · Big Mom Pirates', {
  land: {
    forest: '#4f9a6a',
    hills: '#c9623f',
    pasture: '#a9d483',
    fields: '#f2c95e',
    mountains: '#9c95a8',
    desert: '#ecd2a8',
  },
  ink: '#4a2a1f',
  icing: '#fff6ea',
  shell: '#f5a3c0',
  sea: '#a991e0',
  fizz: '#ffffff',
  sprinkles: ['#f2559a', '#5cc9a7', '#ffc83d', '#5aa7f0'],
  cherry: '#d81e4a',
  silver: '#d8dde6',
});
