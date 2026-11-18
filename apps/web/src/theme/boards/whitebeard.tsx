import type { ReactNode } from 'react';
import type { Theme, ThemePieces } from '../clean.ts';
import { resourceIcon } from './icons.tsx';
import { POP_ICONS } from './iconSets.ts';
import { artFor } from './art.ts';
import { BASE, H, seaTile, skin, W, type BaseType } from './kit.tsx';

/**
 * Grand Line · Whitebeard Pirates: the old man's territory inked as sailor's tattoo flash. Bold
 * black lines, flat red, teal and mustard, a shine stroke on every land, and a sea of curling
 * tattoo waves. Number discs are red-rimmed badges, cities are Moby Dick (a whale with a deck),
 * and the robber is the darkness that swallowed everything: a black hole with a purple edge.
 */

interface Ink {
  land: Record<BaseType, string>;
  ink: string;
  paper: string;
  red: string;
  sea: string;
  crest: string;
  dark: string;
  darkEdge: string;
}

function art(k: Ink): Record<BaseType, ReactNode> {
  const tile = (type: BaseType) => (
    <>
      <rect width={W} height={H} fill={k.land[type]} />
      {/* The tattooist's shine: one white stroke and a dot, up on the left. */}
      <path
        d="M18,46 Q24,30 40,24"
        fill="none"
        stroke={k.paper}
        strokeOpacity={0.7}
        strokeWidth={3.2}
        strokeLinecap="round"
      />
      <circle cx={46} cy={21.5} r={1.8} fill={k.paper} fillOpacity={0.7} />
      {resourceIcon(
        type,
        { body: k.paper, line: k.ink, solid: k.ink, grain: k.paper, width: 2.2 },
        POP_ICONS,
      )}
    </>
  );
  return Object.fromEntries(BASE.map((t) => [t, tile(t)])) as Record<BaseType, ReactNode>;
}

