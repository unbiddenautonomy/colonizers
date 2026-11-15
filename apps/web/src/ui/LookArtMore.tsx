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

/** A tea party: a teapot pouring into a cup, a pocket watch and a fan of cards. */
export function WonderArt() {
  const line = {
    stroke: ink,
    strokeWidth: 2,
    strokeLinejoin: 'round' as const,
    strokeLinecap: 'round' as const,
  };
  return (
    <svg className="look-art" viewBox="0 0 360 200" aria-hidden="true">
      {/* Cards, fanned */}
      {[-18, -6, 6].map((r, i) => (
        <g key={r} transform={`rotate(${r} 300 170)`}>
          <rect x="276" y="70" width="52" height="76" rx="6" fill="var(--shell-card)" {...line} />
          <text
            x="286"
            y="88"
            fontSize="14"
            fill={i === 1 ? ink : 'var(--shell-accent)'}
            fontFamily="Georgia, serif"
          >
            {['♥', '♠', '♦'][i]}
          </text>
          <text
            x="302"
            y="118"
            fontSize="26"
            textAnchor="middle"
            fill={i === 1 ? ink : 'var(--shell-accent)'}
            fontFamily="Georgia, serif"
          >
            {['♥', '♠', '♦'][i]}
          </text>
        </g>
      ))}
      {/* Pocket watch on its chain */}
      <path d="M200 20 C210 40 196 52 206 70" fill="none" {...line} strokeDasharray="3 3" />
      <circle cx="210" cy="96" r="26" fill="var(--shell-card)" {...line} />
      <circle cx="210" cy="96" r="21" fill="none" stroke={ink} strokeWidth="0.8" />
      {Array.from({ length: 12 }, (_, i) => {
        const a = (Math.PI / 6) * i;
        return (
          <path
            key={i}
            d={`M${210 + Math.sin(a) * 17} ${96 - Math.cos(a) * 17} L${210 + Math.sin(a) * 20} ${96 - Math.cos(a) * 20}`}
            stroke={ink}
            strokeWidth="1.2"
          />
        );
      })}
      <path d="M210 96 L210 81 M210 96 L219 101" {...line} />
      <rect x="205" y="64" width="10" height="7" rx="2" fill="var(--shell-pop)" {...line} />
      {/* Teapot, tipped */}
      <g transform="rotate(-18 92 92)">
        <ellipse cx="92" cy="96" rx="40" ry="30" fill="var(--shell-pop)" {...line} />
        <path d="M52 92 C34 84 26 70 22 62 C34 66 44 76 56 84" fill="var(--shell-pop)" {...line} />
        <path d="M130 84 C150 80 150 112 128 108" fill="none" {...line} />
        <path d="M72 68 Q92 56 112 68" fill="var(--shell-card)" {...line} />
        <circle cx="92" cy="58" r="5" fill="var(--shell-accent)" {...line} />
        <path
          d="M68 104 q8 6 16 0 t16 0 t16 0"
          fill="none"
          stroke="var(--shell-card)"
          strokeWidth="2"
        />
      </g>
      {/* Pour */}
      <path
        d="M16 86 C12 112 40 128 56 140"
        fill="none"
        stroke="var(--shell-good)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {/* Cup and saucer */}
      <ellipse cx="62" cy="176" rx="40" ry="8" fill="var(--shell-card)" {...line} />
      <path
        d="M36 142 H88 C86 164 78 172 62 172 C46 172 38 164 36 142 Z"
        fill="var(--shell-card)"
        {...line}
      />
      <path d="M88 148 C102 146 102 162 86 162" fill="none" {...line} />
      <ellipse cx="62" cy="142" rx="26" ry="5" fill="var(--shell-good)" {...line} />
      <path d="M44 156 q6 -4 12 0 t12 0" fill="none" stroke="var(--shell-accent)" strokeWidth="2" />
      {/* Floating label */}
      <g transform="rotate(8 150 160)">
        <path d="M128 150 H186 V172 H128 L118 161 Z" fill="var(--shell-card)" {...line} />
        <circle cx="126" cy="161" r="2.4" fill={ink} />
        <text
          x="157"
          y="166"
          textAnchor="middle"
          fontSize="11"
          fontStyle="italic"
          fill={ink}
          fontFamily="'EB Garamond', Georgia, serif"
        >
          Play me
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
