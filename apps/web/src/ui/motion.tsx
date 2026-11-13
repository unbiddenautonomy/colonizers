import { useEffect, useSyncExternalStore } from 'react';

/**
 * How much the game animates, per device: Normal, Fast (about half the
 * time) or Off. "Reduce motion" in the system settings always means Off.
 * Animations never block a tap; they only show what already happened.
 */
export type MotionLevel = 'normal' | 'fast' | 'off';

export const MOTION_LEVELS: { id: MotionLevel; name: string }[] = [
  { id: 'normal', name: 'Normal' },
  { id: 'fast', name: 'Fast' },
  { id: 'off', name: 'Off' },
];

const KEY = 'colonizers.motion';
const listeners = new Set<() => void>();

function read(): MotionLevel {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'fast' || v === 'off' ? v : 'normal';
  } catch {
    return 'normal';
  }
}

let current = read();

export function setMotion(level: MotionLevel): void {
  current = level;
  try {
    localStorage.setItem(KEY, level);
  } catch {
    // Private mode: the choice lasts until the page closes.
  }
  for (const l of listeners) l();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useMotion(): MotionLevel {
  return useSyncExternalStore(subscribe, () => current);
}

function reducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * The factor to multiply animation times by: 1, 0.55, or 0 for none. Also
 * 0 where the browser can't animate elements.
 */
export function motionScale(): number {
  if (current === 'off' || reducedMotion()) return 0;
  if (typeof Element === 'undefined' || typeof Element.prototype.animate !== 'function') return 0;
  return current === 'fast' ? 0.55 : 1;
}

/** Puts the level on the page, so CSS animations can follow it too. */
export function MotionStyles() {
  const level = useMotion();
  useEffect(() => {
    document.documentElement.dataset.motion = level;
  }, [level]);
  return null;
}

export function MotionPicker({ compact }: { compact?: boolean }) {
  const level = useMotion();
  return (
    <label className="theme-picker" title="Animations">
      {compact ? <span aria-hidden="true">✨</span> : 'Animations '}
      <select
        value={level}
        onChange={(e) => setMotion(e.target.value as MotionLevel)}
        aria-label="Animations"
      >
        {MOTION_LEVELS.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
    </label>
  );
}
