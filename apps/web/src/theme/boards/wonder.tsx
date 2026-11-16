import type { ReactNode } from 'react';
import type { Theme, ThemePieces } from '../clean.ts';
import { resourceIcon } from './icons.tsx';
import { BASE, CX, H, poly, seaTile, skin, W, type BaseType } from './kit.tsx';

/**
 * Wonderland boards: a storybook plate. Each land is a soft wash of one colour with a thin red
 * line round it, like the border of a playing card, and a single inked icon. The sea is the Pool
 * of Tears, nearly still.
 *
 * The pieces carry the nods to Carroll and Tenniel (long in the public domain): settlements are
 * the March Hare's house, with chimneys shaped like ears; cities are the Queen of Hearts' castle,
 * flying a heart; the robber is the Cheshire Cat, grinning; tokens are plain cream discs.
 */

interface Ink {
  land: Record<BaseType, string>;
  line: string;
  light: string;
  red: string;
  cat: string;
  catEye: string;
  sea: string;
  seaLine: string;
  face: string;
  faceText: string;
  hot: string;
}

function art(k: Ink): Record<BaseType, ReactNode> {
  const tile = (type: BaseType) => (
    <>
      <rect width={W} height={H} fill={k.land[type]} />
      <rect width={W} height={H} fill="url(#wonder-wash)" />
      <polygon
        points={poly(CX, H / 2, 51, 6)}
        fill="none"
        stroke={k.red}
        strokeOpacity={0.4}
        strokeWidth={0.9}
      />
      {resourceIcon(type, {
        body: k.light,
        line: k.line,
        solid: k.line,
        grain: k.light,
        width: 1.5,
      })}
    </>
  );
  return Object.fromEntries(BASE.map((t) => [t, tile(t)])) as Record<BaseType, ReactNode>;
}

function sea(k: Ink): ReactNode {
  return seaTile(64, 44, [
    <rect key="bg" width={64} height={44} fill={k.sea} />,
    <path
      key="w"
      d="M6,14 q5,-3 10,0 t10,0 M36,34 q5,-3 10,0 t10,0"
      fill="none"
      stroke={k.seaLine}
      strokeOpacity={0.55}
      strokeWidth={1}
      strokeLinecap="round"
    />,
  ]);
}

const circle = (x: number, y: number, r: number) =>
  `M${x - r},${y} a${r},${r} 0 1 0 ${2 * r},0 a${r},${r} 0 1 0 ${-2 * r},0 Z`;

/** A heart with its point at (x, y), w wide. */
const heart = (x: number, y: number, w: number) => {
  const h = w * 0.5;
  return `M${x},${y} C${x - w * 0.15},${y - h * 0.5} ${x - w * 0.5},${y - h * 0.8} ${x - w * 0.5},${y - h * 1.3} A${w * 0.25},${w * 0.25} 0 0 1 ${x},${y - h * 1.35} A${w * 0.25},${w * 0.25} 0 0 1 ${x + w * 0.5},${y - h * 1.3} C${x + w * 0.5},${y - h * 0.8} ${x + w * 0.15},${y - h * 0.5} ${x},${y} Z`;
};

