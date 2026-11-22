import type { ReactNode } from 'react';
import type { Theme, ThemePieces } from '../clean.ts';
import { ICONS, resourceIcon } from './icons.tsx';
import { artFor } from './art.ts';
import { BASE, fill, H, seaTile, skin, W, type BaseType } from './kit.tsx';

/**
 * Boards that are all painting: each land a flat colour with its object painted on it, a painted
 * sea and painted pieces. The drawings here are only what shows while a painting loads, or if
 * one is missing: the flat colour with a plain icon.
 */
export interface PaintedSpec {
  id: string;
  name: string;
  description: string;
  /** The art folder, src/art/<folder>/. */
  folder: string;
  land: Record<BaseType, string>;
  sea: string;
  /** Rims, roads and the land edges. */
  ink: string;
  /** The robber's colour where it is drawn rather than painted. */
  robber: string;
  /** A number disc of the board's own, drawn under each number. */
  token?: ThemePieces['token'];
  /** Anything else for the theme, such as the number disc's colours and font. */
  rest?: Partial<Theme>;
}

function art(k: PaintedSpec): Record<BaseType, ReactNode> {
  const tile = (type: BaseType) => (
    <>
      {fill(k.land[type])}
      {resourceIcon(
        type,
        { body: '#ffffff', line: k.ink, solid: k.ink, grain: '#ffffff', width: 1.6 },
        ICONS,
      )}
    </>
  );
  return Object.fromEntries(BASE.map((t) => [t, tile(t)])) as Record<BaseType, ReactNode>;
}

function road(ink: string): NonNullable<ThemePieces['road']> {
  return ({ a, b, color, s }) => (
    <>
      <line
        x1={a.x}
        y1={a.y}
        x2={b.x}
        y2={b.y}
        stroke={ink}
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
  );
}

export function paintedBoard(k: PaintedSpec): Theme {
  return skin({
    id: k.id,
    name: k.name,
    description: k.description,
    terrain: k.land,
    sea: k.sea,
    seaEdge: k.ink,
    art: art(k),
    seaPattern: seaTile(W, H, <rect width={W} height={H} fill={k.sea} />),
    paintings: artFor(k.folder),
    rest: {
      outline: k.ink,
      robber: k.robber,
      landStroke: k.ink,
      landStrokeWidth: 2.2,
      harborWood: k.ink,
      harborFace: '#ffffff',
      harborText: k.ink,
      pieceEffect: 'lift',
      pieces: k.token ? { road: road(k.ink), token: k.token } : { road: road(k.ink) },
      boardBackground: k.sea,
      // The land's object sits in the top of the hex, the number below the centre.
      tokenDrop: 0.25,
      ...k.rest,
    },
  });
}
