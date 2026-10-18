/**
 * Seeded, deterministic randomness for demo data. Same seed, same sequence,
 * on every machine and in every runtime: pure 32-bit integer math (FNV-1a for
 * the seed, mulberry32 for the stream). Never Math.random().
 *
 *   const rng = createRandom('hub-demo');
 *   rng.int(1, 6); rng.pick(['א', 'ב']); rng.fork('leads').uuid();
 *
 * fork(label) returns an independent stream seeded from `${seed}/${label}`, so
 * adding draws in one part of a fixture never shifts the values in another.
 */

/** FNV-1a 32-bit hash of a string. */
export function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: a small, fast PRNG with a full 2^32 period. Returns [0, 1). */
export function mulberry32(state: number): () => number {
  let a = state >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type DemoRandom = {
  readonly seed: string;
  /** [0, 1) */
  next(): number;
  /** Integer in [min, max], inclusive. */
  int(min: number, max: number): number;
  /** Float in [min, max). */
  float(min: number, max: number): number;
  bool(probability?: number): boolean;
  pick<T>(items: readonly T[]): T;
  /** Pick by weight: [[value, weight], ...]. */
  weighted<T>(items: ReadonlyArray<readonly [T, number]>): T;
  shuffle<T>(items: readonly T[]): T[];
  /** n distinct items (or all of them, shuffled, when n >= length). */
  sample<T>(items: readonly T[], n: number): T[];
  /** Normally distributed (Box-Muller). */
  normal(mean?: number, sd?: number): number;
  /** Deterministic RFC 4122 v4-shaped id. */
  uuid(): string;
  /** Independent child stream. */
  fork(label: string): DemoRandom;
};

export function createRandom(seed: string | number): DemoRandom {
  const seedText = String(seed);
  const next = mulberry32(hashSeed(seedText));

  const rng: DemoRandom = {
    seed: seedText,
    next,
    int(min, max) {
      const lo = Math.ceil(Math.min(min, max));
      const hi = Math.floor(Math.max(min, max));
      return lo + Math.floor(next() * (hi - lo + 1));
    },
    float(min, max) {
      return min + next() * (max - min);
    },
    bool(probability = 0.5) {
      return next() < probability;
    },
    pick(items) {
      if (items.length === 0) throw new Error('pick() from an empty list');
      return items[Math.floor(next() * items.length)];
    },
    weighted(items) {
      const total = items.reduce((sum, [, w]) => sum + Math.max(0, w), 0);
      if (total <= 0) throw new Error('weighted() needs a positive weight');
      let r = next() * total;
      for (const [value, w] of items) {
        r -= Math.max(0, w);
        if (r < 0) return value;
      }
      return items[items.length - 1][0];
    },
    shuffle(items) {
      const out = items.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    sample(items, n) {
      return rng.shuffle(items).slice(0, Math.max(0, n));
    },
    normal(mean = 0, sd = 1) {
      const u = 1 - next(); // (0, 1]: log() stays finite
      const v = next();
      return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    uuid() {
      const hex = Array.from({ length: 32 }, () => Math.floor(next() * 16).toString(16));
      hex[12] = '4';
      hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
      const s = hex.join('');
      return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
    },
    fork(label) {
      return createRandom(`${seedText}/${label}`);
    },
  };
  return rng;
}
