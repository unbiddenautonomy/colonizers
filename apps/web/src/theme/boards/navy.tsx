import type { ReactNode } from 'react';
import type { Theme, ThemePieces } from '../clean.ts';
import { ICONS, resourceIcon } from './icons.tsx';
import { artFor } from './art.ts';
import { BASE, CX, CY, H, poly, seaTile, skin, W, type BaseType } from './kit.tsx';

/**
 * Grand Line · the Navy: Marineford on parade. Crisp lands piped in white like a uniform, a deep
 * blue sea with gulls riding it, and number discs in the Marines' white, blue and gold. Outposts
 * and fortresses fly the gull flag, and the robber, for once, is a pirate: a Jolly Roger planted
 * on the field.
 */

interface Ink {
  land: Record<BaseType, string>;
  ink: string;
  white: string;
  blue: string;
  gold: string;
  sea: string;
  gull: string;
  pirate: string;
}

function art(k: Ink): Record<BaseType, ReactNode> {
  const tile = (type: BaseType) => (
    <>
      <rect width={W} height={H} fill={k.land[type]} />
      <polygon
        points={poly(CX, CY, 53, 6)}
        fill="none"
        stroke={k.white}
        strokeOpacity={0.75}
        strokeWidth={1.6}
      />
      {resourceIcon(
        type,
        { body: k.white, line: k.ink, solid: k.ink, grain: k.white, width: 1.7 },
        ICONS,
      )}
    </>
  );
  return Object.fromEntries(BASE.map((t) => [t, tile(t)])) as Record<BaseType, ReactNode>;
}

/** The Marines' gull: two shallow wings. */
const gull = (x: number, y: number, w: number) =>
  `M${x - w},${y} q${w / 2},${-w / 2} ${w},0 q${w / 2},${-w / 2} ${w},0`;

function sea(k: Ink): ReactNode {
  return seaTile(80, 64, [
    <rect key="bg" width={80} height={64} fill={k.sea} />,
    <path
      key="g"
      d={`${gull(18, 18, 4)} ${gull(58, 48, 3.2)}`}
      fill="none"
      stroke={k.gull}
      strokeWidth={1.6}
      strokeLinecap="round"
    />,
    <path
      key="w"
      d="M40,28 h10 M6,52 h8"
      stroke={k.gull}
      strokeOpacity={0.4}
      strokeWidth={1.2}
      strokeLinecap="round"
    />,
  ]);
}

