/**
 * Header art for the three table themes (Sunrise Deck, Masquerade, Storm Chart), drawn in each
 * look's colour tokens plus the few colours that belong to the picture itself.
 */

const ink = 'var(--shell-ink)';

/** A little ship setting out on the swell as the sun comes up behind it. */
export function SunriseArt() {
  const line = { stroke: ink, strokeWidth: 3, strokeLinejoin: 'round' as const };
  const rays = Array.from({ length: 7 }, (_, i) => {
    const a = Math.PI + (Math.PI / 8) * (i + 1);
    return `M${262 + Math.cos(a) * 62} ${150 + Math.sin(a) * 62} L${262 + Math.cos(a) * 80} ${150 + Math.sin(a) * 80}`;
  }).join(' ');
  return (
    <svg className="look-art" viewBox="0 0 360 200" aria-hidden="true">
      <path d={rays} stroke={ink} strokeWidth={4} strokeLinecap="round" />
      <path d="M210 150 A52 52 0 0 1 314 150 Z" fill="var(--shell-pop)" {...line} />
      {/* The sea */}
      <path
        d="M6 150 q15 -10 30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 V196 H6 Z"
        fill="#3d9bd1"
        {...line}
      />
      <path
        d="M40 176 q10 -7 20 0 t20 0 M220 182 q10 -7 20 0 t20 0"
        fill="none"
        stroke="#bfe3f6"
        strokeWidth={3}
        strokeLinecap="round"
      />
      {/* The ship */}
      <path d="M128 140 V40" {...line} />
      <path d="M131 46 Q170 60 166 112 H131 Z" fill="var(--shell-card)" {...line} />
      <path d="M125 58 Q100 92 104 120 H125 Z" fill="var(--shell-card)" {...line} />
      <path d="M128 40 L150 46 L128 52 Z" fill="var(--shell-accent)" {...line} />
      <path d="M76 132 H186 Q182 154 162 160 H96 Q80 154 76 132 Z" fill="#8a5a2b" {...line} />
      <path d="M84 142 H180" stroke="#c08a55" strokeWidth={3} strokeLinecap="round" />
      <circle cx={112} cy={148} r={4} fill="var(--shell-card)" {...line} strokeWidth={2} />
      <circle cx={146} cy={148} r={4} fill="var(--shell-card)" {...line} strokeWidth={2} />
    </svg>
  );
}

const SPADE =
  'M0,-6 C3,-3 6,-1 6,2 C6,4.5 3.5,5.5 1.2,4 L2,7 H-2 L-1.2,4 C-3.5,5.5 -6,4.5 -6,2 C-6,-1 -3,-3 0,-6 Z';
const HEART =
  'M0,6 C-4,2.5 -6.5,0 -6.5,-2.5 C-6.5,-5.5 -2,-6.5 0,-3 C2,-6.5 6.5,-5.5 6.5,-2.5 C6.5,0 4,2.5 0,6 Z';
const DIAMOND = 'M0,-6.5 L5,0 L0,6.5 L-5,0 Z';

/** A mask held over a fanned hand of cards, with chips on the baize. */
export function MasqueradeArt() {
  const card = (deg: number, suit: string, colour: string) => (
    <g transform={`rotate(${deg} 170 230)`}>
      <rect
        x={136}
        y={64}
        width={68}
        height={98}
        rx={6}
        fill="#f4eef6"
        stroke="#0c060d"
        strokeWidth={2}
      />
      <rect
        x={142}
        y={70}
        width={56}
        height={86}
        rx={3}
        fill="none"
        stroke={colour}
        strokeOpacity={0.5}
      />
      <path d={suit} transform="translate(170 113) scale(2.6)" fill={colour} />
    </g>
  );
  const chip = (x: number, y: number, c: string) => (
    <g>
      <ellipse cx={x} cy={y + 6} rx={26} ry={9} fill="#0c060d" />
      <ellipse cx={x} cy={y} rx={26} ry={9} fill={c} stroke="#0c060d" strokeWidth={2} />
      <ellipse
        cx={x}
        cy={y}
        rx={20}
        ry={6.5}
        fill="none"
        stroke="#ffffff"
        strokeWidth={3}
        strokeDasharray="5 5"
        opacity={0.85}
      />
    </g>
  );
  return (
    <svg className="look-art" viewBox="0 0 360 200" aria-hidden="true">
      <ellipse cx={180} cy={186} rx={170} ry={22} fill="#0f3a36" stroke={ink} strokeWidth={1.2} />
      {card(-16, SPADE, '#0c060d')}
      {card(0, DIAMOND, '#c2185b')}
      {card(16, HEART, '#c2185b')}
      {chip(292, 168, 'var(--shell-pop)')}
      {chip(292, 154, 'var(--shell-accent)')}
      {chip(66, 170, '#39c6d6')}
      {/* The mask, on its stick, with a plume */}
      <path d="M232 70 L262 150" stroke={ink} strokeWidth={4} strokeLinecap="round" />
      <path
        d="M118 40 Q96 10 104 -2 Q120 18 128 38 Z"
        fill="var(--shell-pop)"
        stroke="#0c060d"
        strokeWidth={2}
      />
      <path
        d="M112 52 C114 26 156 26 180 42 C204 26 246 26 248 52 C246 80 206 86 190 66 Q180 58 170 66 C154 86 114 80 112 52 Z"
        fill="#0c060d"
        stroke={ink}
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      <ellipse cx={150} cy={54} rx={17} ry={8} fill="var(--shell-accent)" />
      <ellipse cx={210} cy={54} rx={17} ry={8} fill="var(--shell-accent)" />
      <path
        d="M128 44 q8 -8 18 -6 M232 44 q-8 -8 -18 -6"
        fill="none"
        stroke="var(--shell-pop)"
        strokeWidth={2}
      />
    </svg>
  );
}

