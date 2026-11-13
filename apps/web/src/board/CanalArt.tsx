import { hexToPixel, type GameState, type HexState } from '@colonizers/engine';

/**
 * The Great Canal on the board: the planned route with its point chips, the
 * dug trench, and the water once the basin floods. Also the dry farmland
 * and the gold rivers on the small islands.
 */

type Pt = { x: number; y: number };

export interface CanalLink {
  /** Midpoints of the hex sides the canal enters and leaves by. */
  from: Pt;
  to: Pt;
}

/** For each canal hex, where its stretch of canal enters and leaves. */
export function canalLinks(state: GameState, S: number): Map<string, CanalLink> {
  const hexes = Object.values(state.hexes);
  const canal = hexes
    .filter((h) => typeof h.props?.canal === 'string')
    .sort((a, b) => Number(a.props?.canalStep ?? 0) - Number(b.props?.canalStep ?? 0));
  const out = new Map<string, CanalLink>();
  if (!canal.length) return out;
  const centre = (h: HexState) => hexToPixel(h.q, h.r, S);
  const touching = (a: HexState, b: HexState) => {
    const dq = a.q - b.q;
    const dr = a.r - b.r;
    return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr)) === 1;
  };
  const first = canal[0]!;
  const last = canal[canal.length - 1]!;
  const lake = hexes.find((h) => h.type === 'lake' && !h.props?.basin && touching(h, first));
  const basin = hexes.find((h) => h.props?.basin === true);
  const mid = (a: HexState, b: HexState): Pt => {
    const p = centre(a);
    const q = centre(b);
    return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
  };
  canal.forEach((h, i) => {
    const prev = i === 0 ? lake : canal[i - 1];
    const next = i === canal.length - 1 ? basin : canal[i + 1];
    const c = centre(h);
    out.set(h.id, {
      from: prev ? mid(h, prev) : c,
      to: next && (h !== last || touching(h, next)) ? mid(h, next) : c,
    });
  });
  return out;
}

export function CanalStretch({ hex, link, S }: { hex: HexState; link: CanalLink; S: number }) {
  const c = hexToPixel(hex.q, hex.r, S);
  const d = `M${link.from.x},${link.from.y} Q${c.x},${c.y} ${link.to.x},${link.to.y}`;
  const state = hex.props?.canal;
  if (state === 'dig') {
    // The route still to dig, and the two point chips waiting on it.
    return (
      <g pointerEvents="none">
        <path
          d={d}
          fill="none"
          stroke="#f3e3bd"
          strokeWidth={S * 0.16}
          strokeLinecap="round"
          opacity={0.8}
        />
        <path
          d={d}
          fill="none"
          stroke="#5a3d1e"
          strokeWidth={S * 0.08}
          strokeDasharray={`${S * 0.12} ${S * 0.08}`}
          strokeLinecap="round"
        />
        {[-1, 1].map((side) => (
          <g key={side}>
            <circle
              cx={c.x + side * S * 0.48}
              cy={c.y - S * 0.38}
              r={S * 0.14}
              fill="#e9c46a"
              stroke="#5a3d1e"
              strokeWidth={1.5}
            />
            <text
              x={c.x + side * S * 0.48}
              y={c.y - S * 0.38}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={S * 0.15}
              fontWeight={700}
              fill="#5a3d1e"
            >
              1
            </text>
          </g>
        ))}
        <title>Canal to dig: two active knights beside this hex dig it for 2 points</title>
      </g>
    );
  }
  const water = state === 'water';
  return (
    <g pointerEvents="none">
      <path
        d={d}
        fill="none"
        stroke={water ? '#1f5f99' : '#5a3d1e'}
        strokeWidth={S * 0.2}
        strokeLinecap="round"
      />
      <path
        d={d}
        fill="none"
        stroke={water ? '#6fb3e6' : '#a47a45'}
        strokeWidth={S * 0.12}
        strokeLinecap="round"
      />
      <title>{water ? 'The Great Canal, full of water' : 'Canal dug, waiting for water'}</title>
    </g>
  );
}

/** Cracked earth over farmland that is still dry. */
export function DryFarmland({ hex, S, points }: { hex: HexState; S: number; points: string }) {
  const c = hexToPixel(hex.q, hex.r, S);
  const crack = (dx: number, dy: number, rot: number) => (
    <path
      d={`M${c.x + dx},${c.y + dy} l${S * 0.12},${S * 0.05} l${S * 0.06},${S * 0.12} m${-S * 0.06},${-S * 0.12} l${S * 0.13},${-S * 0.04}`}
      transform={`rotate(${rot} ${c.x + dx} ${c.y + dy})`}
      fill="none"
      stroke="#6b4a24"
      strokeWidth={1.4}
      strokeLinecap="round"
    />
  );
  return (
    <g pointerEvents="none">
      <polygon points={points} fill="#c9a36b" opacity={0.55} />
      {crack(-S * 0.55, -S * 0.2, 10)}
      {crack(S * 0.2, -S * 0.6, 70)}
      {crack(S * 0.25, S * 0.35, -30)}
      {crack(-S * 0.45, S * 0.3, 130)}
      <title>Dry farmland: no grain until the canal floods the basin</title>
    </g>
  );
}

/** The dry basin waiting for the canal. */
export function DryBasin({ hex, S }: { hex: HexState; S: number }) {
  const c = hexToPixel(hex.q, hex.r, S);
  return (
    <g pointerEvents="none">
      <ellipse
        cx={c.x}
        cy={c.y}
        rx={S * 0.62}
        ry={S * 0.42}
        fill="#d9bf8c"
        stroke="#1f5f99"
        strokeWidth={2}
        strokeDasharray={`${S * 0.08} ${S * 0.06}`}
        opacity={0.9}
      />
      <title>The dry basin: it floods once the canal is finished</title>
    </g>
  );
}

/** A gold river across a small-island gold field. */
export function GoldRiver({ hex, S }: { hex: HexState; S: number }) {
  const c = hexToPixel(hex.q, hex.r, S);
  const w = S * 0.75;
  const d = `M${c.x - w},${c.y + S * 0.15} q${w / 2},${-S * 0.35} ${w},0 t${w},0`;
  return (
    <g pointerEvents="none">
      <path d={d} fill="none" stroke="#1f5f99" strokeWidth={S * 0.14} strokeLinecap="round" />
      <path d={d} fill="none" stroke="#f2c230" strokeWidth={S * 0.06} strokeLinecap="round" />
      <title>Gold river: a knight beside it pans 1 resource of your choice on every 8</title>
    </g>
  );
}

/** True while the farmland is still waiting for water. */
export function farmlandDry(state: GameState): boolean {
  const d = state.data['treasures-dragons'] as { flooded?: boolean } | undefined;
  return state.settings.tdaScenario === 'great-canal' && d?.flooded !== true;
}
