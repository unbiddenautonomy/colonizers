import { hexToPixel, type GameState, type HexId } from '@colonizers/engine';
import { WONDERS, type WonderId } from '@colonizers/module-world-wonders';

/** World Wonders on the board: a plinth in the owner's colour, with a pip for each stage built. */

interface WonderView {
  wonders?: Partial<Record<WonderId, { owner: number; hex: HexId; stages: number }>>;
}

export function WonderMarkers({
  state,
  S,
  color,
  outline,
}: {
  state: GameState;
  S: number;
  color: (seat: number | null) => string;
  outline: string;
}) {
  const d = state.data['world-wonders'] as WonderView | undefined;
  if (!d?.wonders) return null;
  // Two wonders can share a hex: they sit side by side.
  const byHex = new Map<HexId, WonderId[]>();
  for (const [id, w] of Object.entries(d.wonders))
    if (w) byHex.set(w.hex, [...(byHex.get(w.hex) ?? []), id as WonderId]);
  return (
    <>
      {[...byHex].flatMap(([hex, ids]) => {
        const h = state.hexes[hex];
        if (!h) return [];
        const c = hexToPixel(h.q, h.r, S);
        return ids.map((id, i) => {
          const w = d.wonders![id]!;
          const x = c.x + (i - (ids.length - 1) / 2) * S * 0.5;
          const y = c.y + S * 0.47;
          const r = S * 0.17;
          return (
            <g key={id} className="wonder-marker" pointerEvents="none" filter="url(#lift)">
              <path
                d={`M${x - r * 1.25},${y + r * 0.9} L${x - r},${y - r} L${x + r},${y - r} L${x + r * 1.25},${y + r * 0.9} z`}
                fill={color(w.owner)}
                stroke={outline}
                strokeWidth={1.5}
              />
              <text x={x} y={y + r * 0.35} textAnchor="middle" fontSize={r * 1.15}>
                {WONDERS[id].icon}
              </text>
              {[0, 1, 2, 3].map((k) => (
                <circle
                  key={k}
                  cx={x + (k - 1.5) * r * 0.55}
                  cy={y + r * 1.3}
                  r={r * 0.2}
                  fill={k < w.stages ? color(w.owner) : '#fbf3e2'}
                  stroke={outline}
                  strokeWidth={1}
                />
              ))}
              <title>
                {`${WONDERS[id].name}: ${state.players[w.owner]?.name ?? ''}, ${w.stages} of 4 stages`}
              </title>
            </g>
          );
        });
      })}
    </>
  );
}