/** A compass rose and rhumb lines over an engraved island, with a ship standing off. */
export function ChartArt() {
  const line = { stroke: ink, fill: 'none' };
  const rhumbs = Array.from({ length: 16 }, (_, i) => {
    const a = (Math.PI / 8) * i;
    return `M268 96 L${268 + Math.cos(a) * 260} ${96 + Math.sin(a) * 260}`;
  }).join(' ');
  const coast =
    'M28 132 C34 108 58 98 80 104 C92 82 122 78 136 94 C156 90 176 104 170 124 C184 136 172 160 148 158 C130 174 100 172 86 160 C64 168 38 158 28 132 Z';
  return (
    <svg className="look-art" viewBox="0 0 360 200" aria-hidden="true">
      <defs>
        <clipPath id="chart-art-clip">
          <rect width={360} height={200} />
        </clipPath>
        <pattern id="chart-art-hatch" width={6} height={6} patternUnits="userSpaceOnUse">
          <path d="M-1 7 L7 -1" stroke={ink} strokeOpacity={0.45} strokeWidth={0.8} />
        </pattern>
      </defs>
      <g clipPath="url(#chart-art-clip)">
        <path d={rhumbs} stroke={ink} strokeOpacity={0.18} strokeWidth={0.8} />
        {/* The island, with the coast drawn twice like an engraving */}
        <path d={coast} fill="var(--shell-raised)" stroke={ink} strokeWidth={1.6} />
        <path d={coast} fill="url(#chart-art-hatch)" />
        <path
          d={coast}
          {...line}
          strokeWidth={0.8}
          strokeOpacity={0.5}
          transform="translate(99 131) scale(1.12) translate(-99 -131)"
        />
        <path
          d="M70 128 l6 -12 l6 12 M96 122 l8 -16 l8 16 M120 130 l6 -12 l6 12"
          {...line}
          strokeWidth={1.4}
        />
        <text
          x={98}
          y={186}
          textAnchor="middle"
          fontFamily="var(--shell-body)"
          fontStyle="italic"
          fontSize={13}
          fill={ink}
        >
          the home isle
        </text>
        {/* The compass rose */}
        <circle cx={268} cy={96} r={58} {...line} strokeWidth={1.4} />
        <circle cx={268} cy={96} r={50} {...line} strokeWidth={0.8} strokeDasharray="2 4" />
        <path
          d="M268 30 L276 88 L334 96 L276 104 L268 162 L260 104 L202 96 L260 88 Z"
          fill="var(--shell-card)"
          stroke={ink}
          strokeWidth={1.4}
          strokeLinejoin="round"
        />
        <path
          d="M268 30 L276 88 L268 96 Z M334 96 L276 104 L268 96 Z M268 162 L260 104 L268 96 Z M202 96 L260 88 L268 96 Z"
          fill={ink}
        />
        <path d="M232 60 L262 96 L232 132 M304 60 L274 96 L304 132" {...line} strokeWidth={0.9} />
        <text
          x={268}
          y={24}
          textAnchor="middle"
          fontFamily="var(--shell-heading)"
          fontSize={14}
          fill={ink}
        >
          N
        </text>
        {/* A ship standing off */}
        <path
          d="M188 168 h30 l-5 7 h-20 z"
          fill="var(--shell-card)"
          stroke={ink}
          strokeWidth={1.3}
        />
        <path
          d="M203 168 v-22 M203 147 q10 6 8 18 h-8 M203 150 q-8 6 -7 16 h7"
          {...line}
          strokeWidth={1.3}
        />
        <path d="M176 182 q6 -4 12 0 t12 0 t12 0 t12 0" {...line} strokeWidth={1} />
      </g>
    </svg>
  );
}
