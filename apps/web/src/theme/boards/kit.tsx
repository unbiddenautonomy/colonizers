import type { ReactNode } from 'react';
import { cleanTheme, type Theme, type ThemePieces } from '../clean.ts';
import { drawnPatterns } from '../motifs.tsx';
import { PALETTE as TILE_PALETTE } from '../tiles.tsx';
import type { ArtSet } from './art.ts';
import { BASE, H, W, type BaseType } from './hex.ts';

export { BASE, CX, CY, H, poly, r1, W, type BaseType } from './hex.ts';

/**
 * Shared pieces for the hand-drawn board skins. Each skin draws its own picture for the six base
 * hexes and the sea; rarer hex types (gold, volcano, lakes and so on) use the Tiles drawings so
 * every map still works.
 */

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
  /** Gradients and the like the skin's pieces refer to, defined once for the whole board. */
  defs?: ReactNode;
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

/**
 * Sizes of painted pieces, as a share of the hex size. A crew's settlement and city are often
 * the same kind of thing twice — two of its ships, say — so the gap between them has to carry
 * the difference on its own: at a glance across a board, size is what tells them apart.
 */
const PIECE = { settlement: 0.5, city: 0.84, robber: 1 };
/** Where a painted robber stands: down the hex, and back from the board's own offset, which
 *  was set for a piece a third of this one's size and puts a whole figure on the hex's edge. */
const ROBBER_FOOT = 0.4;
const ROBBER_BACK = 0.09;

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
    // A painted robber is usually a whole character rather than a token, so it is drawn about
    // half the height of a hex and stands well down it. At the old token's size it read as a
    // sticker dropped in the corner, next to a number disc nearly as big as it was.
    out.robber = ({ x, y, s }) => {
      const size = PIECE.robber * s;
      const foot = y + ROBBER_FOOT * s;
      const cx = x - ROBBER_BACK * s;
      return (
        <g>
          <ellipse cx={cx} cy={foot} rx={0.22 * s} ry={0.055 * s} fill="#000" opacity={0.35} />
          <image
            href={href}
            x={cx - size / 2}
            y={foot - size}
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
        {/* Always: a skin's own gradients are what its drawn pieces are painted with, and a
            drawing survives any painting but its own, so dropping these would leave a piece
            pointing at a gradient that is not there. */}
        {spec.defs}
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
