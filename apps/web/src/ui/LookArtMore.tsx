/**
 * Header art for Grand Saloon, Wonderland and the Grand Line crews. All original drawings in
 * the look's colour tokens; the crews get an object of their own, never a crew emblem.
 */

const ink = 'var(--shell-ink)';

/** An ocean liner at night under a gold sunburst, with a stepped skyline on the shore. */
export function DecoArt() {
  const rays = Array.from({ length: 13 }, (_, i) => {
    const a = Math.PI + (Math.PI / 12) * i;
    return `M180 130 L${180 + Math.cos(a) * 170} ${130 + Math.sin(a) * 170}`;
  });
  return (
    <svg className="look-art" viewBox="0 0 360 200" aria-hidden="true">
      <defs>
        <linearGradient id="deco-gold" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#8c6a26" />
          <stop offset="0.35" stopColor="#f1d998" />
          <stop offset="0.6" stopColor="#c99a3e" />
          <stop offset="1" stopColor="#fff0bd" />
        </linearGradient>
        <clipPath id="deco-arch">
          <path d="M20 200 V130 A160 160 0 0 1 340 130 V200 Z" />
        </clipPath>
      </defs>
      <g clipPath="url(#deco-arch)">
        {rays.map((d) => (
          <path key={d} d={d} stroke="url(#deco-gold)" strokeWidth="1.2" opacity="0.7" />
        ))}
        <circle cx="180" cy="130" r="34" fill="none" stroke="url(#deco-gold)" strokeWidth="2" />
        <circle cx="180" cy="130" r="26" fill="url(#deco-gold)" opacity="0.9" />
      </g>
      <path
        d="M20 200 V130 A160 160 0 0 1 340 130 V200"
        fill="none"
        stroke="url(#deco-gold)"
        strokeWidth="2"
      />
      <path
        d="M30 200 V132 A150 150 0 0 1 330 132 V200"
        fill="none"
        stroke="url(#deco-gold)"
        strokeWidth="0.8"
      />
      {/* Liner */}
      <path
        d="M70 160 H300 L284 184 H92 Z"
        fill="var(--shell-card)"
        stroke="url(#deco-gold)"
        strokeWidth="2"
      />
      <path
        d="M100 160 V146 H270 V160"
        fill="var(--shell-card)"
        stroke="url(#deco-gold)"
        strokeWidth="1.6"
      />
      <path
        d="M130 146 V136 H240 V146"
        fill="var(--shell-card)"
        stroke="url(#deco-gold)"
        strokeWidth="1.4"
      />
      {[150, 185, 220].map((x) => (
        <g key={x}>
          <path
            d={`M${x} 136 L${x + 2} 108 H${x + 18} L${x + 20} 136 Z`}
            fill="var(--shell-accent)"
            stroke="url(#deco-gold)"
            strokeWidth="1.4"
          />
          <path d={`M${x + 2} 116 H${x + 18}`} stroke="var(--shell-card)" strokeWidth="3" />
        </g>
      ))}
      {Array.from({ length: 16 }, (_, i) => (
        <circle key={i} cx={104 + i * 11} cy={170} r={2.2} fill="url(#deco-gold)" />
      ))}
      {/* Water lines */}
      {[190, 196].map((y, i) => (
        <path
          key={y}
          d={`M${40 + i * 20} ${y} H${320 - i * 20}`}
          stroke="url(#deco-gold)"
          strokeWidth="1"
          opacity={0.7 - i * 0.3}
        />
      ))}
    </svg>
  );
}

/**
 * The Mad Tea Party, after Tenniel's 1865 drawings (long in the public domain): a laid table, the
 * Hatter's hat with its 10/6 ticket, the Dormouse asleep in the teapot, and the Cheshire Cat's
 * grin left hanging in the tree above.
 */
