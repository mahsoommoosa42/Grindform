/**
 * @file packages/loadcalc/test/formulas.test.ts
 */

import { describe, expect, it } from 'vitest';

import { estimateOneRepMax, roundToIncrement } from '../src/formulas.ts';

describe('estimateOneRepMax', () => {
  it('returns the weight unchanged for a single rep', () => {
    expect(estimateOneRepMax({ weight: 100, reps: 1 })).toBe(100);
  });

  it('applies the Epley formula for multiple reps', () => {
    // 100 * (1 + 5/30) = 116.666…
    expect(estimateOneRepMax({ weight: 100, reps: 5 })).toBeCloseTo(116.6667, 3);
    expect(estimateOneRepMax({ weight: 60, reps: 10 })).toBeCloseTo(80, 6);
  });

  it.each([0, -10, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects a non-positive or non-finite weight (%s)',
    (weight) => {
      expect(() => estimateOneRepMax({ weight, reps: 5 })).toThrow(RangeError);
    },
  );

  it.each([0, -1, 2.5, Number.NaN])('rejects a non-integer or < 1 reps (%s)', (reps) => {
    expect(() => estimateOneRepMax({ weight: 100, reps })).toThrow(RangeError);
  });
});

describe('roundToIncrement', () => {
  it('snaps to the nearest increment', () => {
    expect(roundToIncrement(101.2, 2.5)).toBe(100);
    expect(roundToIncrement(101.3, 2.5)).toBe(102.5);
  });

  it('never returns below a single increment', () => {
    expect(roundToIncrement(0.4, 2.5)).toBe(2.5);
    expect(roundToIncrement(-5, 2.5)).toBe(2.5);
  });

  it('avoids binary-float noise', () => {
    expect(roundToIncrement(67.5, 2.5)).toBe(67.5);
  });

  it.each([0, -2.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects a non-positive or non-finite increment (%s)',
    (increment) => {
      expect(() => roundToIncrement(100, increment)).toThrow(RangeError);
    },
  );
});
