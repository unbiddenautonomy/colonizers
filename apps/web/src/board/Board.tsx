import { memo, useMemo } from 'react';
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
import { cleanTheme, RESOURCE_ICON, type Theme } from '../theme/clean.ts';

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

function hexPoints(q: number, r: number): string {
  const c = hexToPixel(q, r, S);
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 90);
    return `${(c.x + S * Math.cos(a)).toFixed(1)},${(c.y + S * Math.sin(a)).toFixed(1)}`;
  }).join(' ');
}

function edgeEnds(edge: EdgeId, g: ReturnType<typeof buildGeometry>) {
  const [a, b] = g.edgeCorners.get(edge) as [CornerId, CornerId];
  return [cornerToPixel(a, S), cornerToPixel(b, S)] as const;
}

function HouseShape({ x, y, color, city }: { x: number; y: number; color: string; city: boolean }) {
  const k = S * 0.2;
  const d = city
    ? `M${x - k * 1.3},${y + k * 0.9} v${-k * 1.2} l${k * 0.65},${-k * 0.7} l${k * 0.65},${k * 0.7} h${k * 1.3} v${k * 1.2} z`
    : `M${x - k * 0.85},${y + k * 0.8} v${-k * 1.0} l${k * 0.85},${-k * 0.8} l${k * 0.85},${k * 0.8} v${k * 1.0} z`;
  return <path d={d} fill={color} stroke="#1d2321" strokeWidth={2.5} strokeLinejoin="round" />;
}

function BoardImpl({ state, targets, onAction, theme = cleanTheme, rolled }: BoardProps) {
  const hexes = useMemo(() => Object.values(state.hexes), [state.hexes]);
  const g = useMemo(() => buildGeometry(hexes.map((h) => h.id)), [hexes]);

  const viewBox = useMemo(() => {
    const xs: number[] = [];
    const ys: number[] = [];
    // Frame the land (plus room for harbors), not the whole sea ring.
    const land = hexes.filter((h) => h.type !== 'sea');
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

  return (
    <svg className="board" viewBox={viewBox} role="img" aria-label="Game board">
      <defs>
        <filter id="lift" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.35" />
        </filter>
      </defs>

      {hexes.map((h) => {
        const isSea = h.type === 'sea';
        const c = hexToPixel(h.q, h.r, S);
        const fill = isSea ? theme.sea : (theme.terrain[h.type] ?? '#ccc');
        return (
          <g key={h.id}>
            <polygon
              points={hexPoints(h.q, h.r)}
              fill={fill}
              stroke={isSea ? theme.seaEdge : '#f6f3ea'}
              strokeWidth={isSea ? 0.5 : 3}
              strokeOpacity={isSea ? 0.5 : 1}
            >
              <title>{h.hidden ? 'Unexplored' : h.type}</title>
            </polygon>
            {!isSea && theme.terrainIcon[h.type] && (
              <text
                x={c.x}
                y={c.y - S * 0.48}
                textAnchor="middle"
                fontSize={S * 0.28}
                aria-hidden="true"
              >
                {theme.terrainIcon[h.type]}
              </text>
            )}
            {h.token && (
              <g className={rolled === h.token ? 'token hot' : 'token'}>
                <circle
                  cx={c.x}
                  cy={c.y}
                  r={S * 0.33}
                  fill={theme.token}
                  stroke="#1d2321"
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
            <line x1={a.x} y1={a.y} x2={px} y2={py} stroke="#7b5b3a" strokeWidth={4} />
            <line x1={b.x} y1={b.y} x2={px} y2={py} stroke="#7b5b3a" strokeWidth={4} />
            <circle cx={px} cy={py} r={S * 0.27} fill="#fbf6e9" stroke="#7b5b3a" strokeWidth={2} />
            <text x={px} y={py - S * 0.02} textAnchor="middle" fontSize={S * 0.17} fontWeight={700}>
              {hb.ratio}:1
            </text>
            <text x={px} y={py + S * 0.17} textAnchor="middle" fontSize={S * 0.15}>
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
        .map((p) => {
          const [a, b] = edgeEnds((p.at as { id: EdgeId }).id, g);
          const k = 0.16;
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
              filter="url(#lift)"
            />
          );
        })}

      {robberHex?.kind === 'hex' &&
        (() => {
          const h = state.hexes[robberHex.id];
          if (!h) return null;
          const c = hexToPixel(h.q, h.r, S);
          const x = c.x + S * 0.42;
          const y = c.y + S * 0.1;
          return (
            <g className="robber" filter="url(#lift)">
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
        .filter((p) => p.at.kind === 'corner')
        .map((p) => {
          const c = cornerToPixel((p.at as { id: CornerId }).id, S);
          return (
            <g key={p.id} filter="url(#lift)">
              <HouseShape x={c.x} y={c.y} color={color(p.owner)} city={p.type === 'city'} />
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