export function WonderArt() {
  const line = {
    stroke: ink,
    strokeWidth: 2,
    strokeLinejoin: 'round' as const,
    strokeLinecap: 'round' as const,
  };
  return (
    <svg className="look-art" viewBox="0 0 360 200" aria-hidden="true">
      {/* The tree's branch, reaching in from the right */}
      <path
        d="M362 18 C320 22 292 14 250 26 C226 33 210 30 192 22"
        fill="none"
        {...line}
        strokeWidth="5"
      />
      <path d="M300 18 C296 8 304 2 312 0" fill="none" {...line} strokeWidth="3" />
      {[
        [340, 14, -20],
        [318, 26, 30],
        [272, 14, -35],
        [236, 36, 25],
        [206, 18, -15],
      ].map(([x, y, r]) => (
        <ellipse
          key={`${x}`}
          cx={x}
          cy={y}
          rx="9"
          ry="4.5"
          transform={`rotate(${r} ${x} ${y})`}
          fill="var(--shell-good)"
          stroke={ink}
          strokeWidth="1.2"
        />
      ))}
      {/* The grin, and the eyes, with no cat */}
      <g opacity="0.92">
        <path
          d="M232 62 C250 84 290 84 308 62 C290 74 250 74 232 62 Z"
          fill="var(--shell-card)"
          {...line}
        />
        {[244, 254, 264, 274, 284, 294].map((x) => (
          <path
            key={x}
            d={`M${x} ${68 + (x > 254 && x < 290 ? 3 : 0)} v5`}
            stroke={ink}
            strokeWidth="1.2"
          />
        ))}
        {[252, 288].map((x) => (
          <g key={x}>
            <path
              d={`M${x - 9} 48 Q${x} 40 ${x + 9} 48 Q${x} 54 ${x - 9} 48 Z`}
              fill="var(--shell-pop)"
              {...line}
              strokeWidth="1.5"
            />
            <path d={`M${x} 43 V53`} stroke={ink} strokeWidth="2.2" strokeLinecap="round" />
          </g>
        ))}
      </g>
      {/* The table, its cloth hanging in scallops */}
      <path d="M14 146 H346 L352 160 H8 Z" fill="var(--shell-card)" {...line} />
      <path
        d="M8 160 H352 V176 q-11 10 -22 0 t-22 0 t-22 0 t-22 0 t-22 0 t-22 0 t-22 0 t-22 0 t-22 0 t-22 0 t-22 0 t-22 0 t-22 0 t-22 0 t-22 0 t-22 0 V160 Z"
        fill="var(--shell-sunk)"
        {...line}
      />
      <path d="M8 166 H352" stroke="var(--shell-accent)" strokeWidth="3" />
      {/* Cups and saucers, one knocked over */}
      <ellipse cx="44" cy="146" rx="20" ry="4" fill="var(--shell-card)" {...line} />
      <path
        d="M30 128 H58 C57 140 52 144 44 144 C36 144 31 140 30 128 Z"
        fill="var(--shell-card)"
        {...line}
      />
      <path d="M58 131 C66 130 66 140 56 140" fill="none" {...line} />
      <ellipse
        cx="44"
        cy="128"
        rx="14"
        ry="3"
        fill="var(--shell-good)"
        {...line}
        strokeWidth="1.5"
      />
      <g transform="rotate(80 98 140)">
        <path
          d="M84 126 H112 C111 138 106 142 98 142 C90 142 85 138 84 126 Z"
          fill="var(--shell-card)"
          {...line}
        />
      </g>
      <path
        d="M100 146 c6 -2 14 -1 22 0"
        stroke="var(--shell-good)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {/* Teapot, with the Dormouse asleep in it */}
      <path
        d="M118 112 C104 108 98 96 96 88 C106 92 112 100 124 104"
        fill="var(--shell-pop)"
        {...line}
      />
      <path d="M196 106 C214 104 214 132 194 128" fill="none" {...line} strokeWidth="3" />
      <ellipse cx="158" cy="122" rx="40" ry="24" fill="var(--shell-pop)" {...line} />
      <path d="M126 140 H190" stroke={ink} strokeWidth="2" />
      <path d="M134 104 C140 96 176 96 182 104" fill="var(--shell-card)" {...line} />
      <circle cx="148" cy="90" r="11" fill="var(--shell-muted)" {...line} />
      <circle cx="140" cy="80" r="5" fill="var(--shell-muted)" {...line} />
      <circle cx="156" cy="80" r="5" fill="var(--shell-muted)" {...line} />
      <path d="M142 91 q3 2 6 0 M150 91 q3 2 6 0" fill="none" stroke={ink} strokeWidth="1.3" />
      <text
        x="166"
        y="78"
        fontSize="11"
        fontStyle="italic"
        fill={ink}
        fontFamily="var(--shell-body)"
      >
        z
      </text>
      <text
        x="174"
        y="68"
        fontSize="9"
        fontStyle="italic"
        fill={ink}
        fontFamily="var(--shell-body)"
      >
        z
      </text>
      {/* A pocket watch, dropped beside the pot */}
      <circle cx="216" cy="140" r="9" fill="var(--shell-card)" {...line} />
      <path
        d="M216 140 V134 M216 140 L220 142"
        stroke={ink}
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <path d="M216 131 v-3" {...line} />
      {/* The Hatter's hat, priced 10/6 */}
      <path
        d="M262 92 C260 110 262 128 266 142 H318 C322 128 324 110 322 92 Z"
        fill={ink}
        {...line}
      />
      <ellipse cx="292" cy="92" rx="30" ry="6" fill={ink} {...line} />
      <path d="M264 128 H320 V138 H265 Z" fill="var(--shell-accent)" {...line} strokeWidth="1.5" />
      <ellipse cx="292" cy="144" rx="42" ry="7" fill={ink} {...line} />
      <g transform="rotate(-8 300 114)">
        <rect
          x="288"
          y="104"
          width="30"
          height="18"
          fill="var(--shell-card)"
          {...line}
          strokeWidth="1.5"
        />
        <text
          x="303"
          y="117"
          textAnchor="middle"
          fontSize="10.5"
          fontWeight="700"
          fill={ink}
          fontFamily="var(--shell-body)"
        >
          10/6
        </text>
      </g>
    </svg>
  );
}

