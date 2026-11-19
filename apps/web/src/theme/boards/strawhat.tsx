import type { ReactNode } from 'react';
import type { Theme, ThemePieces } from '../clean.ts';
import { artFor } from './art.ts';
import { circle, mix, pathOf, ring, rng, strokes, type Pt } from './ink.ts';
import { MANGA_SCENES, type InkRole, type InkScene } from './mangaArt.ts';
import { BASE, H, seaTile, skin, W, type BaseType } from './kit.tsx';

/**
 * Grand Line · Straw Hat Pirates: the island as a colour page of a manga. Each land is an inked
 * scene drawn in the ink kit (see mangaArt.ts) rather than a flat colour behind an icon: a
 * stand of trees, a clay pit cut in terraces, a meadow with a flock, wheat in rows, three
 * snow-capped peaks, and dunes around a butte. Screentone shades the bottom of every tile, and
 * the sea is halftone dots with little wave strokes. Number discs are straw hats seen from above, settlements wear straw-hat
 * roofs, cities are ships under a Jolly Roger, and the robber is a Marine cap: the Navy has
 * moved in, so nothing gets made there.
 */

interface Ink {
  land: Record<BaseType, string>;
  ink: string;
  paper: string;
  straw: string;
  strawLight: string;
  band: string;
  /** Where the shadows go, and where the light comes from. */
  cool: string;
  warm: string;
  sea: string;
  seaDot: string;
  marine: string;
}

/**
 * The scene colours for one land. The light is warm and the shade is cool, so a tile is three
 * colours rather than one colour at three brightnesses: that is what makes a drawing read as
 * lit rather than tinted.
 */
function palette(k: Ink, type: BaseType): Record<InkRole, string> {
  const land = k.land[type];
  return {
    land,
    mid: mix(land, k.cool, 0.12),
    dark: mix(land, k.cool, 0.32),
    shadow: mix(land, k.cool, 0.52),
    light: mix(land, k.warm, 0.4),
    glow: mix(land, k.warm, 0.75),
    ink: k.ink,
    tone: k.ink,
  };
}

/** The gradients a scene needs, written out so its layers can point at them. */
function defs(scene: InkScene, c: Record<InkRole, string>): ReactNode {
  return scene.grads.map((g) => {
    const stops = g.stops.map((s, i) => (
      <stop
        key={i}
        offset={s.at}
        stopColor={c[s.role]}
        {...(s.opacity === undefined ? {} : { stopOpacity: s.opacity })}
      />
    ));
    return g.kind === 'linear' ? (
      <linearGradient
        key={g.id}
        id={g.id}
        gradientUnits="userSpaceOnUse"
        x1={g.at[0]}
        y1={g.at[1]}
        x2={g.at[2]}
        y2={g.at[3]}
      >
        {stops}
      </linearGradient>
    ) : (
      <radialGradient
        key={g.id}
        id={g.id}
        gradientUnits="userSpaceOnUse"
        cx={g.at[0]}
        cy={g.at[1]}
        r={g.at[2]}
        {...(g.at.length > 3 ? { fx: g.at[3], fy: g.at[4] } : {})}
      >
        {stops}
      </radialGradient>
    );
  });
}

/** One land: its own colour behind the drawn scene, painted in that land's shades. */
function scene(k: Ink, type: BaseType): ReactNode {
  const c = palette(k, type);
  const sc = MANGA_SCENES[type];
  return (
    <>
      <defs>{defs(sc, c)}</defs>
      <rect width={W} height={H} fill={c.land} />
      {sc.layers.map((l, i) => {
        const paint = l.grad ? `url(#${l.grad})` : c[l.role ?? 'ink'];
        return l.width ? (
          <path
            key={i}
            d={l.d}
            fill="none"
            stroke={paint}
            strokeWidth={l.width}
            strokeLinejoin="round"
            {...(l.round ? { strokeLinecap: 'round' as const } : {})}
            {...(l.opacity === undefined ? {} : { opacity: l.opacity })}
          />
        ) : (
          <path
            key={i}
            d={l.d}
            fill={paint}
            {...(l.opacity === undefined ? {} : { opacity: l.opacity })}
          />
        );
      })}
    </>
  );
}

function art(k: Ink): Record<BaseType, ReactNode> {
  return Object.fromEntries(BASE.map((t) => [t, scene(k, t)])) as Record<BaseType, ReactNode>;
}

