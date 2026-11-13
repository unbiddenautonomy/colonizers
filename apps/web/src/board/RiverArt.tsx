import { hexToPixel, type HexState } from '@colonizers/engine';

/**
 * Greed, Wealth & Power's river: a blue river across three hexes and the
 * swampland. Each stretch runs from the side shared with the next river hex
 * through the middle, so neighbouring stretches join up.
 */

type Pt = { x: number; y: number };

const RUN = ['mountains', 'hills', 'pasture'];

/** The river's hexes in the order it runs: swampland, then ore, brick and wool. */
export function riverRun(hexes: readonly HexState[]): HexState[] {
  const swamp = hexes.filter((h) => h.props?.swampland === true);
  const river = RUN.flatMap((t) => hexes.filter((h) => h.type === t && h.props?.gwpRiver === true));
  return [...swamp, ...river];
}

const touching = (a: HexState, b: HexState) =>
  Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs(a.q + a.r - b.q - b.r)) === 1;

/**
 * Where the river enters and leaves this hex: the sides it shares with the
 * hexes before and after it on the run, or straight across for an end.
 */
function ends(hex: HexState, run: readonly HexState[], S: number): [Pt, Pt] {
  const c = hexToPixel(hex.q, hex.r, S);
  const i = run.findIndex((h) => h.id === hex.id);
  const side = (n: HexState | undefined): Pt | null => {
    if (!n || !touching(n, hex)) return null;
    const o = hexToPixel(n.q, n.r, S);
    return { x: (c.x + o.x) / 2, y: (c.y + o.y) / 2 };
  };
  const away = (p: Pt): Pt => ({ x: 2 * c.x - p.x, y: 2 * c.y - p.y });
  const a = side(run[i - 1]);
  const b = side(run[i + 1]);
  if (a && b) return [a, b];
  if (a) return [a, away(a)];
  if (b) return [away(b), b];
  const w = { x: c.x - S * 0.75, y: c.y + S * 0.43 };
  return [w, away(w)];
}

export function RiverHex({ hex, run, S }: { hex: HexState; run: readonly HexState[]; S: number }) {
  const c = hexToPixel(hex.q, hex.r, S);
  const [a, b] = ends(hex, run, S);
  // A gentle S through the middle, so it reads as a river and neighbouring stretches meet.
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const px = (-(b.y - a.y) / len) * S * 0.18;
  const py = ((b.x - a.x) / len) * S * 0.18;
  const p1 = { x: (a.x + c.x) / 2 + px, y: (a.y + c.y) / 2 + py };
  const p2 = { x: (c.x + b.x) / 2 - px, y: (c.y + b.y) / 2 - py };
  const d = `M${a.x},${a.y} C${p1.x},${p1.y} ${p2.x},${p2.y} ${b.x},${b.y}`;
  const swamp = hex.props?.swampland === true;
  return (
    <g pointerEvents="none" aria-hidden="true">
      {swamp && (
        <>
          <ellipse cx={c.x} cy={c.y} rx={S * 0.66} ry={S * 0.44} fill="#6f8f5a" opacity={0.55} />
          {[-0.38, -0.12, 0.16, 0.4].map((dx, i) => (
            <path
              key={i}
              d={`M${c.x + S * dx},${c.y + S * 0.38} l${S * 0.03},${-S * 0.24} m${-S * 0.06},${S * 0.06} l${S * 0.02},${-S * 0.16}`}
              stroke="#3f5a2f"
              strokeWidth={S * 0.035}
              strokeLinecap="round"
              fill="none"
            />
          ))}
        </>
      )}
      <path
        d={d}
        fill="none"
        stroke="#1f5f99"
        strokeWidth={S * 0.16}
        strokeLinecap="round"
        opacity={0.85}
      />
      <path
        d={d}
        fill="none"
        stroke="#7cc3ee"
        strokeWidth={S * 0.06}
        strokeLinecap="round"
        strokeDasharray={`${S * 0.12} ${S * 0.1}`}
      />
    </g>
  );
}

export function riverTitle(hex: HexState): string | null {
  if (hex.props?.swampland === true) return 'Swampland: no number; the robber starts here';
  if (hex.props?.gwpRiver === true)
    return `${hex.type} on the river: a Monument can stand here, and with one your cities here make Gold`;
  return null;
}
