import { motionAttrs } from './motion.ts';
import type { ReactElement, ReactNode } from 'react';
import { hexToPixel, type GameState, type HexId } from '@colonizers/engine';

/** Explorers & Pirates on the board: pirate lairs, the crews storming them, and spice villages. */

interface EpView {
  lairs?: Record<string, Record<number, number>>;
  captured?: string[];
}

export function LairMarkers({
  state,
  S,
  color,
  paint,
}: {
  state: GameState;
  S: number;
  color: (seat: number | null) => string;
  /** The board's painting by name, foot at (x, y), `size` hexes tall; null if it has none. */
  paint?: (key: string, x: number, y: number, size: number) => ReactNode;
}) {
  const d = state.data['explorers-pirates'] as EpView | undefined;
  if (!d) return null;
  const marks: ReactElement[] = [];
  for (const h of Object.values(state.hexes)) {
    if (h.hidden || h.props?.village !== true) continue;
    const c = hexToPixel(h.q, h.r, S);
    const art = paint?.('village', c.x, c.y - S * 0.2, 0.5) ?? null;
    if (art) {
      marks.push(
        <g key={`village-${h.id}`} pointerEvents="none" className="village">
          {art}
          <title>Spice village: a ship beside it buys spice for 2 gold</title>
        </g>,
      );
      continue;
    }
    marks.push(
      <g key={`village-${h.id}`} pointerEvents="none" className="village">
        <circle
          cx={c.x}
          cy={c.y - S * 0.42}
          r={S * 0.2}
          fill="#fbf6e9"
          stroke="#a8432a"
          strokeWidth={2}
        />
        <text x={c.x} y={c.y - S * 0.34} textAnchor="middle" fontSize={S * 0.22}>
          🌶️
        </text>
        <title>Spice village: a ship beside it buys spice for 2 gold</title>
      </g>,
    );
  }
  for (const [id, crews] of Object.entries(d.lairs ?? {})) {
    const h = state.hexes[id as HexId];
    if (!h || h.hidden || h.type === 'hidden') continue;
    const c = hexToPixel(h.q, h.r, S);
    const dots = Object.entries(crews).flatMap(([seat, n]) =>
      Array.from({ length: n }, () => Number(seat)),
    );
    marks.push(
      <g
        key={`lair-${id}`}
        pointerEvents="none"
        className="lair"
        {...motionAttrs(`lair-${id}`, `lair:${id}`, c.x, c.y - S * 0.42)}
      >
        <circle
          cx={c.x}
          cy={c.y - S * 0.42}
          r={S * 0.2}
          fill="#1d1d1d"
          stroke="#f1e3c8"
          strokeWidth={2}
        />
        <text x={c.x} y={c.y - S * 0.35} textAnchor="middle" fontSize={S * 0.22} fill="#f1e3c8">
          ☠
        </text>
        {[0, 1, 2].map((i) => (
          <circle
            key={i}
            cx={c.x + (i - 1) * S * 0.2}
            cy={c.y + S * 0.48}
            r={S * 0.075}
            fill={dots[i] === undefined ? 'rgba(0,0,0,0.25)' : color(dots[i]!)}
            stroke="#f1e3c8"
            strokeWidth={1.5}
            // A crew landing drops onto its place.
            {...(dots[i] === undefined
              ? {}
              : motionAttrs(
                  `crew-${id}-${i}`,
                  `crew:${id}:${i}`,
                  c.x + (i - 1) * S * 0.2,
                  c.y + S * 0.48,
                ))}
          />
        ))}
        <title>{`Pirate lair: ${dots.length} of 3 crews have landed. The third captures it.`}</title>
      </g>,
    );
  }
  for (const id of d.captured ?? []) {
    const h = state.hexes[id as HexId];
    if (!h) continue;
    const c = hexToPixel(h.q, h.r, S);
    marks.push(
      <g
        key={`won-${id}`}
        pointerEvents="none"
        {...motionAttrs(`won-${id}`, `won:${id}`, c.x, c.y - S * 0.36)}
      >
        <text x={c.x} y={c.y - S * 0.36} textAnchor="middle" fontSize={S * 0.26}>
          🚩
        </text>
        <title>Captured lair: this gold field pays 2 gold to each building beside it</title>
      </g>,
    );
  }
  return <>{marks}</>;
}