function sea(k: Ink): ReactNode {
  let dots = '';
  for (let y = 3; y < 56; y += 7)
    for (let x = (y / 7) % 2 ? 3.5 : 7; x < 64; x += 7)
      dots += `M${x - 1},${y}a1,1 0 1 0 2,0a1,1 0 1 0 -2,0`;
  return seaTile(64, 56, [
    <rect key="bg" width={64} height={56} fill={k.sea} />,
    <path key="dots" d={dots} fill={k.seaDot} />,
    <path
      key="waves"
      d="M8,18 q5,-6 10,0 t10,0 M38,44 q5,-6 10,0 t10,0"
      fill="none"
      stroke={k.paper}
      strokeWidth={2.2}
      strokeLinecap="round"
    />,
  ]);
}

/**
 * The number disc: a straw hat seen from above, drawn rather than stamped out. Every circle here
 * is a wandered line, so none of them sits quite true, and the hat is lit from the top left: the
 * brim graduates into shade on the lower right, the band turns with it, and the whole disc drops
 * a shadow on the tile. Built once at a radius of 100 and scaled to whatever the board asks for.
 */
const DISC = (() => {
  const rnd = rng(21);
  const shut = (pts: Pt[]) => pathOf(pts, true);
  // The straw is woven in rings, so the ticks run across the brim rather than around it.
  const weave = strokes(
    Array.from({ length: 30 }, (_, i): Pt[] => {
      const a = ((i + rnd() * 0.6) / 30) * Math.PI * 2;
      const r0 = 78 + rnd() * 3;
      const r1 = 93 + rnd() * 3;
      return [
        [Math.cos(a) * r0, Math.sin(a) * r0],
        [Math.cos(a) * r1, Math.sin(a) * r1],
      ];
    }),
  );
  // The crown takes most of the disc: a number has to be read across a table, so it gets a
  // calm pale field to sit on and the hat is told in the narrow brim around it.
  return {
    brim: shut(circle(0, 0, 96, rnd, 1.5)),
    band: shut(circle(0, -1, 86, rnd, 1)),
    crown: shut(circle(0, -2, 77, rnd, 1.2)),
    weave,
    stitch: pathOf(circle(0, 0, 92, rnd, 0.9), true),
    // The gleam: a short highlight where the light lands on the crown.
    gleam: pathOf(ring(0, -2, 61, 61, 12, Math.PI * 1.06, Math.PI * 1.5)),
  };
})();

/** The gradients the disc is painted with: one warm light, one cool shade, in disc units. */
function discDefs(k: Ink): ReactNode {
  const stop = (at: number, c: string, o?: number) => (
    <stop
      key={`${at}-${c}`}
      offset={at}
      stopColor={c}
      {...(o === undefined ? {} : { stopOpacity: o })}
    />
  );
  return (
    <>
      <radialGradient
        key="sh-disc-brim"
        id="sh-disc-brim"
        gradientUnits="userSpaceOnUse"
        cx={-34}
        cy={-38}
        r={168}
      >
        {stop(0, mix(k.strawLight, k.warm, 0.5))}
        {stop(0.45, k.straw)}
        {stop(1, mix(k.straw, k.cool, 0.42))}
      </radialGradient>
      <radialGradient
        key="sh-disc-crown"
        id="sh-disc-crown"
        gradientUnits="userSpaceOnUse"
        cx={-24}
        cy={-30}
        r={124}
      >
        {stop(0, '#fffdf4')}
        {stop(0.5, k.strawLight)}
        {stop(1, mix(k.strawLight, k.cool, 0.24))}
      </radialGradient>
      <linearGradient
        key="sh-disc-band"
        id="sh-disc-band"
        gradientUnits="userSpaceOnUse"
        x1={-70}
        y1={-70}
        x2={66}
        y2={70}
      >
        {stop(0, mix(k.band, k.warm, 0.4))}
        {stop(0.45, k.band)}
        {stop(1, mix(k.band, k.cool, 0.45))}
      </linearGradient>
      <radialGradient
        key="sh-disc-cast"
        id="sh-disc-cast"
        gradientUnits="userSpaceOnUse"
        cx={0}
        cy={0}
        r={104}
      >
        {stop(0, k.ink, 0.42)}
        {stop(0.74, k.ink, 0.36)}
        {stop(1, k.ink, 0)}
      </radialGradient>
    </>
  );
}