/** A sea chart: three islands with depth lines, a dotted route, a little boat and a compass. */
export function IslesArt() {
  const line = {
    stroke: ink,
    strokeWidth: 2,
    strokeLinejoin: 'round' as const,
    strokeLinecap: 'round' as const,
  };
  const isle = (d: string, k: string) => (
    <g key={k}>
      {[3, 2, 1].map((n) => (
        <path
          key={n}
          d={d}
          fill="none"
          stroke="var(--shell-accent)"
          strokeOpacity={0.5 - n * 0.12}
          strokeWidth={n * 9}
          strokeLinejoin="round"
        />
      ))}
      <path d={d} fill="var(--shell-card)" {...line} />
    </g>
  );
  return (
    <svg className="look-art" viewBox="0 0 360 200" aria-hidden="true">
      {isle(
        'M34 120 C30 96 52 80 78 86 C96 90 102 74 122 80 C140 86 136 112 124 124 C112 138 84 132 66 142 C48 150 36 138 34 120 Z',
        'a',
      )}
      {isle(
        'M168 52 C176 36 204 34 214 46 C222 56 240 54 242 70 C244 86 220 92 204 88 C188 84 162 70 168 52 Z',
        'b',
      )}
      {isle(
        'M196 150 C200 136 222 132 232 140 C242 148 258 146 258 160 C258 174 236 178 220 174 C204 170 194 162 196 150 Z',
        'c',
      )}
      {/* Hexes on the big island: settled land */}
      {[
        [70, 106, 'var(--shell-good)'],
        [88, 116, 'var(--shell-pop)'],
        [104, 104, 'var(--shell-good)'],
      ].map(([x, y, c]) => (
        <polygon
          key={`${x}`}
          points={Array.from({ length: 6 }, (_, i) => {
            const a = (Math.PI / 3) * i - Math.PI / 2;
            return `${(x as number) + 9 * Math.cos(a)},${(y as number) + 9 * Math.sin(a)}`;
          }).join(' ')}
          fill={c as string}
          stroke={ink}
          strokeWidth="1.5"
        />
      ))}
      {/* A house on the far island */}
      <path
        d="M196 64 v-10 l8 -7 l8 7 v10 z"
        fill="var(--shell-card)"
        {...line}
        strokeWidth="1.6"
      />
      {/* The route and the boat on it */}
      <path
        d="M124 108 C150 104 158 90 176 82 M140 128 C160 140 176 150 198 152"
        fill="none"
        stroke={ink}
        strokeWidth="2"
        strokeDasharray="1 7"
        strokeLinecap="round"
      />
      <g transform="translate(160 132) rotate(8)">
        <path d="M-14 0 H14 L9 7 H-9 Z" fill="var(--shell-card)" {...line} strokeWidth="1.6" />
        <path d="M0 0 V-22" {...line} strokeWidth="1.6" />
        <path d="M2 -20 L14 -4 H2 Z" fill="var(--shell-pop)" {...line} strokeWidth="1.4" />
      </g>
      {/* Compass rose */}
      <g transform="translate(312 78)">
        <circle r="30" fill="none" stroke={ink} strokeWidth="1.2" />
        <circle r="24" fill="none" stroke={ink} strokeWidth="0.8" strokeDasharray="2 3" />
        <path d="M0 -34 L6 0 L0 34 L-6 0 Z" fill="var(--shell-card)" {...line} strokeWidth="1.4" />
        <path d="M-34 0 L0 6 L34 0 L0 -6 Z" fill="var(--shell-card)" {...line} strokeWidth="1.4" />
        <path
          d="M0 -34 L6 0 H-6 Z"
          fill="var(--shell-accent)"
          stroke={ink}
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        <text
          y="-40"
          textAnchor="middle"
          fontSize="12"
          fontWeight="700"
          fill={ink}
          fontFamily="var(--shell-heading)"
        >
          N
        </text>
      </g>
    </svg>
  );
}

