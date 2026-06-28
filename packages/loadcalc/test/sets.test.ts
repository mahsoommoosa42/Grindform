/**
 * @file packages/loadcalc/test/sets.test.ts
 */

import { describe, expect, it } from 'vitest';

import { expandSets } from '../src/sets.ts';
import type { PlannedSet } from '../src/sets.ts';

const weights = (sets: readonly PlannedSet[]): readonly (number | undefined)[] =>
  sets.map((s) => s.weightKg);

describe('expandSets', () => {
  it('produces one working set per prescribed set with no warm-ups by default', () => {
    const sets = expandSets({ workingSets: 4, repsLow: 8, repsHigh: 12, intensity: 0.72 });
    expect(sets).toHaveLength(4);
    expect(sets.every((s) => s.kind === 'working')).toBe(true);
  });

  it('uses repsHigh and a flat intensity for straight (non-pyramid) sets', () => {
    const sets = expandSets({ workingSets: 3, repsLow: 8, repsHigh: 12, intensity: 0.72 });
    expect(sets.map((s) => s.reps)).toEqual([12, 12, 12]);
    expect(sets.map((s) => s.intensityPct)).toEqual([72, 72, 72]);
  });

  it('leaves weightKg blank when no 1RM is supplied', () => {
    const sets = expandSets({ workingSets: 2, repsLow: 5, repsHigh: 5, intensity: 0.8 });
    expect(weights(sets)).toEqual([undefined, undefined]);
  });

  it('fills rounded target weights when a 1RM is supplied', () => {
    const sets = expandSets({
      workingSets: 3,
      repsLow: 8,
      repsHigh: 12,
      intensity: 0.72,
      oneRepMax: 100,
    });
    // 100 * 0.72 = 72 → nearest 2.5 = 72.5
    expect(weights(sets)).toEqual([72.5, 72.5, 72.5]);
  });

  it('ramps weight up and reps down across a pyramid', () => {
    const sets = expandSets({
      workingSets: 4,
      repsLow: 5,
      repsHigh: 12,
      intensity: 0.85,
      oneRepMax: 100,
      pyramid: true,
    });
    const w = weights(sets) as number[];
    expect(w[0]).toBeLessThan(w[3] as number);
    for (let i = 1; i < w.length; i += 1) {
      expect(w[i]).toBeGreaterThanOrEqual(w[i - 1] as number);
    }
    // reps descend from repsHigh to repsLow; top set is the heaviest/lowest reps.
    expect(sets[0]?.reps).toBe(12);
    expect(sets.at(-1)?.reps).toBe(5);
    expect(sets.at(-1)?.intensityPct).toBe(85);
  });

  it('does not pyramid a single working set', () => {
    const sets = expandSets({
      workingSets: 1,
      repsLow: 5,
      repsHigh: 5,
      intensity: 0.85,
      oneRepMax: 100,
      pyramid: true,
    });
    expect(sets).toHaveLength(1);
    expect(sets[0]?.intensityPct).toBe(85);
  });

  it('floors pyramid intensity so light sets never go below 50%', () => {
    const sets = expandSets({
      workingSets: 6,
      repsLow: 3,
      repsHigh: 8,
      intensity: 0.7,
      oneRepMax: 100,
      pyramid: true,
    });
    expect(Math.min(...sets.map((s) => s.intensityPct))).toBeGreaterThanOrEqual(50);
  });

  it('prepends warm-up sets that are lighter than the first working set', () => {
    const sets = expandSets({
      workingSets: 3,
      repsLow: 8,
      repsHigh: 12,
      intensity: 0.72,
      oneRepMax: 100,
      warmupSets: 2,
    });
    expect(sets).toHaveLength(5);
    expect(sets.slice(0, 2).every((s) => s.kind === 'warmup')).toBe(true);
    expect(sets.slice(2).every((s) => s.kind === 'working')).toBe(true);
    const firstWorking = sets[2]?.weightKg as number;
    expect(sets[0]?.weightKg).toBeLessThan(firstWorking);
    expect(sets[1]?.weightKg).toBeLessThan(firstWorking);
    // warm-up ramp ascends
    expect(sets[0]?.weightKg).toBeLessThanOrEqual(sets[1]?.weightKg as number);
  });

  it.each([
    { workingSets: 0, repsLow: 5, repsHigh: 5, intensity: 0.8 },
    { workingSets: 1.5, repsLow: 5, repsHigh: 5, intensity: 0.8 },
    { workingSets: 3, repsLow: 0, repsHigh: 5, intensity: 0.8 },
    { workingSets: 3, repsLow: 8, repsHigh: 5, intensity: 0.8 },
    { workingSets: 3, repsLow: 5, repsHigh: 5, intensity: 0 },
    { workingSets: 3, repsLow: 5, repsHigh: 5, intensity: 1.2 },
    { workingSets: 3, repsLow: 5, repsHigh: 5, intensity: 0.8, warmupSets: -1 },
    { workingSets: 3, repsLow: 5, repsHigh: 5, intensity: 0.8, warmupSets: 1.5 },
    { workingSets: 3, repsLow: 5, repsHigh: 5, intensity: 0.8, oneRepMax: 0 },
  ])('rejects invalid input %#', (input) => {
    expect(() => expandSets(input)).toThrow(RangeError);
  });
});
