import type { ReactNode } from 'react';
import { cleanTheme, type Theme, type ThemePieces } from '../clean.ts';
import { drawnPatterns } from '../motifs.tsx';
import { PALETTE as TILE_PALETTE } from '../tiles.tsx';
import type { ArtSet } from './art.ts';

/**
 * Shared pieces for the hand-drawn board skins. Each skin draws its own picture for the six base
 * hexes and the sea; rarer hex types (gold, volcano, lakes and so on) use the Tiles drawings so
 * every map still works.
 */

/** A hex's box at the board's hex size (60): 60·√3 wide, 120 tall, pointy top. */
export const W = 103.92;
export const H = 120;
export const CX = W / 2;
export const CY = H / 2;

export const BASE = ['forest', 'hills', 'pasture', 'fields', 'mountains', 'desert'] as const;
export type BaseType = (typeof BASE)[number];

/** A picture that fills one hex. */
export function hexPattern(id: string, body: ReactNode): ReactNode {
  return (
    <pattern key={id} id={id} patternUnits="objectBoundingBox" width="1" height="1">
      {body}
    </pattern>
  );
}

/** A small picture repeated across the whole sea, in board units. */
export function seaTile(w: number, h: number, body: ReactNode): ReactNode {
  return (
    <pattern key="pat-sea" id="pat-sea" patternUnits="userSpaceOnUse" width={w} height={h}>
      {body}
    </pattern>
  );
}

export const fill = (c: string) => <rect width={W} height={H} fill={c} />;

/** Rounds to one decimal for shorter paths. */
export const r1 = (n: number) => Math.round(n * 10) / 10;

/** A regular polygon's points. */
export function poly(cx: number, cy: number, r: number, n: number, rot = -90): string {
  return Array.from({ length: n }, (_, i) => {
    const a = ((rot + (360 / n) * i) * Math.PI) / 180;
    return `${r1(cx + r * Math.cos(a))},${r1(cy + r * Math.sin(a))}`;
  }).join(' ');
}

export interface SkinSpec {
  id: string;
  name: string;
  description: string;
  /** Flat colours for the base hexes (used for cards, the minimap and fallbacks). */
  terrain: Record<BaseType, string>;
  sea: string;
  seaEdge: string;
  /** The six base pictures and the sea. */
  art: Record<BaseType, ReactNode>;
  seaPattern: ReactNode;
  rest: Partial<Theme>;
  /** Painted artwork that replaces the drawings above, piece by piece (see art.ts). */
  paintings?: ArtSet;
}

/** A painting that fills one hex, cropped to cover it, over the flat colour while it loads. */
function paintedHex(id: string, href: string, under: string): ReactNode {
  return (
    <pattern key={id} id={id} patternUnits="objectBoundingBox" width="1" height="1">
      <rect width={W} height={H} fill={under} />
      <image href={href} width={W} height={H} preserveAspectRatio="xMidYMid slice" />
    </pattern>
  );
}

/** One repeat of a painted sea, in board units: a little wider than a hex. */
const SEA_REPEAT = 160;

/** Sizes of painted pieces, as a share of the hex size. */
const PIECE = { settlement: 0.54, city: 0.72, robber: 0.72 };

/**
 * Painted pieces where there are paintings, drawn ones elsewhere. Settlements and cities are
 * painted in white and grey and multiplied by the player's colour, so whites take the colour,
 * greys shade it and black lines stay black.
 */