function pieces(k: Ink): ThemePieces {
  const ln = {
    stroke: k.line,
    strokeWidth: 1.6,
    strokeLinejoin: 'round' as const,
    strokeLinecap: 'round' as const,
  };
  return {
    house: ({ x, y, color, city, s }) => {
      const u = s * 0.1;
      if (!city) {
        // The March Hare's house: a cottage whose chimneys are a pair of ears.
        const ear = (cx: number, rot: number) => (
          <ellipse
            cx={cx}
            cy={y - 2.3 * u}
            rx={0.32 * u}
            ry={0.85 * u}
            transform={`rotate(${rot} ${cx} ${y - 2.3 * u})`}
            fill={k.light}
            {...ln}
            strokeWidth={1.2}
          />
        );
        return (
          <g filter="url(#lift)">
            {ear(x - 0.55 * u, -14)}
            {ear(x + 0.55 * u, 14)}
            <path
              d={`M${x - 1.7 * u},${y + 1.6 * u} V${y - 0.2 * u} L${x},${y - 1.8 * u} L${x + 1.7 * u},${y - 0.2 * u} V${y + 1.6 * u} Z`}
              fill={color}
              {...ln}
            />
            <path
              d={`M${x - 2 * u},${y + 0.1 * u} L${x},${y - 1.9 * u} L${x + 2 * u},${y + 0.1 * u}`}
              fill="none"
              {...ln}
              strokeWidth={2.4}
            />
          </g>
        );
      }
      // The Queen's castle: three crenellated towers and a heart on a flag.
      const b = y + 1.8 * u;
      const top = y - 1.4 * u;
      const side = y - 0.2 * u;
      const m = 0.45 * u;
      const d = `M${x - 2.6 * u},${b} V${side} h${m} v${m} h${m} v${-m} h${m} V${top} h${m} v${m} h${m} v${-m} h${m} v${m} h${m} v${-m} h${m} V${side} h${m} v${m} h${m} v${-m} h${m} V${b} Z`;
      return (
        <g filter="url(#lift)">
          <path d={`M${x},${top} V${top - 1.7 * u}`} {...ln} strokeWidth={1.2} />
          <path
            d={heart(x + 0.95 * u, top - 0.8 * u, 1.3 * u)}
            fill={k.red}
            {...ln}
            strokeWidth={0.9}
          />
          <path d={d} fill={color} {...ln} />
          <path
            d={`M${x - 0.4 * u},${b} v${-0.8 * u} a${0.4 * u},${0.4 * u} 0 0 1 ${0.8 * u},0 v${0.8 * u} Z`}
            fill={k.line}
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
          stroke={k.line}
          strokeWidth={s * 0.15}
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
      // The Cheshire Cat: a striped head, two lamp eyes and the grin.
      const u = s * 0.1;
      const cy = y - 0.2 * u;
      const r = 2 * u;
      return (
        <g filter="url(#lift)">
          <path
            d={`M${x - 1.75 * u},${cy - 0.9 * u} L${x - 1.6 * u},${cy - 2.7 * u} L${x - 0.5 * u},${cy - 1.9 * u} Z M${x + 1.75 * u},${cy - 0.9 * u} L${x + 1.6 * u},${cy - 2.7 * u} L${x + 0.5 * u},${cy - 1.9 * u} Z`}
            fill={k.cat}
            {...ln}
          />
          <ellipse cx={x} cy={cy} rx={r * 1.05} ry={r * 0.92} fill={k.cat} {...ln} />
          <path
            d={`M${x - 0.5 * u},${cy - 1.75 * u} l${0.15 * u},${0.6 * u} M${x + 0.5 * u},${cy - 1.75 * u} l${-0.15 * u},${0.6 * u} M${x},${cy - 1.85 * u} v${0.6 * u}`}
            stroke={k.line}
            strokeWidth={1.1}
            strokeLinecap="round"
          />
          <ellipse
            cx={x - 0.75 * u}
            cy={cy - 0.45 * u}
            rx={0.42 * u}
            ry={0.34 * u}
            fill={k.catEye}
          />
          <ellipse
            cx={x + 0.75 * u}
            cy={cy - 0.45 * u}
            rx={0.42 * u}
            ry={0.34 * u}
            fill={k.catEye}
          />
          <path
            d={`M${x - 0.75 * u},${cy - 0.7 * u} v${0.5 * u} M${x + 0.75 * u},${cy - 0.7 * u} v${0.5 * u}`}
            stroke={k.line}
            strokeWidth={1.2}
            strokeLinecap="round"
          />
          <path
            d={`M${x - 1.45 * u},${cy + 0.2 * u} Q${x},${cy + 0.75 * u} ${x + 1.45 * u},${cy + 0.2 * u} Q${x},${cy + 1.75 * u} ${x - 1.45 * u},${cy + 0.2 * u} Z`}
            fill={k.light}
            stroke={k.line}
            strokeWidth={1}
            strokeLinejoin="round"
          />
          <path
            d={`M${x - 0.7 * u},${cy + 0.5 * u} v${0.55 * u} M${x},${cy + 0.6 * u} v${0.65 * u} M${x + 0.7 * u},${cy + 0.5 * u} v${0.55 * u}`}
            stroke={k.line}
            strokeWidth={0.7}
          />
        </g>
      );
    },
    // No shadow: the face is the first circle, so a rolled number's glow lands on it.
    token: ({ x, y, r }) => (
      <>
        <circle
          className="token-face"
          cx={x}
          cy={y}
          r={r}
          fill={k.face}
          stroke={k.line}
          strokeWidth={1.4}
        />
        <path d={circle(x, y, r - 2.6)} fill="none" stroke={k.red} strokeWidth={0.8} />
      </>
    ),
  };
}

function wonderSkin(id: string, name: string, description: string, k: Ink): Theme {
  const t = skin({
    id,
    name,
    description,
    terrain: k.land,
    sea: k.sea,
    seaEdge: k.seaLine,
    art: art(k),
    seaPattern: sea(k),
    rest: {
      token: k.face,
      tokenText: k.faceText,
      tokenHot: k.hot,
      outline: k.line,
      robber: k.cat,
      landStroke: k.line,
      landStrokeWidth: 2,
      harborWood: k.line,
      harborFace: k.face,
      harborText: k.faceText,
      pieceEffect: 'lift',
      tokenFont: "'Libre Caslon Text', Georgia, serif",
      pieces: pieces(k),
      boardBackground: k.sea,
    },
  });
  const own = t.patterns!;
  return {
    ...t,
    patterns: () => (
      <>
        <radialGradient id="wonder-wash" cx="0.38" cy="0.32" r="0.8">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.28" />
          <stop offset="0.6" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.1" />
        </radialGradient>
        {own()}
      </>
    ),
  };
}

export const wonderTeaBoard = wonderSkin(
  'wonder-tea',
  'Wonderland · Tea Party',
  'A storybook plate: soft washes, one inked icon, the Cheshire Cat as robber.',
  {
    land: {
      forest: '#7aa46c',
      hills: '#cf7d64',
      pasture: '#b9d595',
      fields: '#eccd84',
      mountains: '#aeb1c6',
      desert: '#f1e1b8',
    },
    line: '#2a2233',
    light: '#fffaf0',
    red: '#c0283e',
    cat: '#b0619a',
    catEye: '#f4d35e',
    sea: '#a6cfe0',
    seaLine: '#5a8eab',
    face: '#fffaf0',
    faceText: '#1c1626',
    hot: '#b3122e',
  },
);

export const wonderGlassBoard = wonderSkin(
  'wonder-glass',
  'Wonderland · Looking-Glass',
  'The storybook plate by twilight.',
  {
    land: {
      forest: '#46765f',
      hills: '#a8564c',
      pasture: '#76a274',
      fields: '#c9a85c',
      mountains: '#7d7ba0',
      desert: '#c9b893',
    },
    line: '#160f24',
    light: '#f6f0ff',
    red: '#ff7a9e',
    cat: '#a15aa0',
    catEye: '#f4d35e',
    sea: '#2e3870',
    seaLine: '#8a8fd0',
    face: '#f6f0ff',
    faceText: '#1b1432',
    hot: '#c2185b',
  },
);
