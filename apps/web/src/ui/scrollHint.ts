import { useEffect, useRef, type RefObject } from 'react';

/** Which way a sideways-scrolling strip has more to show. */
export interface ScrollEdges {
  left: boolean;
  right: boolean;
}

/**
 * Whether a strip is scrolled away from each end. The player strip holds
 * about two and a half cards on a phone and nothing said it scrolled, so a
 * fade is drawn at whichever end has more players along it.
 */
export function scrollEdges(
  el: { scrollLeft: number; scrollWidth: number; clientWidth: number },
  slack = 4,
): ScrollEdges {
  const max = el.scrollWidth - el.clientWidth;
  if (max <= slack) return { left: false, right: false };
  return { left: el.scrollLeft > slack, right: el.scrollLeft < max - slack };
}

/**
 * Keeps `data-more` on a strip up to date ("left", "right", "both" or gone),
 * so CSS can fade the end that has more along it. Returns the ref to put on
 * the strip.
 */
export function useScrollHint<T extends HTMLElement>(deps: unknown[] = []): RefObject<T | null> {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mark = () => {
      const { left, right } = scrollEdges(el);
      const value = left && right ? 'both' : left ? 'left' : right ? 'right' : null;
      if (value) el.setAttribute('data-more', value);
      else el.removeAttribute('data-more');
    };
    mark();
    el.addEventListener('scroll', mark, { passive: true });
    const sizes = new ResizeObserver(mark);
    sizes.observe(el);
    for (const child of el.children) sizes.observe(child);
    return () => {
      el.removeEventListener('scroll', mark);
      sizes.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}
