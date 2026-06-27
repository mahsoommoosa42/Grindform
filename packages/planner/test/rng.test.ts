import { describe, expect, it } from 'vitest';

import { makeRng } from '../src/rng.ts';

describe('makeRng', () => {
  it('is deterministic for a given seed', () => {
    const a = makeRng(123);
    const b = makeRng(123);
    const seqA = [a.next(), a.next(), a.next()];
    const seqB = [b.next(), b.next(), b.next()];
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    expect(makeRng(1).next()).not.toBe(makeRng(2).next());
  });

  it('next() stays within [0, 1)', () => {
    const rng = makeRng(99);
    for (let i = 0; i < 100; i += 1) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int(max) stays within [0, max)', () => {
    const rng = makeRng(7);
    for (let i = 0; i < 100; i += 1) {
      const v = rng.int(5);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(5);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('int(0) and int(negative) return 0', () => {
    const rng = makeRng(1);
    expect(rng.int(0)).toBe(0);
    expect(rng.int(-3)).toBe(0);
  });
});
