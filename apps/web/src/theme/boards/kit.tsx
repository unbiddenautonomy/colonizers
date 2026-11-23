import type { ReactNode } from 'react';
import { cleanTheme, type Theme, type ThemePieces } from '../clean.ts';
import { drawnArt, drawnPatterns, type Palette } from '../motifs.tsx';
import { PALETTE as TILE_PALETTE } from '../tiles.tsx';
import type { ArtSet } from './art.ts';
import { LAND_ICON, RARE_LAND } from './landIcons.tsx';
import { BASE, H, W, type BaseType } from './hex.ts';
import { pieceFinish, type Finish } from '../finishStore.ts';

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
  /** Colours for the rarer lands (gold, volcano, lake …), over the shared ones. */
  rareLand?: Partial<Record<string, string>>;
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
const PIECE = { settlement: 0.5, city: 0.84, ship: 0.6, robber: 1 };
/** Where a painted robber stands: down the hex, and back from the board's own offset, which
 *  was set for a piece a third of this one's size and puts a whole figure on the hex's edge. */
const ROBBER_FOOT = 0.4;
const ROBBER_BACK = 0.09;

/** A colour as r, g, b in 0..1; grey when it can't be read. */
function rgb(color: string): [number, number, number] {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return [0.6, 0.6, 0.6];
  const h = m[1]!.length === 3 ? [...m[1]!].map((c) => c + c).join('') : m[1]!;
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
}

/** The ramp a grey turns into: black lines stay near black, whites take a pale tint. */
/**
 * The plain tint, for neutral figures: the greys lifted so the shading stays bright, multiplied
 * by the colour, with black lines kept black and a thin rim in the board's ink.
 */
function plainTint(
  href: string,
  x: number,
  y: number,
  size: number,
  color: string,
  rim: string,
  s: number,
  id: string,
) {
  return (
    <g>
      <filter id={id} colorInterpolationFilters="sRGB">
        <feComponentTransfer in="SourceGraphic" result="lit">
          <feFuncR type="gamma" exponent={0.55} />
          <feFuncG type="gamma" exponent={0.55} />
          <feFuncB type="gamma" exponent={0.55} />
        </feComponentTransfer>
        <feFlood floodColor={color} />
        <feBlend in2="lit" mode="multiply" />
        <feComposite in2="SourceAlpha" operator="in" result="piece" />
        <feComponentTransfer in="SourceAlpha" result="body">
          <feFuncA type="linear" slope={4} intercept={-2.4} />
        </feComponentTransfer>
        <feMorphology in="body" operator="dilate" radius={0.022 * s} result="grown" />
        <feFlood floodColor={rim} />
        <feComposite in2="grown" operator="in" result="rim" />
        <feMerge>
          <feMergeNode in="rim" />
          <feMergeNode in="piece" />
        </feMerge>
      </filter>
      <image
        href={href}
        x={x - size / 2}
        y={y - size}
        width={size}
        height={size}
        preserveAspectRatio="xMidYMax meet"
        filter={`url(#${id})`}
      />
    </g>
  );
}

function ramp(c: number, finish: Finish): string {
  const mix = (w: number) => c + (1 - c) * w;
  const steps =
    finish === 'lounge'
      ? [0.02, c * 0.2, c * 0.36, c * 0.52, c * 0.7, mix(0.08)]
      : [0.02, c * 0.25, c * 0.5, c * 0.75, c * 0.95, mix(0.15)];
  return steps.map((v) => v.toFixed(3)).join(' ');
}

/**
 * A painting in white and grey, finished in the player's colour, with a rim in the board's ink.
 * Enamel maps the greys onto a ramp of the colour and adds a gloss from the top left; Enamel +
 * glow adds a soft halo in the colour; Lounge jewel deepens the ramp and sets the piece in gold.
 */