function pieces(k: Ink): ThemePieces {
  const edge = { stroke: k.ink, strokeWidth: 2.2, strokeLinejoin: 'round' as const };
  return {
    house: ({ x, y, color, city, s }) => {
      const u = s * 0.1;
      if (!city) {
        // A hut under a straw hat: the brim is the eaves, the red band is the ridge.
        const crown = `M${x - 1.25 * u},${y - 0.55 * u} C${x - 1.3 * u},${y - 2.5 * u} ${x + 1.3 * u},${y - 2.5 * u} ${x + 1.25 * u},${y - 0.55 * u} Z`;
        return (
          <g>
            <rect
              x={x - 1.4 * u}
              y={y - 0.5 * u}
              width={2.8 * u}
              height={2.2 * u}
              fill={color}
              {...edge}
            />
            <rect x={x - 0.4 * u} y={y + 0.6 * u} width={0.8 * u} height={1.1 * u} fill={k.ink} />
            <ellipse cx={x} cy={y - 0.5 * u} rx={2.5 * u} ry={0.62 * u} fill={k.straw} {...edge} />
            <path d={crown} fill={k.straw} {...edge} />
            <path
              d={`M${x - 1.27 * u},${y - 0.95 * u} Q${x},${y - 1.25 * u} ${x + 1.27 * u},${y - 0.95 * u}`}
              fill="none"
              stroke={k.band}
              strokeWidth={0.45 * u}
            />
          </g>
        );
      }
      // A ship with a skull on its sail and the black flag at the masthead.
      const hull = `M${x - 2.7 * u},${y + 0.1 * u} H${x + 2.7 * u} Q${x + 2.3 * u},${y + 1.9 * u} ${x + 1.2 * u},${y + 1.9 * u} H${x - 1.5 * u} Q${x - 2.5 * u},${y + 1.6 * u} ${x - 2.7 * u},${y + 0.1 * u} Z`;
      const sail = `M${x - 1.5 * u},${y - 2.7 * u} Q${x},${y - 2.35 * u} ${x + 1.5 * u},${y - 2.7 * u} L${x + 1.6 * u},${y - 0.35 * u} Q${x},${y} ${x - 1.6 * u},${y - 0.35 * u} Z`;
      return (
        <g>
          <path d={`M${x},${y + 0.1 * u} V${y - 3.3 * u}`} {...edge} />
          <path
            d={`M${x},${y - 3.3 * u} h${1.3 * u} l${-0.3 * u},${0.35 * u} l${0.3 * u},${0.35 * u} h${-1.3 * u} Z`}
            fill={k.ink}
          />
          <path d={sail} fill={k.paper} {...edge} />
          <circle cx={x} cy={y - 1.75 * u} r={0.5 * u} fill={k.ink} />
          <path
            d={`M${x - 0.75 * u},${y - 1.1 * u} L${x + 0.75 * u},${y - 0.6 * u} M${x + 0.75 * u},${y - 1.1 * u} L${x - 0.75 * u},${y - 0.6 * u}`}
            stroke={k.ink}
            strokeWidth={1.3}
            strokeLinecap="round"
          />
          <path d={hull} fill={color} {...edge} />
          <path
            d={`M${x - 2.2 * u},${y + 0.75 * u} H${x + 2.2 * u}`}
            stroke={k.ink}
            strokeWidth={1.2}
            strokeOpacity={0.6}
          />
        </g>
      );
    },
    road: ({ a, b, color, s }) => (
      <>
        <line
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke={k.ink}
          strokeWidth={s * 0.18}
          strokeLinecap="round"
        />
        <line
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke={color}
          strokeWidth={s * 0.095}
          strokeLinecap="round"
        />
      </>
    ),
    robber: ({ x, y, s }) => {
      const u = s * 0.1;
      // A Marine officer's cap: white crown, blue band, black peak, and the gull on the front.
      const crown = `M${x - 2.3 * u},${y - 0.5 * u} C${x - 2.6 * u},${y - 2.4 * u} ${x - 1.2 * u},${y - 2.7 * u} ${x},${y - 2.7 * u} C${x + 1.2 * u},${y - 2.7 * u} ${x + 2.6 * u},${y - 2.4 * u} ${x + 2.3 * u},${y - 0.5 * u} Z`;
      return (
        <g>
          <ellipse cx={x} cy={y + 1.3 * u} rx={2.4 * u} ry={0.55 * u} fill={k.ink} opacity={0.3} />
          <path d={crown} fill={k.paper} {...edge} />
          <rect
            x={x - 2.3 * u}
            y={y - 0.75 * u}
            width={4.6 * u}
            height={0.95 * u}
            fill={k.marine}
            {...edge}
          />
          <path
            d={`M${x - 1.9 * u},${y + 0.2 * u} Q${x},${y + 1.4 * u} ${x + 1.9 * u},${y + 0.2 * u} Z`}
            fill={k.ink}
            {...edge}
          />
          <path
            d={`M${x - 0.95 * u},${y - 1.55 * u} q${0.48 * u},${-0.5 * u} ${0.95 * u},0 q${0.47 * u},${-0.5 * u} ${0.95 * u},0`}
            fill="none"
            stroke={k.marine}
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        </g>
      );
    },
    // A straw hat from above: the woven brim, the red band, and the number on the crown.
    token: ({ x, y, r }) => (
      <>
        {/* Bare: the look's stylesheet rings this one in gold when the number is rolled. */}
        <circle className="token-face" cx={x} cy={y} r={r} fill="none" stroke="none" />
        <g transform={`translate(${x},${y}) scale(${r / 100})`}>
          <ellipse cx={4} cy={11} rx={100} ry={95} fill="url(#sh-disc-cast)" />
          <path
            d={DISC.brim}
            fill="url(#sh-disc-brim)"
            stroke={k.ink}
            strokeWidth={9}
            strokeLinejoin="round"
          />
          <path
            d={DISC.weave}
            fill="none"
            stroke={k.ink}
            strokeOpacity={0.22}
            strokeWidth={3.2}
            strokeLinecap="round"
          />
          <path d={DISC.stitch} fill="none" stroke={k.ink} strokeOpacity={0.16} strokeWidth={2.6} />
          <path d={DISC.band} fill="none" stroke={k.ink} strokeWidth={14} />
          <path d={DISC.band} fill="none" stroke="url(#sh-disc-band)" strokeWidth={10} />
          <path
            d={DISC.crown}
            fill="url(#sh-disc-crown)"
            stroke={k.ink}
            strokeWidth={6}
            strokeLinejoin="round"
          />
          <path
            d={DISC.gleam}
            fill="none"
            stroke={k.paper}
            strokeOpacity={0.55}
            strokeWidth={8}
            strokeLinecap="round"
          />
        </g>
      </>
    ),
  };
}

