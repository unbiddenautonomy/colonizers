import { describe, expect, it } from 'vitest';
import { DECO_ICONS, ISLES_ICONS, POP_ICONS, WONDER_ICONS } from './iconSets.ts';
import { ICONS, type IconSet } from './icons.tsx';
import { BASE } from './kit.tsx';

const SETS: Record<string, IconSet> = {
  pop: POP_ICONS,
  deco: DECO_ICONS,
  wonder: WONDER_ICONS,
  isles: ISLES_ICONS,
};

const ARGS: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, Q: 4, C: 6, T: 2, A: 7, Z: 0 };

/** The points a path passes through (not its curve handles), as [x, y] with NaN for an unset axis. */
function ends(d: string): [number, number][] {
  const tokens = d.match(/[A-Za-z]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  const out: [number, number][] = [];
  let cmd = '';
  let i = 0;
  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i]!)) cmd = tokens[i++]!;
    const n = ARGS[cmd];
    if (n === undefined) throw new Error(`Unexpected command ${cmd} in ${d}`);
    if (n === 0) continue;
    const a = tokens.slice(i, i + n).map(Number);
    i += n;
    if (cmd === 'H') out.push([a[0]!, NaN]);
    else if (cmd === 'V') out.push([NaN, a[0]!]);
    else out.push([a[n - 2]!, a[n - 1]!]);
  }
  return out;
}

describe('per-skin icon sets', () => {
  for (const [name, set] of Object.entries(SETS))
    it(`${name}: draws all six lands inside the 40 × 24 icon box`, () => {
      for (const type of BASE) {
        expect(set[type].length).toBeGreaterThan(0);
        expect(set[type]).not.toEqual(ICONS[type]);
        for (const part of set[type])
          for (const [x, y] of ends(part.d)) {
            if (!Number.isNaN(x)) expect(x, `${type} ${part.d}`).toBeGreaterThanOrEqual(0);
            if (!Number.isNaN(x)) expect(x, `${type} ${part.d}`).toBeLessThanOrEqual(40);
            if (!Number.isNaN(y)) expect(y, `${type} ${part.d}`).toBeGreaterThanOrEqual(0);
            if (!Number.isNaN(y)) expect(y, `${type} ${part.d}`).toBeLessThanOrEqual(24);
          }
      }
    });
});
