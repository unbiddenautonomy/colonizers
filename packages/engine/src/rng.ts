/**
 * Seeded random number generator (sfc32).
 *
 * Every game is its seed plus a list of actions, so the RNG must be
 * deterministic and its state must be saveable. The state is four uint32s,
 * small enough to store in every snapshot.
 */
export type RngState = readonly [number, number, number, number];

/** Turns any string into a 128-bit seed (cyrb128). */
export function hashSeed(seed: string): RngState {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < seed.length; i++) {
    const k = seed.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  private constructor(state: RngState) {
    [this.a, this.b, this.c, this.d] = state;
  }

  static fromSeed(seed: string): Rng {
    const rng = new Rng(hashSeed(seed));
    // Warm up so similar seeds diverge quickly.
    for (let i = 0; i < 12; i++) rng.nextUint32();
    return rng;
  }

  static fromState(state: RngState): Rng {
    return new Rng(state);
  }

  getState(): RngState {
    return [this.a, this.b, this.c, this.d];
  }

  nextUint32(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  /** A float in [0, 1). */
  nextFloat(): number {
    return this.nextUint32() / 4294967296;
  }

  /** An integer in [min, max], both inclusive, with no modulo bias. */
  int(min: number, max: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
      throw new RangeError(`Invalid range [${min}, ${max}]`);
    }
    const range = max - min + 1;
    if (range > 4294967296) throw new RangeError('Range too large');
    const limit = 4294967296 - (4294967296 % range);
    let x: number;
    do {
      x = this.nextUint32();
    } while (x >= limit);
    return min + (x % range);
  }

  /** Shuffles a copy of the array (Fisher-Yates). */
  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [out[i], out[j]] = [out[j] as T, out[i] as T];
    }
    return out;
  }
}
