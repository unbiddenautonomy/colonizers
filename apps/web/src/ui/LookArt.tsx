import { useLook } from '../theme/looks.tsx';
import { ChartArt, MasqueradeArt, SunriseArt } from './LookArtTables.tsx';
import { DecoArt, IslesArt, WonderArt } from './LookArtMore.tsx';
import {
  BigMomArt,
  HeartArt,
  NavyArt,
  StrawHatArt,
  WanoArt,
  WhitebeardArt,
} from './LookArtGrandLine.tsx';

/** Header art for the looks that have it, drawn in the look's own colours. */
export function LookArt() {
  const { look } = useLook();
  if (look.family === 'pop') return <PopArt />;
  if (look.family === 'deco') return <DecoArt />;
  if (look.family === 'wonderland') return <WonderArt />;
  if (look.family === 'isles') return <IslesArt />;
  if (look.family === 'sunrise') return <SunriseArt />;
  if (look.family === 'masquerade') return <MasqueradeArt />;
  if (look.family === 'chart') return <ChartArt />;
  if (look.family === 'strawhat') return <StrawHatArt />;
  if (look.family === 'heart') return <HeartArt />;
  if (look.family === 'whitebeard') return <WhitebeardArt />;
  if (look.family === 'bigmom') return <BigMomArt />;
  if (look.family === 'wano') return <WanoArt />;
  if (look.family === 'navy') return <NavyArt />;
  return null;
}

/**
 * Spot art for the looks that draw (Tabletop Pop). Plain shapes in the look's own colours, so
 * every scheme recolours it: a little island of hexes, a house, a boat on the waves and two dice.
 */
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