function tinted(
  href: string,
  x: number,
  y: number,
  size: number,
  color: string,
  rim: string,
  s: number,
  finish: Finish | 'plain' = pieceFinish(),
) {
  const [r, g, b] = rgb(color);
  const id = `tint-${finish}-${color.replace(/[^a-z0-9]/gi, '')}-${rim.replace(/[^a-z0-9]/gi, '')}`;
  const light = <feDistantLight azimuth={225} elevation={42} />;
  if (finish === 'plain') return plainTint(href, x, y, size, color, rim, s, id);
  return (
    <g>
      <filter id={id} x="-40%" y="-40%" width="180%" height="180%" colorInterpolationFilters="sRGB">
        <feColorMatrix
          in="SourceGraphic"
          type="matrix"
          values="0.3 0.59 0.11 0 0  0.3 0.59 0.11 0 0  0.3 0.59 0.11 0 0  0 0 0 1 0"
          result="grey"
        />
        <feComponentTransfer in="grey" result="ramp">
          <feFuncR type="table" tableValues={ramp(r, finish)} />
          <feFuncG type="table" tableValues={ramp(g, finish)} />
          <feFuncB type="table" tableValues={ramp(b, finish)} />
        </feComponentTransfer>
        {/* Only the solid body counts as the piece: a faint fringe left from the painting's
            backdrop must not swell into a box around it. */}
        <feComponentTransfer in="SourceAlpha" result="body">
          <feFuncA type="linear" slope={4} intercept={-2.4} />
        </feComponentTransfer>
        <feGaussianBlur in="body" stdDeviation={0.045 * s} result="bump" />
        <feSpecularLighting
          in="bump"
          surfaceScale={4}
          specularConstant={0.9}
          specularExponent={22}
          lightingColor="#fff"
          result="shine"
        >
          {light}
        </feSpecularLighting>
        <feComposite in="shine" in2="body" operator="in" result="gloss" />
        <feComposite in="ramp" in2="gloss" operator="arithmetic" k2={1} k3={0.55} result="lit" />
        <feComposite in="lit" in2="SourceAlpha" operator="in" result="piece" />
        {/* A thin rim in the board's own ink, the same for every player, so the piece stands
            off any hex. */}
        <feMorphology in="body" operator="dilate" radius={0.02 * s} result="grown" />
        <feFlood floodColor={rim} />
        <feComposite in2="grown" operator="in" result="rim" />
        {finish === 'glow' && (
          <>
            <feGaussianBlur in="body" stdDeviation={0.09 * s} result="spread" />
            <feFlood floodColor={color} floodOpacity={0.95} />
            <feComposite in2="spread" operator="in" result="halo" />
            <feMerge>
              <feMergeNode in="halo" />
              <feMergeNode in="halo" />
              <feMergeNode in="rim" />
              <feMergeNode in="piece" />
            </feMerge>
          </>
        )}
        {finish === 'lounge' && (
          <>
            <feMorphology in="body" operator="dilate" radius={0.045 * s} result="trim" />
            <feFlood floodColor="#d9a93a" />
            <feComposite in2="trim" operator="in" result="goldBase" />
            <feGaussianBlur in="trim" stdDeviation={0.01 * s} result="trimBump" />
            <feSpecularLighting
              in="trimBump"
              surfaceScale={3}
              specularConstant={0.9}
              specularExponent={14}
              lightingColor="#fff4cf"
              result="trimShine"
            >
              {light}
            </feSpecularLighting>
            <feComposite in="trimShine" in2="trim" operator="in" result="sheen" />
            <feComposite
              in="goldBase"
              in2="sheen"
              operator="arithmetic"
              k2={1}
              k3={0.6}
              result="gold"
            />
            <feMorphology in="body" operator="dilate" radius={0.062 * s} result="outerShape" />
            <feFlood floodColor={rim} />
            <feComposite in2="outerShape" operator="in" result="outer" />
            <feMorphology in="body" operator="erode" radius={0.035 * s} result="core" />
            <feComposite in="body" in2="core" operator="out" result="edge" />
            <feGaussianBlur in="edge" stdDeviation={0.012 * s} result="edgeSoft" />
            <feFlood
              floodColor={`rgb(${[r, g, b].map((c) => Math.round((c + (1 - c) * 0.45) * 255)).join(',')})`}
              floodOpacity={0.7}
            />
            <feComposite in2="edgeSoft" operator="in" />
            <feComposite in2="SourceAlpha" operator="in" result="bevel" />
            <feMerge>
              <feMergeNode in="outer" />
              <feMergeNode in="gold" />
              <feMergeNode in="rim" />
              <feMergeNode in="piece" />
              <feMergeNode in="bevel" />
            </feMerge>
          </>
        )}
        {finish === 'enamel' && (
          <feMerge>
            <feMergeNode in="rim" />
            <feMergeNode in="piece" />
          </feMerge>
        )}
      </filter>
      {/* Room for the halo and the trim: an effect on a group around the piece (the board's
          lift) clips to the group's box, which would cut the glow off square. */}
      <rect
        x={x - size / 2 - 0.3 * s}
        y={y - size - 0.3 * s}
        width={size + 0.6 * s}
        height={size + 0.6 * s}
        fill="none"
      />
      <image
        href={href}
        x={x - size / 2}
        y={y - size}
        width={size}
        height={size}
        preserveAspectRatio="xMidYMax meet"
        filter={`url(#${id})`}
      />
    </g>
  );
}

