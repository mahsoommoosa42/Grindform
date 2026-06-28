/**
 * @file packages/planner/src/rng.ts
 *
 * A tiny, deterministic pseudo-random generator (mulberry32). Seeding it
 * from the plan input makes generation reproducible — the same input
 * always yields the same plan — which is what lets the "boredom swap"
 * feature offer a *different* plan simply by changing the seed, and lets
 * tests assert exact output.
 */

/** A seeded source of pseudo-random numbers. */
export interface Rng {
  /** Next float in [0, 1). */
  next(): number;
  /** Next integer in [0, max). Returns 0 when `max <= 0`. */
  int(max: number): number;
}

/**
 * Build a deterministic {@link Rng} from a 32-bit integer seed
 * (mulberry32). Fast, tiny, and good enough for shuffling exercise
 * candidates — not for anything cryptographic.
 */
export const makeRng = (seed: number): Rng => {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (max: number): number => (max <= 0 ? 0 : Math.floor(next() * max)),
  };
};