function pieces(k: Ink): ThemePieces {
  const edge = { stroke: k.ink, strokeWidth: 1.9, strokeLinejoin: 'round' as const };
  /** A little white flag with the blue gull, on a pole from (x, top) down to (x, foot). */
  const flag = (x: number, top: number, foot: number, u: number) => (
    <>
      <path d={`M${x},${foot} V${top}`} stroke={k.ink} strokeWidth={1.4} />
      <rect
        x={x}
        y={top}
        width={1.5 * u}
        height={1 * u}
        fill={k.white}
        stroke={k.ink}
        strokeWidth={1}
      />
      <path
        d={gull(x + 0.75 * u, top + 0.6 * u, 0.3 * u)}
        fill="none"
        stroke={k.blue}
        strokeWidth={1.1}
      />
    </>
  );
  return {
    house: ({ x, y, color, city, s }) => {
      const u = s * 0.1;
      if (!city)
        return (
          <g>
            {flag(x + 0.9 * u, y - 2.8 * u, y - 0.6 * u, u)}
            <rect
              x={x - 1.6 * u}
              y={y - 0.6 * u}
              width={3.2 * u}
              height={2.3 * u}
              fill={color}
              {...edge}
            />
            <rect
              x={x - 1.6 * u}
              y={y - 0.6 * u}
              width={3.2 * u}
              height={0.55 * u}
              fill={k.white}
              {...edge}
            />
            <rect x={x - 0.4 * u} y={y + 0.6 * u} width={0.8 * u} height={1.1 * u} fill={k.ink} />
          </g>
        );
      // A fortress tower: battlements, a gold band, the flag on top.
      const tower = `M${x - 1.8 * u},${y + 1.8 * u} V${y - 1.6 * u} h${0.6 * u} v${-0.5 * u} h${0.6 * u} v${0.5 * u} h${0.6 * u} v${-0.5 * u} h${0.6 * u} v${0.5 * u} h${0.6 * u} v${-0.5 * u} h${0.6 * u} V${y + 1.8 * u} Z`;
      return (
        <g>
          {flag(x, y - 3.9 * u, y - 2.1 * u, u)}
          <path d={tower} fill={color} {...edge} />
          <rect
            x={x - 1.8 * u}
            y={y - 0.5 * u}
            width={3.6 * u}
            height={0.45 * u}
            fill={k.gold}
            stroke={k.ink}
            strokeWidth={1}
          />
          <path
            d={`M${x - 0.5 * u},${y + 1.8 * u} V${y + 0.8 * u} a${0.5 * u},${0.5 * u} 0 0 1 ${u},0 V${y + 1.8 * u} Z`}
            fill={k.ink}
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
          strokeWidth={s * 0.17}
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
      // Pirates! A black flag with a skull and crossbones, planted in the field.
      const cloth = `M${x - 0.9 * u},${y - 3.4 * u} Q${x + 0.6 * u},${y - 3.8 * u} ${x + 2.4 * u},${y - 3.3 * u} L${x + 2.3 * u},${y - 0.9 * u} Q${x + 0.6 * u},${y - 1.4 * u} ${x - 0.9 * u},${y - 1 * u} Z`;
      const sx = x + 0.7 * u;
      const sy = y - 2.35 * u;
      return (
        <g>
          <ellipse
            cx={x - 0.9 * u}
            cy={y + 1.6 * u}
            rx={1.2 * u}
            ry={0.4 * u}
            fill={k.ink}
            opacity={0.4}
          />
          <path
            d={`M${x - 0.9 * u},${y + 1.6 * u} V${y - 3.6 * u}`}
            stroke={k.ink}
            strokeWidth={2.2}
            strokeLinecap="round"
          />
          <path d={cloth} fill={k.pirate} stroke={k.ink} strokeWidth={1.4} strokeLinejoin="round" />
          <path
            d={`M${sx - 0.9 * u},${sy + 0.2 * u} L${sx + 0.9 * u},${sy + 1 * u} M${sx + 0.9 * u},${sy + 0.2 * u} L${sx - 0.9 * u},${sy + 1 * u}`}
            stroke={k.white}
            strokeWidth={1.4}
            strokeLinecap="round"
          />
          <circle cx={sx} cy={sy} r={0.55 * u} fill={k.white} />
          <circle cx={sx - 0.2 * u} cy={sy - 0.05 * u} r={0.13 * u} fill={k.pirate} />
          <circle cx={sx + 0.2 * u} cy={sy - 0.05 * u} r={0.13 * u} fill={k.pirate} />
        </g>
      );
    },
    // The Marines' colours: a blue rim, a gold rope ring, and white for the number.
    token: ({ x, y, r }) => (
      <>
        <circle
          className="token-face"
          cx={x}
          cy={y}
          r={r}
          fill={k.blue}
          stroke={k.ink}
          strokeWidth={1.6}
        />
        <circle
          cx={x}
          cy={y}
          r={r * 0.87}
          fill="none"
          stroke={k.gold}
          strokeWidth={1.6}
          strokeDasharray="2 1.4"
        />
        <circle cx={x} cy={y} r={r * 0.76} fill={k.white} stroke={k.ink} strokeWidth={0.8} />
      </>
    ),
  };
}

function navySkin(id: string, name: string, k: Ink): Theme {
  return skin({
    id,
    name,
    description:
      'Marineford on parade: lands piped in white, gull flags, and a pirate for a robber.',
    terrain: k.land,
    sea: k.sea,
    seaEdge: k.ink,
    art: art(k),
    seaPattern: sea(k),
    paintings: artFor('navy'),
    rest: {
      token: k.white,
      tokenText: k.ink,
      tokenHot: '#c0262d',
      outline: k.ink,
      robber: k.pirate,
      landStroke: k.ink,
      landStrokeWidth: 2.4,
      harborWood: k.ink,
      harborFace: k.white,
      harborText: k.ink,
      pieceEffect: 'lift',
      tokenFont: "'Oswald', system-ui, sans-serif",
      pieces: pieces(k),
      boardBackground: k.sea,
    },
  });
}

export const navyBoard = navySkin('navy-marineford', 'Grand Line · The Navy', {
  land: {
    forest: '#2f7d58',
    hills: '#c45a3c',
    pasture: '#93c76d',
    fields: '#e6bf4f',
    mountains: '#8a96a8',
    desert: '#ebdcb5',
  },
  ink: '#14213d',
  white: '#ffffff',
  blue: '#1f4e9c',
  gold: '#d4a73a',
  sea: '#1d4f8f',
  gull: '#e8f0fb',
  pirate: '#151515',
});