/** A ship on a rolling sea with sails in the crew's colours, and the crew's own object. */
export function SeaArt({ crew }: { crew: string }) {
  const line = {
    stroke: ink,
    strokeWidth: 2.5,
    strokeLinejoin: 'round' as const,
    strokeLinecap: 'round' as const,
  };
  return (
    <svg className="look-art" viewBox="0 0 360 200" aria-hidden="true">
      {/* Sea */}
      <path
        d="M0 170 q22 -14 45 0 t45 0 t45 0 t45 0 t45 0 t45 0 t45 0 t45 0 V200 H0 Z"
        fill="var(--shell-good)"
        opacity="0.35"
      />
      <path
        d="M0 170 q22 -14 45 0 t45 0 t45 0 t45 0 t45 0 t45 0 t45 0 t45 0"
        fill="none"
        {...line}
      />
      <path
        d="M20 186 q18 -10 36 0 t36 0 t36 0 t36 0 t36 0 t36 0 t36 0 t36 0 t36 0"
        fill="none"
        stroke={ink}
        strokeWidth="1.5"
        opacity="0.5"
      />
      {/* Hull */}
      <path
        d="M70 140 H230 C226 160 210 170 186 170 H104 C86 170 74 160 70 140 Z"
        fill="var(--shell-card)"
        {...line}
      />
      <path d="M76 150 H224" stroke="var(--shell-accent)" strokeWidth="5" />
      <path d="M200 140 V128 H232 L238 140" fill="var(--shell-card)" {...line} />
      {/* Masts and sails */}
      <path d="M120 140 V36 M178 140 V52" {...line} />
      <path d="M100 52 Q120 70 100 96 H140 Q160 70 140 52 Z" fill="var(--shell-card)" {...line} />
      <path
        d="M96 100 Q120 118 96 132 H144 Q168 118 144 100 Z"
        fill="var(--shell-accent)"
        {...line}
      />
      <path d="M162 64 Q178 80 162 98 H194 Q210 80 194 64 Z" fill="var(--shell-pop)" {...line} />
      <path
        d="M160 102 Q178 116 160 132 H196 Q214 116 196 102 Z"
        fill="var(--shell-card)"
        {...line}
      />
      <path d="M120 36 L146 42 L120 48 Z" fill="var(--shell-accent)" {...line} />
      <CrewObject crew={crew} />
    </svg>
  );
}

