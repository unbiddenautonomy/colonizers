import { useLayoutEffect, useRef, type RefObject } from 'react';
import type { CornerId, EdgeId, Geometry } from '@colonizers/engine';
import { motionScale } from '../ui/motion.tsx';

/**
 * Short animations for what changed on the board: new buildings drop in, a
 * city grows out of its settlement, a road draws from the end it joins, a
 * ship sails in, and the robber, pirate, ships, knights and wagons hop from
 * where they were to where they are now.
 *
 * Every animated piece carries `data-key` (its identity across renders),
 * `data-at` (where it is), `data-x`/`data-y` (its spot on the board) and
 * optionally `data-owner`, `data-kind` and `data-ends` (an edge's corners).
 * After each render this compares the pieces with the last render's.
 */

interface Spot {
  key: string;
  at: string;
  x: number;
  y: number;
  owner: string | undefined;
  kind: string | undefined;
  ends: string | undefined;
}

/** Attributes that make a board element animate (see above). */
export function motionAttrs(
  key: string,
  at: string,
  x: number,
  y: number,
  extra: {
    owner?: number | null;
    kind?: string;
    ends?: readonly [CornerId, CornerId] | undefined;
  } = {},
): Record<string, string> {
  const out: Record<string, string> = {
    'data-key': key,
    'data-at': at,
    'data-x': x.toFixed(1),
    'data-y': y.toFixed(1),
  };
  if (extra.owner !== undefined && extra.owner !== null) out['data-owner'] = String(extra.owner);
  if (extra.kind) out['data-kind'] = extra.kind;
  if (extra.ends) out['data-ends'] = extra.ends.join(' ');
  return out;
}

function read(el: Element): Spot {
  const d = (el as SVGElement).dataset;
  return {
    key: d.key ?? '',
    at: d.at ?? '',
    x: Number(d.x),
    y: Number(d.y),
    owner: d.owner,
    kind: d.kind,
    ends: d.ends,
  };
}

/** A new building lands with a small bounce. */
function drop(el: SVGElement, k: number) {
  el.style.transformBox = 'fill-box';
  el.style.transformOrigin = '50% 100%';
  el.animate(
    [
      { transform: 'translateY(-34px) scale(1.15)', opacity: 0 },
      { transform: 'translateY(0) scale(1.08, 0.86)', opacity: 1, offset: 0.55 },
      { transform: 'translateY(-6px) scale(0.98, 1.03)', offset: 0.78 },
      { transform: 'none' },
    ],
    { duration: 460 * k, easing: 'ease-out' },
  );
}

/** A city (or a stronger knight) grows out of the piece it replaces. */
function grow(el: SVGElement, k: number) {
  el.style.transformBox = 'fill-box';
  el.style.transformOrigin = '50% 100%';
  el.animate(
    [
      { transform: 'scale(0.55)', opacity: 0.6 },
      { transform: 'scale(1.18)', opacity: 1, offset: 0.6 },
      { transform: 'none' },
    ],
    { duration: 480 * k, easing: 'cubic-bezier(.3,.7,.4,1.2)' },
  );
}

/** A ship sails in from a little way off. */
function sail(el: SVGElement, k: number) {
  el.animate(
    [
      { transform: 'translate(-14px, 10px)', opacity: 0 },
      { transform: 'none', opacity: 1 },
    ],
    { duration: 420 * k, easing: 'ease-out' },
  );
}

/** A road draws along its edge, starting from the end that joins the rest. */
function draw(el: SVGElement, fromEnd: boolean, k: number) {
  const line = el.querySelector('line');
  if (!line) return drop(el, k);
  const len = Math.hypot(
    Number(line.getAttribute('x2')) - Number(line.getAttribute('x1')),
    Number(line.getAttribute('y2')) - Number(line.getAttribute('y1')),
  );
  const dash = `${len} ${len}`;
  line.animate(
    [
      { strokeDasharray: dash, strokeDashoffset: fromEnd ? -len : len },
      { strokeDasharray: dash, strokeDashoffset: 0 },
    ],
    { duration: 380 * k, easing: 'ease-out' },
  );
}

/** A piece hops in an arc from where it was. */
function hop(el: SVGElement, dx: number, dy: number, k: number) {
  const dist = Math.hypot(dx, dy);
  if (dist < 1) return;
  const lift = Math.min(70, 18 + dist * 0.25);
  el.animate(
    [
      { transform: `translate(${dx}px, ${dy}px)` },
      { transform: `translate(${dx / 2}px, ${dy / 2 - lift}px)`, offset: 0.5 },
      { transform: 'translate(0px, -4px)', offset: 0.85 },
      { transform: 'none' },
    ],
    { duration: Math.min(700, 360 + dist * 0.6) * k, easing: 'ease-in-out' },
  );
}

/** True if the owner already had something at this corner or on an edge touching it. */
function joined(corner: string, owner: string | undefined, before: Spot[], g: Geometry): boolean {
  if (owner === undefined) return false;
  const edges = new Set(
    (g.cornerEdges.get(corner as CornerId) ?? []).map((e: EdgeId) => `edge:${e}`),
  );
  return before.some((s) => s.owner === owner && (s.at === `corner:${corner}` || edges.has(s.at)));
}

/** Animates what changed on the board since the last render. */
export function useBoardMotion(
  ref: RefObject<SVGSVGElement | null>,
  g: Geometry,
  changed: unknown,
): void {
  const prev = useRef<Map<string, Spot> | null>(null);
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const now = new Map<string, Spot>();
    const els = new Map<string, SVGElement>();
    for (const el of root.querySelectorAll<SVGElement>('[data-key]')) {
      const s = read(el);
      now.set(s.key, s);
      els.set(s.key, el);
    }
    const before = prev.current;
    prev.current = now;
    const k = motionScale();
    if (!before || k === 0) return;
    const fresh = [...now.keys()].filter((key) => !before.has(key));
    // A whole new board (a new game, or catching up after a reconnect): no show.
    if (fresh.length > 10) return;

    const gone = [...before.values()].filter((s) => !now.has(s.key));
    const old = [...before.values()];
    for (const [key, s] of now) {
      const el = els.get(key)!;
      const was = before.get(key);
      if (was) {
        if (was.at !== s.at || was.x !== s.x || was.y !== s.y) hop(el, was.x - s.x, was.y - s.y, k);
        continue;
      }
      if (s.at.startsWith('corner:') && gone.some((o) => o.at === s.at)) grow(el, k);
      else if (s.kind === 'road' && s.ends) {
        const [a, b] = s.ends.split(' ') as [string, string];
        draw(el, joined(b, s.owner, old, g) && !joined(a, s.owner, old, g), k);
      } else if (s.kind === 'ship') sail(el, k);
      else drop(el, k);
    }
  }, [ref, g, changed]);
}
