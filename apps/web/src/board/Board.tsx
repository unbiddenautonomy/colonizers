import { memo, useMemo, useRef } from 'react';
import {
  buildGeometry,
  cornerToPixel,
  hexToPixel,
  type Action,
  type CornerId,
  type EdgeId,
  type GameState,
  type HexId,
} from '@colonizers/engine';
import { RESOURCE_ICON, TRACK_COLOR, type Theme } from '../theme/clean.ts';
import { useTheme } from '../theme/themes.tsx';
import { motionAttrs, useBoardMotion } from './motion.ts';
import {
  CanalStretch,
  canalLinks,
  DryBasin,
  DryFarmland,
  farmlandDry,
  GoldRiver,
} from './CanalArt.tsx';

const S = 60;
const PIPS: Record<number, number> = {
  2: 1,
  3: 2,
  4: 3,
  5: 4,
  6: 5,
  8: 5,
  9: 4,
  10: 3,
  11: 2,
  12: 1,
};

export interface Targets {
  corners: Map<CornerId, Action>;
  edges: Map<EdgeId, Action>;
  hexes: Map<HexId, Action>;
}

export const noTargets: Targets = { corners: new Map(), edges: new Map(), hexes: new Map() };

interface BoardProps {
  state: GameState;
  targets: Targets;
  onAction: (a: Action) => void;
  theme?: Theme;
  /** Hex to flash, e.g. the one that just produced. */
  rolled?: number | null | undefined;
}

function hexPoints(q: number, r: number, scale = 1): string {
  const c = hexToPixel(q, r, S);
  const R = S * scale;
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 90);
    return `${(c.x + R * Math.cos(a)).toFixed(1)},${(c.y + R * Math.sin(a)).toFixed(1)}`;
  }).join(' ');
}

function edgeEnds(edge: EdgeId, g: ReturnType<typeof buildGeometry>) {
  const [a, b] = g.edgeCorners.get(edge) as [CornerId, CornerId];
  return [cornerToPixel(a, S), cornerToPixel(b, S)] as const;
}

function HouseShape({
  x,
  y,
  color,
  city,
  theme,
}: {
  x: number;
  y: number;
  color: string;
  city: boolean;
  theme: Theme;
}) {
  const k = S * 0.2;
  const d = city
    ? `M${x - k * 1.3},${y + k * 0.9} v${-k * 1.2} l${k * 0.65},${-k * 0.7} l${k * 0.65},${k * 0.7} h${k * 1.3} v${k * 1.2} z`
    : `M${x - k * 0.85},${y + k * 0.8} v${-k * 1.0} l${k * 0.85},${-k * 0.8} l${k * 0.85},${k * 0.8} v${k * 1.0} z`;
  return (
    <>
      <path d={d} fill={color} stroke={theme.outline} strokeWidth={2.5} strokeLinejoin="round" />
      {theme.shadePieces && <path d={d} fill="url(#wood-shade)" pointerEvents="none" />}
    </>
  );
}

const KNIGHT_LEVEL: Record<string, number> = { knight1: 1, knight2: 2, knight3: 3 };

/** A shield: filled when active, pale when not, with one bar per strength level. */
function Knight({
  x,
  y,
  color,
  level,
  active,
  theme,
  fx,
}: {
  x: number;
  y: number;
  color: string;
  level: number;
  active: boolean;
  theme: Theme;
  fx: string;
}) {
  const k = S * 0.22;
  return (
    <g filter={fx} opacity={active ? 1 : 0.85}>
      <path
        d={`M${x - k},${y - k} h${2 * k} v${k * 0.9} q0,${k * 0.9} ${-k},${k * 1.3} q${-k},${-k * 0.4} ${-k},${-k * 1.3} z`}
        fill={active ? color : '#fbf6e9'}
        stroke={color}
        strokeWidth={active ? 2 : 3.5}
      />
      <path
        d={`M${x - k},${y - k} h${2 * k} v${k * 0.9} q0,${k * 0.9} ${-k},${k * 1.3} q${-k},${-k * 0.4} ${-k},${-k * 1.3} z`}
        fill="none"
        stroke={theme.outline}
        strokeWidth={1.2}
      />
      {Array.from({ length: level }, (_, i) => (
        <line
          key={i}
          x1={x - k * 0.55}
          x2={x + k * 0.55}
          y1={y - k * 0.5 + i * k * 0.45}
          y2={y - k * 0.5 + i * k * 0.45}
          stroke={active ? '#fff' : color}
          strokeWidth={S * 0.045}
          strokeLinecap="round"
        />
      ))}
      <title>{`${['Basic', 'Strong', 'Mighty'][level - 1]} knight${active ? ' (active)' : ' (inactive)'}`}</title>
    </g>
  );
}

