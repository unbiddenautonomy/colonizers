import { useRef, useState, type ReactNode } from 'react';

const MIN = 1;
const MAX = 3;
/** How far a finger or mouse moves before a press counts as a drag, not a tap. */
const DRAG = 8;

interface View {
  scale: number;
  x: number;
  y: number;
}

const FIT: View = { scale: 1, x: 0, y: 0 };

/**
 * Pinch or scroll to zoom the board, drag to pan once zoomed in, and a
 * button to fit it back to the screen. A tap that didn't move still reaches
 * the board, so placing pieces works the same zoomed in or out.
 */
export function ZoomPane({ children }: { children: ReactNode }) {
  const [view, setView] = useState<View>(FIT);
  const box = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    start: View;
    /** Where the gesture began (the midpoint for a pinch). */
    cx: number;
    cy: number;
    dist: number;
    moved: boolean;
  } | null>(null);
  const swallowClick = useRef(false);

  const clamp = (v: View): View => {
    const scale = Math.min(MAX, Math.max(MIN, v.scale));
    if (scale === 1) return FIT;
    const r = box.current?.getBoundingClientRect();
    const w = r?.width ?? 0;
    const h = r?.height ?? 0;
    // Keep some of the board on screen whichever way it is dragged.
    const mx = (w * (scale - 1)) / 2 + w * 0.25;
    const my = (h * (scale - 1)) / 2 + h * 0.25;
    return {
      scale,
      x: Math.min(mx, Math.max(-mx, v.x)),
      y: Math.min(my, Math.max(-my, v.y)),
    };
  };

  /** Zoom by `factor` keeping the screen point (px, py) still. */
  const zoomAt = (v: View, factor: number, px: number, py: number): View => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return v;
    const scale = Math.min(MAX, Math.max(MIN, v.scale * factor));
    const k = scale / v.scale;
    // Point relative to the pane's centre, where the transform origin is.
    const ox = px - (r.left + r.width / 2);
    const oy = py - (r.top + r.height / 2);
    return clamp({ scale, x: ox - (ox - v.x) * k, y: oy - (oy - v.y) * k });
  };

  const begin = () => {
    const pts = [...pointers.current.values()];
    const [a, b] = pts;
    if (!a) return;
    gesture.current = {
      start: view,
      cx: b ? (a.x + b.x) / 2 : a.x,
      cy: b ? (a.y + b.y) / 2 : a.y,
      dist: b ? Math.hypot(a.x - b.x, a.y - b.y) : 0,
      moved: gesture.current?.moved ?? false,
    };
  };

  return (
    <div
      ref={box}
      className={`zoom-pane${view.scale > 1 ? ' zoomed' : ''}`}
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        // A pinch ends without a click, so a swallow left over from one would
        // have eaten the next real tap: the first tap after a zoom did nothing.
        swallowClick.current = false;
        if (pointers.current.size === 1) gesture.current = null;
        begin();
      }}
      onPointerMove={(e) => {
        if (!pointers.current.has(e.pointerId)) return;
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const g = gesture.current;
        if (!g) return;
        const [a, b] = [...pointers.current.values()];
        if (!a) return;
        if (b) {
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          g.moved = true;
          const zoomed = zoomAt(g.start, dist / (g.dist || dist), g.cx, g.cy);
          setView(clamp({ ...zoomed, x: zoomed.x + mx - g.cx, y: zoomed.y + my - g.cy }));
          return;
        }
        const dx = a.x - g.cx;
        const dy = a.y - g.cy;
        if (!g.moved && Math.hypot(dx, dy) < DRAG) return;
        if (g.start.scale === 1) return;
        g.moved = true;
        if (!box.current?.hasPointerCapture(e.pointerId))
          box.current?.setPointerCapture(e.pointerId);
        setView(clamp({ ...g.start, x: g.start.x + dx, y: g.start.y + dy }));
      }}
      onPointerUp={(e) => {
        pointers.current.delete(e.pointerId);
        if (gesture.current?.moved) swallowClick.current = true;
        if (pointers.current.size) begin();
        else gesture.current = null;
      }}
      onPointerCancel={(e) => {
        pointers.current.delete(e.pointerId);
        gesture.current = null;
        if (!pointers.current.size) swallowClick.current = false;
      }}
      onClickCapture={(e) => {
        // The end of a drag or pinch is not a tap on the board.
        if (swallowClick.current) {
          swallowClick.current = false;
          e.stopPropagation();
          e.preventDefault();
        }
      }}
      onWheel={(e) => {
        setView((v) => zoomAt(v, e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY));
      }}
      onDoubleClick={(e) => {
        if ((e.target as Element).closest('.target')) return;
        setView((v) => (v.scale > 1 ? FIT : zoomAt(v, 2, e.clientX, e.clientY)));
      }}
    >
      <div
        className="zoom-inner"
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
      >
        {children}
      </div>
      {view.scale > 1 && (
        <button type="button" className="zoom-fit" onClick={() => setView(FIT)}>
          ⤢ Fit
        </button>
      )}
    </div>
  );
}
