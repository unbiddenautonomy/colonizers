import type { ReactNode } from 'react';

/**
 * Header art for the Grand Line crews: each crew's ship in its own waters, under its own Jolly
 * Roger. Ships carry the class "rock" (a slow roll on the swell), flags "flag" (a flutter from
 * the pole), the submarine "bob" and its bubbles "rise". styles.css runs those animations and
 * stops them when animations are off. An animated group never has a transform attribute of its
 * own (CSS would replace it), so positioned pieces sit inside a plain wrapper.
 */

const ink = 'var(--shell-ink)';

/** A skull facing out, centred on (x, y) with cranium radius r. */
function skull(x: number, y: number, r: number, fill: string, hole: string): ReactNode {
  return (
    <>
      <circle cx={x} cy={y} r={r} fill={fill} />
      <rect
        x={x - r * 0.6}
        y={y + r * 0.45}
        width={r * 1.2}
        height={r * 0.65}
        rx={r * 0.2}
        fill={fill}
      />
      <circle cx={x - r * 0.38} cy={y + r * 0.08} r={r * 0.27} fill={hole} />
      <circle cx={x + r * 0.38} cy={y + r * 0.08} r={r * 0.27} fill={hole} />
      <path d={`M${x},${y + r * 0.38} l${-r * 0.13},${r * 0.24} h${r * 0.26} z`} fill={hole} />
    </>
  );
}

/** Two crossed bones behind a skull at (x, y). */
function bones(x: number, y: number, r: number, color: string): ReactNode {
  const knob = (bx: number, by: number) => (
    <>
      <circle cx={bx - r * 0.14} cy={by - r * 0.14} r={r * 0.2} fill={color} />
      <circle cx={bx + r * 0.14} cy={by + r * 0.14} r={r * 0.2} fill={color} />
    </>
  );
  return (
    <>
      <path
        d={`M${x - r * 1.5},${y - r} L${x + r * 1.5},${y + r * 1.7} M${x + r * 1.5},${y - r} L${x - r * 1.5},${y + r * 1.7}`}
        stroke={color}
        strokeWidth={r * 0.32}
        strokeLinecap="round"
      />
      {knob(x - r * 1.5, y - r)}
      {knob(x + r * 1.5, y - r)}
      {knob(x - r * 1.5, y + r * 1.7)}
      {knob(x + r * 1.5, y + r * 1.7)}
    </>
  );
}

/** A flag cloth from the pole at x, top y, w wide and h tall, with a slight belly. */
const cloth = (x: number, y: number, w: number, h: number) =>
  `M${x},${y} Q${x + w * 0.5},${y - h * 0.14} ${x + w},${y + h * 0.04} V${y + h * 1.02} Q${x + w * 0.5},${y + h * 0.86} ${x},${y + h} Z`;

/** Bubbles that drift up from below, each starting at its own moment. */
function bubbles(spots: [number, number, number][], stroke: string): ReactNode {
  return spots.map(([x, y, r], i) => (
    <circle
      key={i}
      className="rise"
      cx={x}
      cy={y}
      r={r}
      fill="none"
      stroke={stroke}
      strokeWidth={1.6}
      style={{ animationDelay: `${-i * 0.9}s` }}
    />
  ));
}

// ---- Straw Hat Pirates ----