function paintedPieces(p: ArtSet, drawn: ThemePieces | undefined): ThemePieces {
  const out: ThemePieces = { ...drawn };
  if (p.settlement || p.city) {
    const draw = drawn?.house;
    out.house = (o) => {
      const href = o.city ? p.city : p.settlement;
      if (!href) return draw ? draw(o) : null;
      const size = (o.city ? PIECE.city : PIECE.settlement) * o.s;
      const id = `tint-${o.color.replace(/[^a-z0-9]/gi, '')}`;
      return (
        <g>
          <filter id={id} colorInterpolationFilters="sRGB">
            <feFlood floodColor={o.color} />
            <feBlend in2="SourceGraphic" mode="multiply" />
            <feComposite in2="SourceAlpha" operator="in" />
          </filter>
          <image
            href={href}
            x={o.x - size / 2}
            y={o.y + 0.2 * o.s - size}
            width={size}
            height={size}
            preserveAspectRatio="xMidYMax meet"
            filter={`url(#${id})`}
          />
        </g>
      );
    };
  }
  if (p.robber) {
    const href = p.robber;
    out.robber = ({ x, y, s }) => {
      const size = PIECE.robber * s;
      return (
        <g>
          <ellipse cx={x} cy={y + 0.18 * s} rx={0.2 * s} ry={0.05 * s} fill="#000" opacity={0.35} />
          <image
            href={href}
            x={x - size / 2}
            y={y + 0.2 * s - size}
            width={size}
            height={size}
            preserveAspectRatio="xMidYMax meet"
          />
        </g>
      );
    };
  }
  if (p.token) {
    const href = p.token;
    // The face circle stays for the glow on a rolled number; the painting sits on it, cut round.
    out.token = ({ x, y, r }) => (
      <>
        <circle className="token-face" cx={x} cy={y} r={r} fill="none" stroke="none" />
        <image
          href={href}
          x={x - r}
          y={y - r}
          width={2 * r}
          height={2 * r}
          preserveAspectRatio="xMidYMid slice"
          clipPath="url(#token-disc)"
        />
      </>
    );
  }
  return out;
}

/** Builds a theme from a skin: its own seven pictures, Tiles drawings for everything else. */
export function skin(spec: SkinSpec): Theme {
  const paint = spec.paintings ?? {};
  const painted = Object.keys(paint).length > 0;
  const others = Object.fromEntries(
    Object.entries(TILE_PALETTE).filter(([t]) => !(BASE as readonly string[]).includes(t)),
  );
  return {
    ...cleanTheme,
    terrainIcons: false,
    hexInset: undefined,
    id: spec.id,
    name: spec.name,
    description: spec.description,
    terrain: {
      ...cleanTheme.terrain,
      ...Object.fromEntries(Object.entries(TILE_PALETTE).map(([k, p]) => [k, p.base])),
      ...spec.terrain,
    },
    sea: spec.sea,
    seaEdge: spec.seaEdge,
    patterns: () => (
      <>
        {drawnPatterns(others)}
        {BASE.map((t) => {
          const href = paint[t];
          return href
            ? paintedHex(`pat-${t}`, href, spec.terrain[t])
            : hexPattern(`pat-${t}`, spec.art[t]);
        })}
        {paint.sea ? (
          <pattern
            key="pat-sea"
            id="pat-sea"
            patternUnits="userSpaceOnUse"
            width={SEA_REPEAT}
            height={SEA_REPEAT}
          >
            <rect width={SEA_REPEAT} height={SEA_REPEAT} fill={spec.sea} />
            <image href={paint.sea} width={SEA_REPEAT} height={SEA_REPEAT} />
          </pattern>
        ) : (
          spec.seaPattern
        )}
        {paint.token && (
          <clipPath id="token-disc" clipPathUnits="objectBoundingBox">
            <circle cx={0.5} cy={0.5} r={0.5} />
          </clipPath>
        )}
      </>
    ),
    patterned: [...Object.keys(TILE_PALETTE), ...BASE, 'sea'],
    cards: {
      brick: spec.terrain.hills,
      lumber: spec.terrain.forest,
      wool: spec.terrain.pasture,
      grain: spec.terrain.fields,
      ore: spec.terrain.mountains,
    },
    ui: { '--sea': spec.sea },
    ...spec.rest,
    ...(painted ? { pieces: paintedPieces(paint, spec.rest.pieces) } : {}),
  };
}