/** A small boat in the middle of the edge, over a thin wake line. */
function Ship({
  a,
  b,
  color,
  theme,
  fx,
}: {
  a: { x: number; y: number };
  b: { x: number; y: number };
  color: string;
  theme: Theme;
  fx: string;
}) {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const k = S * 0.2;
  return (
    <g filter={fx}>
      <line
        x1={a.x + (b.x - a.x) * 0.12}
        y1={a.y + (b.y - a.y) * 0.12}
        x2={b.x - (b.x - a.x) * 0.12}
        y2={b.y - (b.y - a.y) * 0.12}
        stroke={color}
        strokeWidth={S * 0.06}
        strokeLinecap="round"
        strokeDasharray={`${S * 0.08} ${S * 0.07}`}
      />
      <g transform={`translate(${mx} ${my})`}>
        <path
          d={`M${-k * 1.3},${-k * 0.1} h${k * 2.6} l${-k * 0.5},${k * 0.7} h${-k * 1.6} z`}
          fill={color}
          stroke={theme.outline}
          strokeWidth={2}
          strokeLinejoin="round"
        />
        <path
          d={`M${-k * 0.1},${-k * 0.15} v${-k * 1.1} l${k * 0.85},${k * 1.1} z`}
          fill={theme.harborFace}
          stroke={theme.outline}
          strokeWidth={1.5}
        />
      </g>
      <title>Ship</title>
    </g>
  );
}