/** The Sunny under full sail, lion at the bow, on a manga page with focus lines and a DON!! */
export function StrawHatArt() {
  const line = { stroke: ink, strokeWidth: 3, strokeLinejoin: 'round' as const };
  const rays = Array.from({ length: 22 }, (_, i) => {
    const a = (Math.PI * 2 * i) / 22;
    return `M${210 + Math.cos(a) * 70} ${90 + Math.sin(a) * 70} L${210 + Math.cos(a) * 200} ${90 + Math.sin(a) * 200}`;
  }).join(' ');
  const mane = Array.from({ length: 24 }, (_, i) => {
    const a = (Math.PI * 2 * i) / 24;
    const rr = i % 2 ? 15 : 22;
    return `${(300 + Math.cos(a) * rr).toFixed(1)},${(128 + Math.sin(a) * rr).toFixed(1)}`;
  }).join(' ');
  return (
    <svg className="look-art" viewBox="0 0 360 200" aria-hidden="true">
      <defs>
        <clipPath id="sh-art-clip">
          <rect width={360} height={200} />
        </clipPath>
      </defs>
      <g clipPath="url(#sh-art-clip)">
        <path d={rays} stroke={ink} strokeOpacity={0.14} strokeWidth={1.4} />
        <g transform="rotate(-9 64 52)">
          <text
            x={64}
            y={62}
            textAnchor="middle"
            fontFamily="var(--shell-heading)"
            fontSize={44}
            fill="var(--shell-pop)"
            stroke={ink}
            strokeWidth={2.4}
            paintOrder="stroke"
          >
            DON!!
          </text>
        </g>
        <g className="rock">
          {/* Mast, sail with the straw hat Jolly Roger, flag at the top */}
          <path d="M200 156 V30" {...line} />
          <path d="M158 50 Q200 42 242 50 V124 Q200 132 158 124 Z" fill="#ffffff" {...line} />
          {bones(200, 84, 13, '#141414')}
          {skull(200, 84, 13, '#141414', '#ffffff')}
          <ellipse cx={200} cy={74} rx={22} ry={5} fill="#f2c240" {...line} strokeWidth={2} />
          <path
            d="M188 74 Q188 58 200 58 Q212 58 212 74 Z"
            fill="#f2c240"
            {...line}
            strokeWidth={2}
          />
          <path d="M188.5 69 Q200 66 211.5 69" stroke="#d62828" strokeWidth={4} fill="none" />
          <g className="flag">
            <path d={cloth(200, 22, 34, 20)} fill="#141414" {...line} strokeWidth={2} />
            {skull(216, 31, 5, '#ffffff', '#141414')}
          </g>
          {/* Hull and the lion at the bow */}
          <path
            d="M108 148 H292 Q286 176 258 182 H140 Q114 176 108 148 Z"
            fill="#c98a4b"
            {...line}
          />
          <path d="M116 160 H284" stroke={ink} strokeWidth={2} strokeOpacity={0.5} />
          <circle cx={140} cy={168} r={4.5} fill="#ffffff" {...line} strokeWidth={2} />
          <circle cx={170} cy={168} r={4.5} fill="#ffffff" {...line} strokeWidth={2} />
          <polygon points={mane} fill="#f6a623" {...line} strokeWidth={2.4} />
          <circle cx={300} cy={128} r={12} fill="#ffe08a" {...line} strokeWidth={2.4} />
          <circle cx={295.5} cy={125} r={1.8} fill={ink} />
          <circle cx={304.5} cy={125} r={1.8} fill={ink} />
          <path d="M294 132 Q300 137 306 132" fill="none" stroke={ink} strokeWidth={2} />
        </g>
        {/* The sea in front, with the dot screen and wave strokes */}
        <path
          d="M0 174 q15 -9 30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 V200 H0 Z"
          fill="#3b9fe0"
          {...line}
        />
        <path
          d="M30 188 q8 -6 16 0 t16 0 M230 192 q8 -6 16 0 t16 0"
          fill="none"
          stroke="#ffffff"
          strokeWidth={2.4}
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}

// ---- Heart Pirates ----

/** The Polar Tang surfacing in North Blue, among ice floes and snow, its bubbles rising. */
export function HeartArt() {
  const navy = '#0a1828';
  const line = { stroke: navy, strokeWidth: 3, strokeLinejoin: 'round' as const };
  const flakes = [
    [40, 30],
    [120, 18],
    [300, 26],
    [338, 64],
    [86, 70],
  ]
    .map(
      ([x, y]) =>
        `M${x! - 4} ${y} h8 M${x} ${y! - 4} v8 M${x! - 3} ${y! - 3} l6 6 M${x! + 3} ${y! - 3} l-6 6`,
    )
    .join(' ');
  return (
    <svg className="look-art" viewBox="0 0 360 200" aria-hidden="true">
      <path d={flakes} stroke="#e6f6fa" strokeOpacity={0.75} strokeWidth={1.4} />
      <circle cx={292} cy={46} r={16} fill="#e6f6fa" opacity={0.9} />
      <circle cx={300} cy={40} r={14} fill="var(--shell-bg)" />
      {/* Ice floes */}
      <path d="M10 128 L28 112 H70 L84 128 Z" fill="#f4fbff" {...line} />
      <path d="M300 130 L312 118 H346 L356 130 Z" fill="#f4fbff" {...line} />
      <g className="bob">
        <g className="flag-wrap">
          <path d="M176 76 V30" {...line} />
          <g className="flag">
            <path d={cloth(176, 30, 42, 26)} fill="#141414" {...line} strokeWidth={2} />
            {bones(197, 42, 6, '#f6c744')}
            <circle cx={197} cy={42} r={7} fill="#141414" stroke="#f6c744" strokeWidth={2} />
            <path d="M193 44 Q197 48 201 44" fill="none" stroke="#f6c744" strokeWidth={1.6} />
            <circle cx={194.5} cy={40} r={1.2} fill="#f6c744" />
            <circle cx={199.5} cy={40} r={1.2} fill="#f6c744" />
          </g>
        </g>
        <path d="M214 76 V48 H232" fill="none" {...line} />
        <rect x={164} y={72} width={60} height={40} rx={10} fill="#f6c744" {...line} />
        <circle cx={194} cy={90} r={7} fill="#e6f6fa" {...line} strokeWidth={2.4} />
        <rect x={70} y={104} width={230} height={56} rx={28} fill="#f6c744" {...line} />
        {[110, 145, 245, 275].map((x) => (
          <circle key={x} cx={x} cy={124} r={8} fill="#e6f6fa" {...line} strokeWidth={2.4} />
        ))}
        <path d="M296 120 l20 -8 v24 z" fill="#f6c744" {...line} />
      </g>
      {/* The water, over the hull's lower half */}
      <path
        d="M0 134 q20 -8 40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 V200 H0 Z"
        fill="#123049"
        fillOpacity={0.88}
        {...line}
      />
      {bubbles(
        [
          [60, 186, 4],
          [96, 192, 2.6],
          [210, 190, 3.4],
          [250, 194, 2.2],
          [320, 188, 3],
        ],
        '#9fe6f2',
      )}
    </svg>
  );
}

// ---- Whitebeard Pirates ----

/** Moby Dick under the old man's colours, as tattoo flash, with a FAMILY banner. */
export function WhitebeardArt() {
  const line = { stroke: ink, strokeWidth: 3, strokeLinejoin: 'round' as const };
  const emblem = (x: number, y: number, r: number) => (
    <>
      <path
        d={`M${x} ${y - r * 2} V${y + r * 2.2} M${x - r * 1.7} ${y - r * 0.4} H${x + r * 1.7}`}
        stroke="#1a1414"
        strokeWidth={r * 0.5}
        strokeLinecap="round"
      />
      {skull(x, y, r, '#1a1414', '#faf3e3')}
      <path
        d={`M${x - r * 1.6} ${y + r * 0.2} Q${x} ${y + r * 1.2} ${x + r * 1.6} ${y + r * 0.2} Q${x} ${y + r * 0.75} ${x - r * 1.6} ${y + r * 0.2} Z`}
        fill="#faf3e3"
        stroke="#1a1414"
        strokeWidth={1.4}
      />
    </>
  );
  return (
    <svg className="look-art" viewBox="0 0 360 200" aria-hidden="true">
      {/* A nautical star behind, as on every flash sheet */}
      <path
        d="M300 22 l9 22 24 2 -18 15 6 23 -21 -13 -21 13 6 -23 -18 -15 24 -2 z"
        fill="var(--shell-pop)"
        {...line}
        strokeWidth={2.4}
      />
      <g className="rock">
        <path d="M196 120 V22" {...line} />
        <path d="M150 38 Q196 30 242 38 V108 Q196 116 150 108 Z" fill="#faf3e3" {...line} />
        {emblem(196, 72, 11)}
        <g className="flag">
          <path d={cloth(196, 12, 34, 20)} fill="#1a1414" {...line} strokeWidth={2} />
          {skull(212, 21, 5, '#faf3e3', '#1a1414')}
        </g>
        {/* The white whale: head at the bow on the left, deck on its back */}
        <path
          d="M60 150 C58 116 104 106 140 112 H290 L312 98 L306 126 C310 156 278 176 236 178 H112 C82 176 62 166 60 150 Z"
          fill="#faf3e3"
          {...line}
        />
        <path d="M66 150 Q90 160 120 154" fill="none" stroke={ink} strokeWidth={2.4} />
        <circle cx={92} cy={132} r={4} fill={ink} />
        <path d="M140 112 V100 H290 V112" fill="none" stroke={ink} strokeWidth={2.4} />
        <path
          d="M150 100 V112 M170 100 V112 M190 100 V112 M210 100 V112 M230 100 V112 M250 100 V112 M270 100 V112"
          stroke={ink}
          strokeWidth={1.6}
        />
        <path
          d="M84 122 Q96 114 112 118"
          fill="none"
          stroke="#ffffff"
          strokeWidth={3}
          strokeLinecap="round"
        />
      </g>
      <path
        d="M0 172 c10 -14 30 -16 40 -4 c-7 -5 -15 -2 -13 4 c2 4 7 4 8 0 M100 186 c10 -14 30 -16 40 -4 c-7 -5 -15 -2 -13 4 c2 4 7 4 8 0"
        fill="none"
        stroke={ink}
        strokeWidth={2.4}
        strokeLinecap="round"
      />
      <path
        d="M0 176 q20 -8 40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 V200 H0 Z"
        fill="#2a8a86"
        {...line}
      />
      {/* The banner */}
      <path
        d="M196 170 l-14 9 14 9 Z M352 170 l14 9 -14 9 Z"
        fill="#7a1d18"
        {...line}
        strokeWidth={2.4}
      />
      <rect
        x={196}
        y={164}
        width={156}
        height={30}
        fill="var(--shell-accent)"
        {...line}
        strokeWidth={2.4}
      />
      <text
        x={274}
        y={186}
        textAnchor="middle"
        fontFamily="var(--shell-heading)"
        fontSize={18}
        letterSpacing={3}
        fill="var(--shell-accent-text)"
      >
        FAMILY
      </text>
    </svg>
  );
}

// ---- Big Mom Pirates ----

/** A candy ship on a soda sea, with Whole Cake Island lit up behind it. */
export function BigMomArt() {
  const choc = '#4a2a1f';
  const line = { stroke: choc, strokeWidth: 3, strokeLinejoin: 'round' as const };
  const drips = (x0: number, x1: number, y: number) => {
    let d = `M${x0} ${y - 4} H${x1} V${y + 4}`;
    const n = Math.round((x1 - x0) / 14);
    const step = (x1 - x0) / n;
    for (let i = n - 1; i >= 0; i--) {
      const x = x0 + i * step;
      d += ` Q${x + step * 0.75} ${y + 4} ${x + step * 0.5} ${y + (i % 2 ? 12 : 8)} Q${x + step * 0.25} ${y + 4} ${x} ${y + 4}`;
    }
    return `${d} Z`;
  };
  const candle = (x: number, y: number) => (
    <>
      <rect x={x - 3} y={y - 16} width={6} height={16} fill="#fff6ea" {...line} strokeWidth={2} />
      <path
        d={`M${x} ${y - 26} q5 5 0 9 q-5 -4 0 -9 z`}
        fill="#ffc83d"
        {...line}
        strokeWidth={1.6}
      />
    </>
  );
  return (
    <svg className="look-art" viewBox="0 0 360 200" aria-hidden="true">
      {/* Whole Cake Island */}
      <rect x={232} y={110} width={112} height={42} rx={6} fill="#f5a3c0" {...line} />
      <path d={drips(232, 344, 112)} fill="#fff6ea" {...line} strokeWidth={2} />
      <rect x={250} y={76} width={76} height={36} rx={6} fill="#7fd6bd" {...line} />
      <path d={drips(250, 326, 78)} fill="#fff6ea" {...line} strokeWidth={2} />
      <rect x={268} y={48} width={40} height={30} rx={6} fill="#f2c95e" {...line} />
      <path d={drips(268, 308, 50)} fill="#fff6ea" {...line} strokeWidth={2} />
      {candle(278, 46)}
      {candle(298, 46)}
      <circle cx={288} cy={36} r={6} fill="#d81e4a" {...line} strokeWidth={2} />
      <g className="rock">
        <path d="M140 150 V36" {...line} />
        <path d="M100 52 Q140 44 180 52 V122 Q140 130 100 122 Z" fill="#fff6ea" {...line} />
        {bones(140, 84, 11, choc)}
        {skull(140, 84, 11, '#fff6ea', choc)}
        <path
          d="M126 80 q-8 -4 -6 -14 q2 -8 10 -8 q4 -8 10 -6 q6 -2 10 6 q8 0 10 8 q2 10 -6 14 q-6 -6 -14 -6 q-8 0 -14 6 z"
          fill="#f2559a"
          {...line}
          strokeWidth={2}
        />
        <circle cx={140} cy={84} r={11} fill="none" stroke={choc} strokeWidth={2} />
        <g className="flag">
          <path d={cloth(140, 26, 34, 20)} fill="#f2559a" {...line} strokeWidth={2} />
          {skull(156, 35, 5, '#fff6ea', choc)}
        </g>
        <path d="M54 148 H226 Q220 176 192 182 H86 Q62 176 54 148 Z" fill="#f5a3c0" {...line} />
        <path
          d="M60 160 q14 -6 28 0 t28 0 t28 0 t28 0 t28 0 t26 0"
          fill="none"
          stroke="#fff6ea"
          strokeWidth={5}
          strokeLinecap="round"
        />
        <circle cx={206} cy={162} r={9} fill="#7fd6bd" {...line} strokeWidth={2.4} />
        <circle cx={206} cy={162} r={3.5} fill="#f5a3c0" {...line} strokeWidth={1.6} />
      </g>
      {/* The soda sea, fizzing */}
      <path
        d="M0 174 q15 -8 30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 V200 H0 Z"
        fill="#a991e0"
        {...line}
      />
      {bubbles(
        [
          [40, 192, 3],
          [250, 194, 2.4],
          [312, 190, 3.2],
        ],
        '#ffffff',
      )}
      <g fill="none" strokeWidth={4} strokeLinecap="round">
        <path d="M30 30 l8 4" stroke="#f2559a" />
        <path d="M60 60 l-4 8" stroke="#5cc9a7" />
        <path d="M210 24 l8 -3" stroke="#ffc83d" />
        <path d="M24 100 l6 6" stroke="#5aa7f0" />
      </g>
    </svg>
  );
}

// ---- Beasts Pirates (Wano) ----

/** A Wano junk under the horned skull, with the red sun, the mountain and a great wave. */
export function WanoArt() {
  const sumi = '#1b2233';
  const line = { stroke: sumi, strokeWidth: 2.6, strokeLinejoin: 'round' as const };
  return (
    <svg className="look-art" viewBox="0 0 360 200" aria-hidden="true">
      <circle cx={300} cy={52} r={30} fill="#b8321e" />
      <path d="M30 140 L100 52 L170 140 Z" fill="#21406b" {...line} />
      <path
        d="M84.1 72 L100 52 L115.9 72 l-6 5 -5 -5 -5 7 -5 -7 -5 5 Z"
        fill="#f3ead2"
        {...line}
        strokeWidth={2}
      />
      {/* A torii on its rock */}
      <path d="M8 150 Q30 128 62 136 Q78 142 82 156 Z" fill="#5a6170" {...line} />
      <path d="M26 140 V108 M66 140 V108" stroke="#b8321e" strokeWidth={6} />
      <path
        d="M16 106 Q46 98 76 106"
        stroke="#b8321e"
        strokeWidth={7}
        fill="none"
        strokeLinecap="round"
      />
      <path d="M22 116 H70" stroke="#b8321e" strokeWidth={4} />
      <g transform="translate(34 0)">
        <g className="rock">
          <path d="M168 150 V30" {...line} />
          <rect x={128} y={44} width={80} height={74} fill="#f3ead2" {...line} />
          <path
            d="M128 62 H208 M128 80 H208 M128 98 H208"
            stroke={sumi}
            strokeWidth={1.4}
            strokeOpacity={0.6}
          />
          <g className="flag">
            <path d={cloth(168, 18, 36, 22)} fill="#141414" {...line} strokeWidth={2} />
            <path d="M180 26 l-4 -7 6 4 Z M192 26 l4 -7 -6 4 Z" fill="#f3ead2" />
            {skull(186, 29, 5, '#f3ead2', '#141414')}
          </g>
          <path
            d="M92 136 Q100 134 106 140 H236 Q244 130 256 128 Q252 160 226 170 H118 Q96 164 92 136 Z"
            fill="#5a3a22"
            {...line}
          />
          <path d="M110 152 H238" stroke="#d9a93e" strokeWidth={2.4} />
        </g>
      </g>
      {/* The wave: an indigo swell with a curling crest and claws of foam */}
      <path
        d="M0 170 q30 -14 60 -4 t70 2 t70 -6 C230 150 262 132 300 138 C330 142 348 160 340 176 C334 166 322 162 312 168 C320 156 304 150 296 160 Q300 172 360 178 V200 H0 Z"
        fill="#21406b"
        {...line}
      />
      <path
        d="M300 138 C326 140 346 156 340 176 M318 150 l6 -6 M330 158 l7 -4 M306 144 l2 -7"
        fill="none"
        stroke="#f3ead2"
        strokeWidth={2.4}
        strokeLinecap="round"
      />
      <path
        d="M20 184 q14 -8 28 0 t28 0 M150 190 q14 -8 28 0 t28 0"
        fill="none"
        stroke="#f3ead2"
        strokeWidth={2}
      />
    </svg>
  );
}

// ---- The Navy ----

/** A Marine warship off Marineford, gulls overhead, under the gull flag. */
export function NavyArt() {
  const navy = '#14213d';
  const blue = '#1f4e9c';
  const line = { stroke: navy, strokeWidth: 2.8, strokeLinejoin: 'round' as const };
  const gull = (x: number, y: number, w: number, c = navy, sw = 2.4) => (
    <path
      d={`M${x - w} ${y} q${w / 2} ${-w / 2} ${w} 0 q${w / 2} ${-w / 2} ${w} 0`}
      fill="none"
      stroke={c}
      strokeWidth={sw}
      strokeLinecap="round"
    />
  );
  return (
    <svg className="look-art" viewBox="0 0 360 200" aria-hidden="true">
      {/* Marineford's tower */}
      <path d="M286 152 V58 h8 v-8 h8 v8 h8 v-8 h8 v8 h8 V152 Z" fill="#ffffff" {...line} />
      <rect
        x={286}
        y={86}
        width={40}
        height={8}
        fill="var(--shell-pop)"
        {...line}
        strokeWidth={2}
      />
      <path d="M300 152 V128 a6 6 0 0 1 12 0 V152 Z" fill={navy} />
      <path d="M306 50 V28" {...line} />
      <path d={cloth(306, 28, 24, 15)} fill="#ffffff" {...line} strokeWidth={2} />
      {gull(318, 37, 4, blue, 1.8)}
      {gull(60, 30, 8)}
      {gull(100, 52, 6)}
      {gull(250, 24, 5)}
      <g className="rock">
        <path d="M150 150 V30" {...line} />
        <path d="M106 46 Q150 38 194 46 V118 Q150 126 106 118 Z" fill="#ffffff" {...line} />
        {gull(150, 72, 14, blue, 4)}
        <text
          x={150}
          y={104}
          textAnchor="middle"
          fontFamily="var(--shell-heading)"
          fontWeight={700}
          fontSize={18}
          letterSpacing={2}
          fill={blue}
        >
          MARINE
        </text>
        <g className="flag">
          <path d={cloth(150, 20, 34, 20)} fill="#ffffff" {...line} strokeWidth={2} />
          {gull(167, 30, 6, blue, 2)}
        </g>
        <path d="M56 146 H252 L238 178 H74 Z" fill="#ffffff" {...line} />
        <path d="M60 156 H247" stroke={blue} strokeWidth={6} />
        <path d="M252 146 L276 134 L262 152 Z" fill="#ffffff" {...line} />
        {[96, 128, 160, 192, 222].map((x) => (
          <circle key={x} cx={x} cy={167} r={3.6} fill={navy} />
        ))}
      </g>
      <path
        d="M0 176 q15 -8 30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 V200 H0 Z"
        fill="#1d4f8f"
        {...line}
      />
      <path
        d="M30 190 h18 M200 188 h26 M300 192 h14"
        stroke="#e8f0fb"
        strokeWidth={2}
        strokeLinecap="round"
      />
    </svg>
  );
}