/**
 * Painted pieces where there are paintings, drawn ones elsewhere. Settlements, cities and ships
 * are painted in white and grey and multiplied by the player's colour, so whites take the colour,
 * greys shade it and black lines stay black.
 */
function paintedPieces(p: ArtSet, drawn: ThemePieces | undefined, rim: string): ThemePieces {
  const out: ThemePieces = { ...drawn };
  if (p.settlement || p.city) {
    const draw = drawn?.house;
    out.house = (o) => {
      const href = o.city ? p.city : p.settlement;
      if (!href) return draw ? draw(o) : null;
      const size = (o.city ? PIECE.city : PIECE.settlement) * o.s;
      return tinted(href, o.x, o.y + 0.2 * o.s, size, o.color, rim, o.s);
    };
  }
  if (p.ship) {
    const href = p.ship;
    out.ship = ({ a, b, color, s }) =>
      tinted(
        href,
        (a.x + b.x) / 2,
        (a.y + b.y) / 2 + PIECE.ship * 0.28 * s,
        PIECE.ship * s,
        color,
        rim,
        s,
      );
  }
  // Any other painting in the folder, by its file name: knights, dragons, markers and the like.
  out.sprite = ({ key, x, y, size, color, plain, s }) => {
    const href = p[key];
    if (!href) return null;
    if (color) return tinted(href, x, y, size, color, rim, s, plain ? 'plain' : pieceFinish());
    return (
      <image
        href={href}
        x={x - size / 2}
        y={y - size}
        width={size}
        height={size}
        preserveAspectRatio="xMidYMax meet"
      />
    );
  };
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

/**
 * A rarer land on a board laid out with the picture on top and the number below: a flat colour
 * with a plain borderless icon where the base lands have their object. Lands with no icon of
 * their own keep a shrunken copy of the Tiles drawing.
 */
function iconHex(
  id: string,
  type: string,
  p: Palette,
  fillColor: string | undefined,
  painting: string | undefined,
): ReactNode {
  const own = LAND_ICON[type];
  const size = 0.56 * W;
  const cx = W / 2;
  // Its foot just clear of the lowered number disc.
  const cy = H / 2 - 0.55 * (H / 2);
  return (
    <pattern key={id} id={id} patternUnits="objectBoundingBox" width="1" height="1">
      <rect width={W} height={H} fill={fillColor ?? RARE_LAND[type] ?? p.base} />
      {painting && type !== 'hidden' ? (
        // A painted object, in the same spot as the base lands' objects.
        <image
          href={painting}
          x={cx - (0.32 * H) / 2}
          y={0.27 * H - (0.32 * H) / 2}
          width={0.32 * H}
          height={0.32 * H}
          preserveAspectRatio="xMidYMid meet"
        />
      ) : painting ? (
        <image href={painting} width={W} height={H} preserveAspectRatio="xMidYMid meet" />
      ) : type === 'hidden' ? (
        // Fog covers the whole unexplored hex, not one spot of it.
        <g transform={`scale(${W / 100} ${H / 100})`}>{own}</g>
      ) : own ? (
        <g transform={`translate(${cx - size / 2} ${cy - size / 2}) scale(${size / 100})`}>{own}</g>
      ) : (
        <g transform={`translate(${cx - (W / 2) * 0.36} ${cy - (H / 2) * 0.36}) scale(0.36)`}>
          {drawnArt(type, p)}
        </g>
      )}
    </pattern>
  );
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
      ...(spec.rest.tokenDrop ? RARE_LAND : {}),
      ...spec.rareLand,
      ...spec.terrain,
    },
    sea: spec.sea,
    seaEdge: spec.seaEdge,
    patterns: () => (
      <>
        {spec.rest.tokenDrop
          ? Object.entries(others).map(([t, p]) => {
              const tile = paint[`tile-${t.toLowerCase()}`];
              return tile
                ? paintedHex(`pat-${t}`, tile, spec.rareLand?.[t] ?? RARE_LAND[t] ?? p.base)
                : iconHex(`pat-${t}`, t, p, spec.rareLand?.[t], paint[`land-${t.toLowerCase()}`]);
            })
          : drawnPatterns(others)}
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
    painted,
    ...spec.rest,
    ...(painted
      ? { pieces: paintedPieces(paint, spec.rest.pieces, spec.rest.outline ?? cleanTheme.outline) }
      : {}),
  };
}
