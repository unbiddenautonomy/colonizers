import type { ReactElement } from 'react';
import { hexToPixel, type GameState, type HexId } from '@colonizers/engine';

/** Explorers & Pirates on the board: pirate lairs and the crews storming them. */

interface EpView {
  lairs?: Record<string, Record<number, number>>;
  captured?: string[];
}

export function LairMarkers({
  state,
  S,
  color,
}: {
  state: GameState;
  S: number;
  color: (seat: number | null) => string;
}) {
  const d = state.data['explorers-pirates'] as EpView | undefined;
  if (!d) return null;
  const marks: ReactElement[] = [];
  for (const [id, crews] of Object.entries(d.lairs ?? {})) {
    const h = state.hexes[id as HexId];
    if (!h || h.hidden || h.type === 'hidden') continue;
    const c = hexToPixel(h.q, h.r, S);
    const dots = Object.entries(crews).flatMap(([seat, n]) =>
      Array.from({ length: n }, () => Number(seat)),
    );
    marks.push(
      <g key={`lair-${id}`} pointerEvents="none" className="lair">
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
      <g key={`won-${id}`} pointerEvents="none">
        <text x={c.x} y={c.y - S * 0.36} textAnchor="middle" fontSize={S * 0.26}>
          🚩
        </text>
        <title>Captured lair: this gold field pays 2 gold to each building beside it</title>
      </g>,
    );
  }
  return <>{marks}</>;
}
