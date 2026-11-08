import type { PlayerShape } from '../theme/clean.ts';

/** A small coloured shape that identifies a player without relying on colour alone. */
export function PlayerBadge({
  color,
  shape,
  size = 16,
}: {
  color: string;
  shape: PlayerShape;
  size?: number;
}) {
  const s = size;
  const h = s / 2;
  const star = Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 ? h * 0.45 : h * 0.95;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    return `${h + r * Math.cos(a)},${h + r * Math.sin(a)}`;
  }).join(' ');
  const poly = (n: number, rot = -Math.PI / 2) =>
    Array.from({ length: n }, (_, i) => {
      const a = rot + (2 * Math.PI * i) / n;
      return `${h + h * 0.92 * Math.cos(a)},${h + h * 0.92 * Math.sin(a)}`;
    }).join(' ');
  const props = { fill: color, stroke: '#1d2321', strokeWidth: 1.2 };
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} aria-hidden="true" className="badge">
      {shape === 'circle' && <circle cx={h} cy={h} r={h * 0.85} {...props} />}
      {shape === 'square' && (
        <rect x={s * 0.1} y={s * 0.1} width={s * 0.8} height={s * 0.8} {...props} />
      )}
      {shape === 'triangle' && <polygon points={poly(3)} {...props} />}
      {shape === 'diamond' && <polygon points={poly(4)} {...props} />}
      {shape === 'star' && <polygon points={star} {...props} />}
      {shape === 'hexagon' && <polygon points={poly(6)} {...props} />}
      {shape === 'pentagon' && <polygon points={poly(5)} {...props} />}
      {shape === 'cross' && (
        <path
          d={`M${s * 0.35},${s * 0.05}h${s * 0.3}v${s * 0.3}h${s * 0.3}v${s * 0.3}h-${s * 0.3}v${s * 0.3}h-${s * 0.3}v-${s * 0.3}h-${s * 0.3}v-${s * 0.3}h${s * 0.3}z`}
          {...props}
        />
      )}
    </svg>
  );
}