function strawHatSkin(id: string, name: string, k: Ink): Theme {
  return skin({
    id,
    name,
    description:
      'A manga colour page: screentone, heavy ink, straw-hat discs and a Marine cap for a robber.',
    terrain: k.land,
    sea: k.sea,
    seaEdge: k.ink,
    art: art(k),
    seaPattern: sea(k),
    paintings: artFor('strawhat'),
    defs: discDefs(k),
    rest: {
      token: k.strawLight,
      tokenText: k.ink,
      tokenHot: '#b3121f',
      outline: k.ink,
      robber: k.paper,
      landStroke: k.ink,
      landStrokeWidth: 3,
      harborWood: k.ink,
      harborFace: k.paper,
      harborText: k.ink,
      pieceEffect: 'lift',
      tokenFont: "'Bangers', 'Lilita One', system-ui, sans-serif",
      pieces: pieces(k),
      boardBackground: k.sea,
    },
  });
}

export const strawHatBoard = strawHatSkin('strawhat-sunny', 'Grand Line · Straw Hat Pirates', {
  land: {
    forest: '#2e9e5b',
    hills: '#e2603a',
    pasture: '#9ad25b',
    fields: '#f6c945',
    mountains: '#8f9bb0',
    desert: '#f1dcab',
  },
  ink: '#141414',
  paper: '#ffffff',
  cool: '#17204a',
  warm: '#fff3cd',
  straw: '#f2c240',
  strawLight: '#fff1c2',
  band: '#d62828',
  sea: '#3b9fe0',
  seaDot: '#2f8ccb',
  marine: '#2b5fae',
});