function CrewObject({ crew }: { crew: string }) {
  const line = {
    stroke: ink,
    strokeWidth: 2.5,
    strokeLinejoin: 'round' as const,
    strokeLinecap: 'round' as const,
  };
  const at = 'translate(290 92)';
  switch (crew) {
    case 'crew-strawhat':
      // A straw hat with a red band.
      return (
        <g transform={at}>
          <ellipse cx="0" cy="18" rx="54" ry="16" fill="var(--shell-pop)" {...line} />
          <path d="M-28 16 C-28 -16 28 -16 28 16 Z" fill="var(--shell-pop)" {...line} />
          <path
            d="M-28 8 C-10 14 10 14 28 8 L28 16 C10 22 -10 22 -28 16 Z"
            fill="var(--shell-accent)"
            {...line}
          />
          {[-40, -24, 24, 40].map((x) => (
            <path key={x} d={`M${x} 14 l4 8`} stroke={ink} strokeWidth="1" opacity="0.5" />
          ))}
        </g>
      );
    case 'crew-donquixote':
      // A curling pink feather.
      return (
        <g transform={`${at} rotate(-20)`}>
          <path d="M0 50 C-4 10 10 -30 30 -50" fill="none" {...line} />
          {Array.from({ length: 9 }, (_, i) => {
            const y = 40 - i * 10;
            const x = 2 + i * 3;
            return (
              <g key={i}>
                <path
                  d={`M${x} ${y} q-26 -2 -34 -16`}
                  fill="none"
                  stroke="var(--shell-accent)"
                  strokeWidth="5"
                  strokeLinecap="round"
                />
                <path
                  d={`M${x} ${y} q22 -6 30 -22`}
                  fill="none"
                  stroke="var(--shell-pop)"
                  strokeWidth="5"
                  strokeLinecap="round"
                />
              </g>
            );
          })}
        </g>
      );
    case 'crew-bigmom':
      // A three-tier cake with a candle.
      return (
        <g transform={at}>
          <rect x="-46" y="10" width="92" height="28" rx="4" fill="var(--shell-accent)" {...line} />
          <rect x="-34" y="-14" width="68" height="24" rx="4" fill="var(--shell-card)" {...line} />
          <rect x="-22" y="-34" width="44" height="20" rx="4" fill="var(--shell-pop)" {...line} />
          <path
            d="M-46 18 q6 8 12 0 t12 0 t12 0 t12 0 t12 0 t12 0 t12 0 t12 0"
            fill="var(--shell-card)"
            stroke={ink}
            strokeWidth="1.5"
          />
          <path d="M0 -34 V-48" {...line} />
          <path d="M0 -50 c-5 -6 0 -12 0 -14 c0 2 5 8 0 14" fill="var(--shell-pop)" {...line} />
          <circle cx="-20" cy="-2" r="3" fill="var(--shell-good)" />
          <circle cx="16" cy="0" r="3" fill="var(--shell-accent)" />
        </g>
      );
    case 'crew-whitebeard':
      // A crescent moon over the water.
      return (
        <g transform={at}>
          <path
            d="M14 -40 A40 40 0 1 0 14 40 A30 30 0 1 1 14 -40 Z"
            fill="var(--shell-pop)"
            {...line}
          />
          <circle cx="-30" cy="-30" r="2" fill={ink} />
          <circle cx="36" cy="-10" r="2" fill={ink} />
        </g>
      );
    case 'crew-redhair':
      // A sabre, crossed with a bottle of grog.
      return (
        <g transform={at}>
          <path d="M-40 40 L30 -40" stroke={ink} strokeWidth="7" strokeLinecap="round" />
          <path
            d="M-40 40 L30 -40"
            stroke="var(--shell-card)"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="M-34 22 L-22 34"
            stroke="var(--shell-accent)"
            strokeWidth="6"
            strokeLinecap="round"
          />
          <path
            d="M20 -4 h14 v-14 h-6 v-10 h-2 v10 h-6 Z"
            fill="var(--shell-pop)"
            {...line}
            transform="rotate(20 27 -10)"
          />
        </g>
      );
    case 'crew-blackbeard':
      // A cherry pie with a slice gone.
      return (
        <g transform={at}>
          <path
            d="M-50 14 A50 18 0 0 0 50 14 V26 A50 18 0 0 1 -50 26 Z"
            fill="var(--shell-pop)"
            {...line}
          />
          <path d="M-50 14 A50 18 0 0 1 50 14 L0 14 Z" fill="var(--shell-accent)" {...line} />
          <path d="M0 14 L50 14 A50 18 0 0 1 20 -2 Z" fill="var(--shell-pop)" {...line} />
          {[-34, -18, -2].map((x) => (
            <path key={x} d={`M${x} 2 l14 10`} stroke={ink} strokeWidth="2" />
          ))}
          {[-40, -26, -12].map((x) => (
            <path key={x} d={`M${x} 12 l12 -10`} stroke={ink} strokeWidth="2" />
          ))}
          <circle cx="34" cy="-16" r="6" fill="var(--shell-pop)" {...line} />
          <circle cx="46" cy="-12" r="6" fill="var(--shell-pop)" {...line} />
          <path
            d="M34 -22 C36 -34 44 -36 48 -38 M46 -18 C46 -28 46 -32 48 -38"
            fill="none"
            {...line}
            strokeWidth="1.6"
          />
        </g>
      );
    case 'crew-rocks':
      // A sea stack under a storm cloud.
      return (
        <g transform={at}>
          <path
            d="M-36 52 L-26 6 L-14 -4 L-6 14 L6 -14 L22 8 L30 52 Z"
            fill="var(--shell-raised)"
            {...line}
          />
          <path d="M-20 20 l8 -6 M10 16 l8 8" stroke={ink} strokeWidth="1.4" />
          <path
            d="M-44 -40 C-48 -54 -30 -62 -20 -54 C-14 -68 12 -68 16 -52 C28 -58 44 -48 36 -36 Z"
            fill="var(--shell-card)"
            {...line}
          />
          <path
            d="M-2 -36 L-10 -18 H0 L-8 0 L12 -24 H2 L8 -36 Z"
            fill="var(--shell-accent)"
            {...line}
            strokeWidth="1.6"
          />
        </g>
      );
    case 'crew-heart':
      // A round-nosed submarine.
      return (
        <g transform={at}>
          <path
            d="M-50 10 C-50 -14 50 -14 56 10 C50 32 -50 32 -50 10 Z"
            fill="var(--shell-pop)"
            {...line}
          />
          <path d="M-10 -8 V-24 H14 V-8" fill="var(--shell-pop)" {...line} />
          <path d="M8 -24 V-34 H18" fill="none" {...line} />
          {[-28, -8, 12, 32].map((x) => (
            <circle key={x} cx={x} cy="10" r="5" fill="var(--shell-card)" {...line} />
          ))}
          <path d="M-56 4 L-66 -4 V24 L-56 16" fill="var(--shell-accent)" {...line} />
        </g>
      );
    default:
      return null;
  }
}