function BoardImpl({ state, targets, onAction, theme: given, rolled }: BoardProps) {
  const chosen = useTheme();
  const theme = given ?? chosen;
  const fx = theme.pieceEffect === 'glow' ? 'url(#glow)' : 'url(#lift)';
  const patterned = new Set(theme.patterned ?? []);
  const hexes = useMemo(() => Object.values(state.hexes), [state.hexes]);
  const canal = useMemo(() => canalLinks(state, S), [state]);
  const dry = farmlandDry(state);
  const g = useMemo(() => buildGeometry(hexes.map((h) => h.id)), [hexes]);
  const svgRef = useRef<SVGSVGElement>(null);
  useBoardMotion(svgRef, g, state);

  const viewBox = useMemo(() => {
    const xs: number[] = [];
    const ys: number[] = [];
    // Frame the land (plus room for harbors), not the whole sea ring.
    const land = hexes.filter((h) => h.type !== 'sea' && h.type !== 'shoal');
    for (const h of land.length ? land : hexes) {
      const c = hexToPixel(h.q, h.r, S);
      xs.push(c.x);
      ys.push(c.y);
    }
    const pad = S * 1.75;
    const minX = Math.min(...xs) - pad;
    const minY = Math.min(...ys) - pad;
    return `${minX} ${minY} ${Math.max(...xs) + pad - minX} ${Math.max(...ys) + pad - minY}`;
  }, [hexes]);

  const pieces = Object.values(state.pieces);
  const color = (seat: number | null) =>
    seat === null ? '#444' : (theme.players[seat]?.color ?? '#999');
  const robberHex = pieces.find((p) => p.type === 'robber')?.at;
  const tb = state.data['traders-barbarians'] as
    | {
        barbarians?: Record<string, number>;
        knights?: { id: string; owner: number; edge: EdgeId }[];
        wagons?: Record<string, { corner: CornerId | null }>;
        edgeBarbarians?: EdgeId[];
      }
    | undefined;
  const barbarians = tb?.barbarians ?? {};
  const dragons =
    (state.data['treasures-dragons']?.dragons as Record<string, number> | undefined) ?? {};
  const dragonAt = (h: HexId | undefined) => !!h && (dragons[h] ?? 0) > 0;
  const pirateHex = pieces.find((p) => p.type === 'pirate')?.at;

  return (
    <svg ref={svgRef} className="board" viewBox={viewBox} role="img" aria-label="Game board">
      <defs>
        <filter id="lift" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.35" />
        </filter>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <linearGradient id="wood-shade" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.3" />
        </linearGradient>
        <radialGradient id="hex-shade" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#fff" stopOpacity="0.22" />
          <stop offset="0.55" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.28" />
        </radialGradient>
        {theme.patterns?.()}
      </defs>

      {hexes.map((h) => {
        const fog = !!h.hidden || h.type === 'hidden';
        const type = fog ? 'hidden' : h.type;
        const shoal = type === 'shoal';
        const isSea = type === 'sea' || shoal;
        const lakeNumbers = type === 'fishingLake' ? ((h.props?.tokens as number[]) ?? []) : [];
        const c = hexToPixel(h.q, h.r, S);
        const key = isSea ? 'sea' : type;
        const fill = patterned.has(key)
          ? `url(#pat-${key})`
          : isSea
            ? theme.sea
            : (theme.terrain[type] ?? '#ccc');
        return (
          <g key={h.id}>
            <polygon
              points={hexPoints(h.q, h.r)}
              fill={fill}
              stroke={isSea ? theme.seaEdge : theme.landStroke}
              strokeWidth={isSea ? 0.5 : (theme.landStrokeWidth ?? 3)}
              strokeOpacity={isSea ? 0.5 : 1}
            >
              <title>
                {fog
                  ? 'Fog: not explored yet'
                  : shoal
                    ? `Fishing ground: fish on ${h.token}`
                    : lakeNumbers.length
                      ? `Fishing lake: fish on ${lakeNumbers.join(', ')}`
                      : h.type}
              </title>
            </polygon>
            {shoal && (
              <g aria-hidden="true">
                <circle
                  cx={c.x}
                  cy={c.y}
                  r={S * 0.62}
                  fill="none"
                  stroke={theme.seaEdge}
                  strokeWidth={2}
                  strokeDasharray="4 4"
                />
                <text x={c.x} y={c.y - S * 0.4} textAnchor="middle" fontSize={S * 0.26}>
                  🐟
                </text>
              </g>
            )}
            {lakeNumbers.length > 0 && (
              <g className={lakeNumbers.includes(rolled ?? -1) ? 'token hot' : 'token'}>
                <rect
                  x={c.x - S * 0.5}
                  y={c.y - S * 0.17}
                  width={S}
                  height={S * 0.34}
                  rx={S * 0.17}
                  fill={theme.token}
                  stroke={theme.outline}
                  strokeWidth={1.5}
                />
                <text
                  x={c.x}
                  y={c.y + S * 0.08}
                  textAnchor="middle"
                  fontSize={S * 0.2}
                  fontWeight={700}
                  fill={theme.tokenText}
                >
                  {lakeNumbers.join(' · ')}
                </text>
              </g>
            )}
            {!isSea && theme.hexShade && (
              <polygon
                points={hexPoints(h.q, h.r)}
                fill="url(#hex-shade)"
                pointerEvents="none"
                aria-hidden="true"
              />
            )}
            {!isSea && theme.hexInset && (
              <polygon
                points={hexPoints(h.q, h.r, 0.86)}
                fill="none"
                stroke={theme.hexInset}
                strokeOpacity={0.4}
                strokeWidth={2.5}
                pointerEvents="none"
                aria-hidden="true"
              />
            )}
            {!isSea && theme.terrainIcons && theme.terrainIcon[type] && (
              <g aria-hidden="true" pointerEvents="none">
                <circle
                  cx={c.x}
                  cy={c.y - S * 0.6}
                  r={S * 0.19}
                  fill={theme.token}
                  fillOpacity={0.9}
                  stroke={theme.outline}
                  strokeOpacity={0.35}
                />
                <text
                  x={c.x}
                  y={c.y - S * 0.6}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={S * 0.24}
                >
                  {theme.terrainIcon[type]}
                </text>
              </g>
            )}
            {(barbarians[h.id] ?? 0) >= 3 && (
              <polygon
                points={hexPoints(h.q, h.r)}
                fill="#2b1d14"
                opacity={0.45}
                pointerEvents="none"
              >
                <title>Held by barbarians: no production, and no building next to it</title>
              </polygon>
            )}
            {dry && h.props?.farmland === true && (
              <DryFarmland hex={h} S={S} points={hexPoints(h.q, h.r)} />
            )}
            {h.props?.basin === true && h.type === 'desert' && <DryBasin hex={h} S={S} />}
            {h.props?.goldRiver === true && !fog && <GoldRiver hex={h} S={S} />}
            {canal.has(h.id) && <CanalStretch hex={h} link={canal.get(h.id)!} S={S} />}
            {h.token && !fog && (barbarians[h.id] ?? 0) < 3 && (
              <g
                className={rolled === h.token ? 'token hot' : 'token'}
                opacity={dry && h.props?.farmland === true ? 0.55 : undefined}
              >
                <circle
                  cx={c.x}
                  cy={c.y}
                  r={S * 0.33}
                  fill={theme.token}
                  stroke={theme.outline}
                  strokeWidth={1.5}
                />
                <text
                  x={c.x}
                  y={c.y + S * 0.06}
                  textAnchor="middle"
                  fontSize={S * 0.3}
                  fontWeight={700}
                  fill={h.token === 6 || h.token === 8 ? theme.tokenHot : theme.tokenText}
                >
                  {h.token}
                </text>
                {Array.from({ length: PIPS[h.token] ?? 0 }, (_, i) => (
                  <circle
                    key={i}
                    cx={c.x + (i - ((PIPS[h.token as number] ?? 0) - 1) / 2) * S * 0.08}
                    cy={c.y + S * 0.2}
                    r={S * 0.028}
                    fill={h.token === 6 || h.token === 8 ? theme.tokenHot : theme.tokenText}
                  />
                ))}
              </g>
            )}
          </g>
        );
      })}

      {state.harbors.map((hb) => {
        const [a, b] = edgeEnds(hb.edge, g);
        const sea = (g.edgeHexes.get(hb.edge) ?? []).find((id) => state.hexes[id]?.type === 'sea');
        const sh = sea ? state.hexes[sea] : undefined;
        const sc = sh ? hexToPixel(sh.q, sh.r, S) : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const px = mx + (sc.x - mx) * 0.55;
        const py = my + (sc.y - my) * 0.55;
        return (
          <g key={hb.edge} className="harbor">
            <line x1={a.x} y1={a.y} x2={px} y2={py} stroke={theme.harborWood} strokeWidth={4} />
            <line x1={b.x} y1={b.y} x2={px} y2={py} stroke={theme.harborWood} strokeWidth={4} />
            <circle
              cx={px}
              cy={py}
              r={S * 0.27}
              fill={theme.harborFace}
              stroke={theme.harborWood}
              strokeWidth={2}
            />
            <text
              x={px}
              y={py - S * 0.02}
              textAnchor="middle"
              fontSize={S * 0.17}
              fontWeight={700}
              fill={theme.harborText}
            >
              {hb.ratio}:1
            </text>
            <text
              x={px}
              y={py + S * 0.17}
              textAnchor="middle"
              fontSize={S * 0.15}
              fill={theme.harborText}
            >
              {hb.resource === 'any' ? '?' : RESOURCE_ICON[hb.resource]}
            </text>
            <title>
              {hb.resource === 'any'
                ? 'Harbor: trade any 3 for 1'
                : `Harbor: trade 2 ${hb.resource} for 1`}
            </title>
          </g>
        );
      })}

      {pieces
        .filter((p) => p.at.kind === 'edge')
        // Rivers lie under everything else.
        .sort((x, y) => Number(y.type === 'river') - Number(x.type === 'river'))
        .map((p) => {
          const edge = (p.at as { id: EdgeId }).id;
          const [a, b] = edgeEnds(edge, g);
          const k = 0.16;
          const attrs =
            p.type === 'river'
              ? {}
              : motionAttrs(p.id, `edge:${edge}`, (a.x + b.x) / 2, (a.y + b.y) / 2, {
                  owner: p.owner,
                  kind: p.type,
                  ends: g.edgeCorners.get(edge),
                });
          const inner = (() => {
            if (p.type === 'river')
              return (
                <g key={p.id} strokeLinecap="round">
                  <line
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke={theme.seaEdge}
                    strokeWidth={S * 0.22}
                  />
                  <line
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke={theme.terrain.lake ?? theme.sea}
                    strokeWidth={S * 0.1}
                  />
                  <title>River: only a bridge can cross</title>
                </g>
              );
            if (p.type === 'bridge')
              return (
                <g key={p.id} filter={fx}>
                  <line
                    x1={a.x + (b.x - a.x) * 0.08}
                    y1={a.y + (b.y - a.y) * 0.08}
                    x2={b.x - (b.x - a.x) * 0.08}
                    y2={b.y - (b.y - a.y) * 0.08}
                    stroke={theme.harborWood}
                    strokeWidth={S * 0.22}
                    strokeLinecap="butt"
                  />
                  <line
                    x1={a.x + (b.x - a.x) * k}
                    y1={a.y + (b.y - a.y) * k}
                    x2={b.x - (b.x - a.x) * k}
                    y2={b.y - (b.y - a.y) * k}
                    stroke={color(p.owner)}
                    strokeWidth={S * 0.1}
                    strokeLinecap="round"
                  />
                  <title>Bridge</title>
                </g>
              );
            if (p.type === 'road' && p.props.damaged)
              return (
                <line
                  key={p.id}
                  x1={a.x + (b.x - a.x) * k}
                  y1={a.y + (b.y - a.y) * k}
                  x2={b.x - (b.x - a.x) * k}
                  y2={b.y - (b.y - a.y) * k}
                  stroke={color(p.owner)}
                  strokeWidth={S * 0.13}
                  strokeDasharray={`${S * 0.1} ${S * 0.06}`}
                  opacity={0.75}
                  filter={fx}
                >
                  <title>Damaged road: repair it before building new roads</title>
                </line>
              );
            if (p.type === 'ship')
              return <Ship key={p.id} a={a} b={b} color={color(p.owner)} theme={theme} fx={fx} />;
            return (
              <line
                key={p.id}
                x1={a.x + (b.x - a.x) * k}
                y1={a.y + (b.y - a.y) * k}
                x2={b.x - (b.x - a.x) * k}
                y2={b.y - (b.y - a.y) * k}
                stroke={color(p.owner)}
                strokeWidth={S * 0.13}
                strokeLinecap="round"
                filter={fx}
              />
            );
          })();
          return (
            <g key={p.id} {...attrs}>
              {inner}
            </g>
          );
        })}

      {((state.data['traders-barbarians']?.camels as EdgeId[] | undefined) ?? []).map((e) => {
        const [a, b] = edgeEnds(e, g);
        return (
          <text
            key={`camel-${e}`}
            x={(a.x + b.x) / 2}
            y={(a.y + b.y) / 2 + S * 0.1}
            textAnchor="middle"
            fontSize={S * 0.3}
            className="camel"
          >
            🐪<title>Camel: a road here counts double</title>
          </text>
        );
      })}

      {Object.entries(barbarians).map(([id, n]) => {
        const h = state.hexes[id as HexId];
        if (!h || n <= 0) return null;
        const c = hexToPixel(h.q, h.r, S);
        return (
          <g key={`barb-${id}`} className="barbarians" filter="url(#lift)">
            <circle
              cx={c.x}
              cy={c.y + S * 0.52}
              r={S * 0.17}
              fill={n >= 3 ? '#7a1f12' : '#3b2a20'}
              stroke="#f1e3c8"
              strokeWidth={2}
            />
            <text
              x={c.x}
              y={c.y + S * 0.59}
              textAnchor="middle"
              fontSize={S * 0.2}
              fill="#f1e3c8"
              fontWeight={700}
              pointerEvents="none"
            >
              {n}
            </text>
            <title>
              {n} barbarian{n === 1 ? '' : 's'}
              {n >= 3 ? ': this hex is held' : ''}
            </title>
          </g>
        );
      })}

      {Object.entries(dragons).map(([id, n]) => {
        const h = state.hexes[id as HexId];
        if (!h || n <= 0) return null;
        const c = hexToPixel(h.q, h.r, S);
        const lair = h.type === 'desert';
        return (
          <g key={`dragon-${id}`} className="dragon" pointerEvents="none">
            {!lair && <polygon points={hexPoints(h.q, h.r)} fill="#5b0f0a" opacity={0.38} />}
            <g filter="url(#lift)">
              <circle
                cx={c.x}
                cy={c.y + (lair ? 0 : S * 0.5)}
                r={S * (lair ? 0.3 : 0.2)}
                fill="#7a1a12"
                stroke="#f6d27a"
                strokeWidth={2}
              />
              <text
                x={c.x}
                y={c.y + (lair ? S * 0.02 : S * 0.5)}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={S * (lair ? 0.3 : 0.22)}
              >
                🐉
              </text>
              {lair && (
                <text
                  x={c.x + S * 0.24}
                  y={c.y + S * 0.26}
                  textAnchor="middle"
                  fontSize={S * 0.2}
                  fontWeight={700}
                  fill="#f6d27a"
                  stroke="#3a0b07"
                  strokeWidth={3}
                  paintOrder="stroke"
                >
                  {n}
                </text>
              )}
            </g>
            <title>
              {lair
                ? `${n} dragon${n === 1 ? '' : 's'} in the desert`
                : 'Dragon: this hex produces nothing'}
            </title>
          </g>
        );
      })}

      {pieces
        .filter((p) => p.type === 'road' && p.at.kind === 'edge')
        .map((p) => {
          const e = (p.at as { id: EdgeId }).id;
          const hs = g.edgeHexes.get(e) ?? [];
          if (hs.length !== 2 || !hs.every(dragonAt)) return null;
          const [a, b] = edgeEnds(e, g);
          const x = (a.x + b.x) / 2;
          const y = (a.y + b.y) / 2;
          const k = S * 0.09;
          return (
            <g key={`cut-${p.id}`} className="road-cut" pointerEvents="none">
              <path
                d={`M${x - k},${y - k} L${x + k},${y + k} M${x + k},${y - k} L${x - k},${y + k}`}
                stroke="#f6d27a"
                strokeWidth={4}
                strokeLinecap="round"
              />
              <path
                d={`M${x - k},${y - k} L${x + k},${y + k} M${x + k},${y - k} L${x - k},${y + k}`}
                stroke="#7a1a12"
                strokeWidth={2}
                strokeLinecap="round"
              />
              <title>Cut by dragons</title>
            </g>
          );
        })}

      {pieces
        .filter((p) => p.type === 'treasure' && p.at.kind === 'corner')
        .map((p) => {
          const corner = (p.at as { id: CornerId }).id;
          const c = cornerToPixel(corner, S);
          const w = S * 0.44;
          const h = S * 0.28;
          return (
            <g
              key={p.id}
              className="treasure"
              filter="url(#lift)"
              {...motionAttrs(p.id, `corner:${corner}`, c.x, c.y, { kind: 'treasure' })}
            >
              <rect
                x={c.x - w / 2}
                y={c.y - h / 2 + S * 0.03}
                width={w}
                height={h}
                rx={2}
                fill="#8a5a2b"
                stroke="#3b2616"
                strokeWidth={1.5}
              />
              <path
                d={`M${c.x - w / 2},${c.y - h / 2 + S * 0.03} q${w / 2},${-h * 0.9} ${w},0 z`}
                fill="#a86e35"
                stroke="#3b2616"
                strokeWidth={1.5}
              />
              <rect
                x={c.x - S * 0.05}
                y={c.y - S * 0.05}
                width={S * 0.1}
                height={S * 0.11}
                fill="#f2c230"
                stroke="#3b2616"
                strokeWidth={1}
              />
              <title>Treasure chest: build a road or ship here to open it</title>
            </g>
          );
        })}

      {hexes
        .filter((h) => h.props?.enchanted === true)
        .map((h) => (
          <polygon
            key={`ench-${h.id}`}
            className="enchanted"
            points={hexPoints(h.q, h.r)}
            fill="#6b3fa0"
            opacity={0.16}
            pointerEvents="none"
          />
        ))}

      {pieces
        .filter((p) => p.type === 'dragon' && p.at.kind === 'corner')
        .map((p) => {
          const corner = (p.at as { id: CornerId }).id;
          const c = cornerToPixel(corner, S);
          const tier = Number(p.props.tier ?? 1);
          const r = S * 0.17;
          return (
            <g
              key={p.id}
              className="dragon-piece"
              filter="url(#lift)"
              {...motionAttrs(p.id, `corner:${corner}`, c.x, c.y, { kind: 'dragon' })}
            >
              <circle
                cx={c.x}
                cy={c.y}
                r={r}
                fill={tier === 3 ? '#3a0b07' : tier === 2 ? '#7a1a12' : '#a8452a'}
                stroke="#f6d27a"
                strokeWidth={2}
              />
              <text
                x={c.x}
                y={c.y + S * 0.01}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={S * 0.18}
                pointerEvents="none"
              >
                🐉
              </text>
              {Array.from({ length: tier }, (_, i) => (
                <circle
                  key={i}
                  cx={c.x + (i - (tier - 1) / 2) * S * 0.08}
                  cy={c.y + r + S * 0.05}
                  r={S * 0.03}
                  fill="#f6d27a"
                  stroke="#3a0b07"
                  strokeWidth={1}
                />
              ))}
              <title>
                {tier === 1
                  ? 'Dragon: any knight can beat it'
                  : tier === 2
                    ? 'Dragon: only a strong or mighty knight can beat it'
                    : 'Dragon: only a mighty knight can beat it'}
              </title>
            </g>
          );
        })}

      {(tb?.edgeBarbarians ?? []).map((e) => {
        const [a, b] = edgeEnds(e, g);
        const x = (a.x + b.x) / 2;
        const y = (a.y + b.y) / 2;
        return (
          <g
            key={`ebarb-${e}`}
            className="barbarians"
            filter="url(#lift)"
            {...motionAttrs(`ebarb-${e}`, `edge:${e}`, x, y)}
          >
            <circle cx={x} cy={y} r={S * 0.17} fill="#3b2a20" stroke="#f1e3c8" strokeWidth={2} />
            <text
              x={x}
              y={y + S * 0.07}
              textAnchor="middle"
              fontSize={S * 0.18}
              pointerEvents="none"
            >
              🪓
            </text>
            <title>Barbarian: blocks road building; wagons pay 2 more moves to pass</title>
          </g>
        );
      })}

      {Object.entries(tb?.wagons ?? {}).map(([seat, w], i) => {
        if (!w.corner) return null;
        const p = cornerToPixel(w.corner, S);
        const x = p.x + S * 0.22 + (i % 2) * S * 0.12;
        const y = p.y - S * 0.22 + Math.floor(i / 2) * S * 0.12;
        return (
          <g
            key={`wagon-${seat}`}
            className="wagon"
            filter="url(#lift)"
            {...motionAttrs(`wagon-${seat}`, `corner:${w.corner}`, x, y)}
          >
            <rect
              x={x - S * 0.15}
              y={y - S * 0.11}
              width={S * 0.3}
              height={S * 0.18}
              rx={S * 0.04}
              fill={color(Number(seat))}
              stroke={theme.outline}
              strokeWidth={2}
            />
            <circle cx={x - S * 0.08} cy={y + S * 0.09} r={S * 0.05} fill={theme.outline} />
            <circle cx={x + S * 0.08} cy={y + S * 0.09} r={S * 0.05} fill={theme.outline} />
            <title>Wagon</title>
          </g>
        );
      })}

      {(tb?.knights ?? []).map((k) => {
        const [a, b] = edgeEnds(k.edge, g);
        const x = (a.x + b.x) / 2;
        const y = (a.y + b.y) / 2;
        const r = S * 0.16;
        return (
          <g
            key={`knight-${k.id}`}
            className="tb-knight"
            filter="url(#lift)"
            {...motionAttrs(`tbk-${k.id}`, `edge:${k.edge}`, x, y)}
          >
            <path
              d={`M${x - r},${y - r} h${2 * r} v${r * 0.9} q0,${r * 0.8} ${-r},${r * 1.2} q${-r},${-r * 0.4} ${-r},${-r * 1.2} z`}
              fill={color(k.owner)}
              stroke={theme.outline}
              strokeWidth={2}
            />
            <text
              x={x}
              y={y + r * 0.45}
              textAnchor="middle"
              fontSize={r * 1.3}
              fill="#fff"
              pointerEvents="none"
            >
              ♞
            </text>
            <title>Knight</title>
          </g>
        );
      })}

      {pirateHex?.kind === 'hex' &&
        (() => {
          const h = state.hexes[pirateHex.id];
          if (!h) return null;
          const c = hexToPixel(h.q, h.r, S);
          return (
            <g
              className="pirate"
              filter="url(#lift)"
              {...motionAttrs('pirate', `hex:${pirateHex.id}`, c.x, c.y)}
            >
              <path
                d={`M${c.x - S * 0.32},${c.y + S * 0.05} h${S * 0.64} l${-S * 0.12},${S * 0.2} h${-S * 0.4} z`}
                fill={theme.pirate}
              />
              <line
                x1={c.x}
                y1={c.y + S * 0.05}
                x2={c.x}
                y2={c.y - S * 0.38}
                stroke={theme.pirate}
                strokeWidth={S * 0.04}
              />
              <path
                d={`M${c.x},${c.y - S * 0.36} l${S * 0.26},${S * 0.1} l${-S * 0.26},${S * 0.1} z`}
                fill={theme.pirate}
              />
              <title>Pirate</title>
            </g>
          );
        })()}

      {robberHex?.kind === 'hex' &&
        (() => {
          const h = state.hexes[robberHex.id];
          if (!h) return null;
          const c = hexToPixel(h.q, h.r, S);
          const x = c.x + S * 0.42;
          const y = c.y + S * 0.1;
          return (
            <g
              className="robber"
              filter="url(#lift)"
              {...motionAttrs('robber', `hex:${robberHex.id}`, x, y)}
            >
              <ellipse cx={x} cy={y + S * 0.2} rx={S * 0.16} ry={S * 0.07} fill={theme.robber} />
              <path
                d={`M${x - S * 0.13},${y + S * 0.2} Q${x - S * 0.15},${y - S * 0.1} ${x},${y - S * 0.12} Q${x + S * 0.15},${y - S * 0.1} ${x + S * 0.13},${y + S * 0.2} z`}
                fill={theme.robber}
              />
              <circle cx={x} cy={y - S * 0.2} r={S * 0.1} fill={theme.robber} />
              <title>Robber</title>
            </g>
          );
        })()}

      {pieces
        .filter((p) => p.type === 'merchant' && p.at.kind === 'hex')
        .map((p) => {
          const h = state.hexes[(p.at as { id: HexId }).id];
          if (!h) return null;
          const c = hexToPixel(h.q, h.r, S);
          const x = c.x - S * 0.42;
          const y = c.y + S * 0.12;
          return (
            <g
              key={p.id}
              className="merchant"
              filter="url(#lift)"
              {...motionAttrs(p.id, `hex:${h.id}`, x, y)}
            >
              <circle
                cx={x}
                cy={y}
                r={S * 0.15}
                fill={color(p.owner)}
                stroke={theme.outline}
                strokeWidth={2}
              />
              <text
                x={x}
                y={y + S * 0.06}
                textAnchor="middle"
                fontSize={S * 0.17}
                fontWeight={700}
                fill="#fff"
              >
                M
              </text>
              <title>Merchant</title>
            </g>
          );
        })}

      {pieces
        .filter((p) => p.at.kind === 'corner' && p.type !== 'treasure' && p.type !== 'dragon')
        .map((p) => {
          const corner = (p.at as { id: CornerId }).id;
          const c = cornerToPixel(corner, S);
          const inner = (() => {
            const level = KNIGHT_LEVEL[p.type];
            if (level)
              return (
                <Knight
                  key={p.id}
                  x={c.x}
                  y={c.y}
                  color={color(p.owner)}
                  level={level}
                  active={p.props.active === true}
                  theme={theme}
                  fx={fx}
                />
              );
            return (
              <g key={p.id} filter={fx}>
                {p.props.wall === true && (
                  <rect
                    x={c.x - S * 0.32}
                    y={c.y + S * 0.08}
                    width={S * 0.64}
                    height={S * 0.14}
                    rx={2}
                    fill="#8a7f72"
                    stroke={theme.outline}
                    strokeWidth={2}
                  >
                    <title>City wall</title>
                  </rect>
                )}
                <HouseShape
                  x={c.x}
                  y={c.y}
                  color={color(p.owner)}
                  city={p.type === 'city'}
                  theme={theme}
                />
                {typeof p.props.metropolis === 'string' && (
                  <g>
                    <rect
                      x={c.x - S * 0.07}
                      y={c.y - S * 0.42}
                      width={S * 0.14}
                      height={S * 0.24}
                      fill={TRACK_COLOR[p.props.metropolis] ?? '#fff'}
                      stroke={theme.outline}
                      strokeWidth={2}
                    />
                    <title>{`Metropolis (${p.props.metropolis})`}</title>
                  </g>
                )}
              </g>
            );
          })();
          return (
            <g
              key={p.id}
              {...motionAttrs(p.id, `corner:${corner}`, c.x, c.y, { owner: p.owner, kind: p.type })}
            >
              {inner}
            </g>
          );
        })}

      {[...targets.hexes].map(([id, action]) => {
        const h = state.hexes[id];
        if (!h) return null;
        return (
          <polygon
            key={`t-${id}`}
            className="target target-hex"
            points={hexPoints(h.q, h.r)}
            onClick={() => onAction(action)}
            role="button"
            aria-label={`Choose ${h.type} hex`}
          />
        );
      })}
      {[...targets.edges].map(([id, action]) => {
        const [a, b] = edgeEnds(id, g);
        return (
          <line
            key={`t-${id}`}
            className="target target-edge"
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            onClick={() => onAction(action)}
            role="button"
            aria-label="Build here"
          />
        );
      })}
      {[...targets.corners].map(([id, action]) => {
        const c = cornerToPixel(id, S);
        return (
          <circle
            key={`t-${id}`}
            className="target target-corner"
            cx={c.x}
            cy={c.y}
            r={S * 0.16}
            onClick={() => onAction(action)}
            role="button"
            aria-label="Build here"
          />
        );
      })}
    </svg>
  );
}

export const Board = memo(BoardImpl);
