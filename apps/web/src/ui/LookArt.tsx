import { useLook } from '../theme/looks.tsx';

/**
 * Spot art for the looks that draw (Tabletop Pop). Plain shapes in the look's own colours, so
 * every scheme recolours it: a little island of hexes, a house, a boat on the waves and two dice.
 */
export function LookArt() {
  const { look } = useLook();
  if (look.family === 'atlas') return <AtlasArt />;
  if (look.family !== 'pop') return null;
  return <PopArt />;
}

function PopArt() {
  const ink = 'var(--shell-ink)';
  const line = { stroke: ink, strokeWidth: 3, strokeLinejoin: 'round' as const };
  const hex = (cx: number, cy: number, r: number) =>
    Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI / 3) * i - Math.PI / 2;
      return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
    }).join(' ');
  return (
    <svg className="look-art" viewBox="0 0 360 200" aria-hidden="true">
      {/* Waves */}
      <path
        d="M10 168 q15 -12 30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0"
        fill="none"
        {...line}
      />
      <path
        d="M40 186 q15 -10 30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0"
        fill="none"
        stroke={ink}
        strokeWidth={2}
        opacity={0.4}
      />
      {/* Island */}
      <polygon points={hex(150, 110, 36)} fill="var(--shell-good)" {...line} />
      <polygon points={hex(212, 110, 36)} fill="var(--shell-pop)" {...line} />
      <polygon points={hex(181, 56, 36)} fill="var(--shell-accent)" {...line} />
      {/* Number token */}
      <circle cx={212} cy={112} r={13} fill="var(--shell-card)" {...line} />
      <text
        x={212}
        y={117}
        textAnchor="middle"
        fontFamily="var(--shell-heading)"
        fontWeight={700}
        fontSize={14}
        fill={ink}
      >
        8
      </text>
      {/* House */}
      <path d="M136 112 v-16 l12 -11 l12 11 v16 z" fill="var(--shell-card)" {...line} />
      <rect x={145} y={102} width={6} height={10} fill={ink} />
      {/* Tree on the top hex */}
      <path d="M181 74 v-8" {...line} fill="none" />
      <path d="M170 66 l11 -24 l11 24 z" fill="var(--shell-good)" {...line} />
      {/* Boat */}
      <path d="M268 160 h52 l-9 14 h-34 z" fill="var(--shell-card)" {...line} />
      <path d="M294 160 v-44" {...line} fill="none" />
      <path d="M296 120 l24 30 h-24 z" fill="var(--shell-accent)" {...line} />
      <path d="M292 124 l-20 26 h20 z" fill="var(--shell-pop)" {...line} />
      {/* Dice */}
      <g transform="rotate(-14 52 70)">
        <rect x={30} y={48} width={44} height={44} rx={9} fill="var(--shell-card)" {...line} />
        <circle cx={42} cy={60} r={4} fill={ink} />
        <circle cx={52} cy={70} r={4} fill={ink} />
        <circle cx={62} cy={80} r={4} fill={ink} />
      </g>
      <g transform="rotate(12 92 116)">
        <rect x={72} y={96} width={40} height={40} rx={8} fill="var(--shell-pop)" {...line} />
        <circle cx={84} cy={108} r={3.6} fill={ink} />
        <circle cx={100} cy={108} r={3.6} fill={ink} />
        <circle cx={84} cy={124} r={3.6} fill={ink} />
        <circle cx={100} cy={124} r={3.6} fill={ink} />
      </g>
      {/* Sparkles */}
      <path
        d="M262 40 l4 10 l10 4 l-10 4 l-4 10 l-4 -10 l-10 -4 l10 -4 z"
        fill="var(--shell-pop)"
        {...line}
      />
      <path
        d="M320 70 l2.5 6 l6 2.5 l-6 2.5 l-2.5 6 l-2.5 -6 l-6 -2.5 l6 -2.5 z"
        fill="var(--shell-accent)"
        stroke={ink}
        strokeWidth={2}
      />
    </svg>
  );
}

