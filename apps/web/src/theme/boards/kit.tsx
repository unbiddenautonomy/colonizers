import type { ReactNode } from 'react';
import { cleanTheme, type Theme } from '../clean.ts';
import { drawnPatterns } from '../motifs.tsx';
import { PALETTE as TILE_PALETTE } from '../tiles.tsx';

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
}

/** Builds a theme from a skin: its own seven pictures, Tiles drawings for everything else. */
export function skin(spec: SkinSpec): Theme {
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
        {BASE.map((t) => hexPattern(`pat-${t}`, spec.art[t]))}
        {spec.seaPattern}
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
  };
}