function sea(k: Ink): ReactNode {
  // A tattoo wave: a crest that curls over into a little spiral.
  const crest = (x: number, y: number, key: string) => (
    <path
      key={key}
      d={`M${x},${y} c6,-10 18,-12 24,-3 c-5,-4 -11,-2 -10,3 c1,3 5,3 6,0`}
      transform={`translate(0 0)`}
      fill="none"
      stroke={k.crest}
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
  return seaTile(84, 64, [
    <rect key="bg" width={84} height={64} fill={k.sea} />,
    crest(6, 24, 'a'),
    crest(48, 56, 'b'),
  ]);
}

function pieces(k: Ink): ThemePieces {
  const edge = { stroke: k.ink, strokeWidth: 2.4, strokeLinejoin: 'round' as const };
  const shine = {
    stroke: k.paper,
    strokeOpacity: 0.75,
    strokeWidth: 1.4,
    strokeLinecap: 'round' as const,
  };
  return {
    house: ({ x, y, color, city, s }) => {
      const u = s * 0.1;
      if (!city) {
        const d = `M${x - 1.6 * u},${y + 1.7 * u} V${y - 0.2 * u} L${x},${y - 1.9 * u} L${x + 1.6 * u},${y - 0.2 * u} V${y + 1.7 * u} Z`;
        return (
          <g>
            <path d={d} fill={color} {...edge} />
            <path d={`M${x - 1.1 * u},${y + 1.2 * u} V${y}`} fill="none" {...shine} />
            <rect x={x + 0.1 * u} y={y + 0.5 * u} width={0.9 * u} height={1.2 * u} fill={k.ink} />
          </g>
        );
      }
      // Moby Dick: a whale's head for a bow, a deck on its back, a mast with the black flag.
      const whale = `M${x + 3 * u},${y + 0.4 * u} C${x + 3 * u},${y - 1.2 * u} ${x + 1.6 * u},${y - 1.3 * u} ${x + 0.4 * u},${y - 1 * u} H${x - 2.2 * u} L${x - 3.2 * u},${y - 1.9 * u} L${x - 2.8 * u},${y + 0.2 * u} C${x - 2.4 * u},${y + 1.8 * u} ${x + 2.6 * u},${y + 2 * u} ${x + 3 * u},${y + 0.4 * u} Z`;
      return (
        <g>
          <path d={`M${x - 0.6 * u},${y - 1 * u} V${y - 3.4 * u}`} {...edge} />
          <path
            d={`M${x - 0.6 * u},${y - 3.4 * u} h${1.5 * u} v${0.9 * u} h${-1.5 * u} Z`}
            fill={k.ink}
          />
          <path d={whale} fill={color} {...edge} />
          <path
            d={`M${x + 1.4 * u},${y + 0.9 * u} Q${x + 2.3 * u},${y + 1.1 * u} ${x + 2.7 * u},${y + 0.6 * u}`}
            fill="none"
            stroke={k.ink}
            strokeWidth={1.2}
          />
          <circle cx={x + 1.9 * u} cy={y - 0.15 * u} r={0.3 * u} fill={k.ink} />
          <path d={`M${x - 1.8 * u},${y - 0.3 * u} H${x + 0.4 * u}`} fill="none" {...shine} />
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
          strokeWidth={s * 0.2}
          strokeLinecap="round"
        />
        <line
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke={color}
          strokeWidth={s * 0.11}
          strokeLinecap="round"
        />
      </>
    ),
    robber: ({ x, y, s }) => {
      const u = s * 0.1;
      // The darkness: a black whirl with a purple rim, dripping onto the field.
      return (
        <g>
          <ellipse cx={x} cy={y + 1.5 * u} rx={2.6 * u} ry={0.6 * u} fill={k.dark} opacity={0.5} />
          <path
            d={`M${x - 2.6 * u},${y} C${x - 2.8 * u},${y - 2.4 * u} ${x + 2.8 * u},${y - 2.6 * u} ${x + 2.6 * u},${y} C${x + 2.5 * u},${y + 1 * u} ${x + 1.8 * u},${y + 1.2 * u} ${x + 1.6 * u},${y + 2 * u} C${x + 1.2 * u},${y + 1.2 * u} ${x + 0.4 * u},${y + 1.4 * u} ${x},${y + 1.9 * u} C${x - 0.4 * u},${y + 1.2 * u} ${x - 1.4 * u},${y + 1.3 * u} ${x - 1.7 * u},${y + 1.7 * u} C${x - 2 * u},${y + 1 * u} ${x - 2.5 * u},${y + 0.8 * u} ${x - 2.6 * u},${y} Z`}
            fill={k.dark}
            stroke={k.darkEdge}
            strokeWidth={1.8}
            strokeLinejoin="round"
          />
          <path
            d={`M${x + 1.4 * u},${y - 0.6 * u} A${1.4 * u},${1.2 * u} 0 1 0 ${x},${y + 0.5 * u} A${0.8 * u},${0.7 * u} 0 1 1 ${x + 0.7 * u},${y - 0.5 * u}`}
            fill="none"
            stroke={k.darkEdge}
            strokeWidth={1.4}
            strokeLinecap="round"
          />
        </g>
      );
    },
    token: ({ x, y, r }) => (
      <>
        <circle
          className="token-face"
          cx={x}
          cy={y}
          r={r}
          fill={k.red}
          stroke={k.ink}
          strokeWidth={2.4}
        />
        <circle cx={x} cy={y} r={r * 0.8} fill={k.paper} stroke={k.ink} strokeWidth={1.6} />
      </>
    ),
  };
}

function whitebeardSkin(id: string, name: string, k: Ink): Theme {
  return skin({
    id,
    name,
    description:
      'Sailor tattoo flash: bold ink, curling waves, Moby Dick cities, a darkness robber.',
    terrain: k.land,
    sea: k.sea,
    seaEdge: k.ink,
    art: art(k),
    seaPattern: sea(k),
    paintings: artFor('whitebeard'),
    rest: {
      token: k.paper,
      tokenText: k.ink,
      tokenHot: k.red,
      outline: k.ink,
      robber: k.dark,
      landStroke: k.ink,
      landStrokeWidth: 3.2,
      harborWood: k.ink,
      harborFace: k.paper,
      harborText: k.ink,
      pieceEffect: 'lift',
      tokenFont: "'Bitter', Georgia, serif",
      pieces: pieces(k),
      boardBackground: k.sea,
    },
  });
}

export const whitebeardBoard = whitebeardSkin(
  'whitebeard-moby',
  'Grand Line · Whitebeard Pirates',
  {
    land: {
      forest: '#2f7a5a',
      hills: '#c8552f',
      pasture: '#97c25e',
      fields: '#e8b63a',
      mountains: '#8a8f9c',
      desert: '#e9d5a6',
    },
    ink: '#1a1414',
    paper: '#faf3e3',
    red: '#b8322a',
    sea: '#2a8a86',
    crest: '#e9f4ee',
    dark: '#140b17',
    darkEdge: '#8a5ab8',
  },
);