/** Atlas: a corner of a sea chart, with a compass rose, a coast, a route and a ship. */
function AtlasArt() {
  const ink = 'var(--shell-ink)';
  const rays = Array.from({ length: 16 }, (_, i) => {
    const a = (Math.PI / 8) * i;
    const long = i % 2 === 0;
    const r = long ? 58 : 36;
    const w = long ? 7 : 4;
    const x = Math.sin(a);
    const y = -Math.cos(a);
    const px = Math.cos(a);
    const py = Math.sin(a);
    return {
      d: `M${270 + x * r} ${100 + y * r} L${270 + px * w} ${100 + py * w} L270 100 Z`,
      d2: `M${270 + x * r} ${100 + y * r} L${270 - px * w} ${100 - py * w} L270 100 Z`,
      long,
    };
  });
  return (
    <svg className="look-art" viewBox="0 0 360 200" aria-hidden="true">
      {/* Coast, hatched inland */}
      <defs>
        <pattern
          id="atlas-hatch"
          width="6"
          height="6"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(35)"
        >
          <line x1="0" y1="0" x2="0" y2="6" stroke={ink} strokeWidth="0.8" opacity="0.45" />
        </pattern>
      </defs>
      <path
        d="M0 0 H150 C140 20 152 34 132 48 C118 58 126 78 104 86 C86 93 92 118 68 126 C48 133 40 160 18 166 C10 168 4 176 0 182 Z"
        fill="url(#atlas-hatch)"
        stroke={ink}
        strokeWidth="1.6"
      />
      <path
        d="M150 0 C140 20 152 34 132 48 C118 58 126 78 104 86 C86 93 92 118 68 126 C48 133 40 160 18 166"
        fill="none"
        stroke={ink}
        strokeWidth="0.8"
        strokeDasharray="1 4"
        transform="translate(8 6)"
      />
      {/* Route */}
      <path
        d="M60 150 C110 160 150 120 190 140 S250 175 300 170"
        fill="none"
        stroke="var(--shell-accent)"
        strokeWidth="2"
        strokeDasharray="6 5"
      />
      <path d="M296 164 l8 6 l-8 6" fill="none" stroke="var(--shell-accent)" strokeWidth="2" />
      <circle cx="60" cy="150" r="4" fill="var(--shell-accent)" />
      {/* Compass rose */}
      <circle cx="270" cy="100" r="64" fill="none" stroke={ink} strokeWidth="1" />
      <circle cx="270" cy="100" r="60" fill="none" stroke={ink} strokeWidth="0.6" />
      {rays.map((r, i) => (
        <g key={i}>
          <path d={r.d} fill={r.long ? ink : 'var(--shell-pop)'} />
          <path d={r.d2} fill="var(--shell-card)" stroke={ink} strokeWidth="0.6" />
        </g>
      ))}
      <circle cx="270" cy="100" r="5" fill="var(--shell-accent)" stroke={ink} />
      <text
        x="270"
        y="28"
        textAnchor="middle"
        fontFamily="var(--shell-heading)"
        fontSize="15"
        fill={ink}
      >
        N
      </text>
      {/* Ship */}
      <g transform="translate(150 118) rotate(-4)">
        <path d="M0 18 h40 l-7 9 h-26 z" fill="var(--shell-card)" stroke={ink} strokeWidth="1.5" />
        <path d="M20 18 v-30" stroke={ink} strokeWidth="1.5" />
        <path
          d="M21 -10 c10 4 12 14 10 24 h-10 z"
          fill="var(--shell-card)"
          stroke={ink}
          strokeWidth="1.3"
        />
        <path
          d="M19 -6 c-8 4 -10 12 -8 20 h8 z"
          fill="var(--shell-card)"
          stroke={ink}
          strokeWidth="1.3"
        />
        <path d="M20 -12 l8 3 l-8 3" fill="var(--shell-accent)" />
      </g>
      {/* Sea mark */}
      <text
        x="196"
        y="190"
        fontFamily="'IM Fell English', Georgia, serif"
        fontStyle="italic"
        fontSize="13"
        fill={ink}
        opacity="0.7"
      >
        Mare Incognitum
      </text>
    </svg>
  );
}
