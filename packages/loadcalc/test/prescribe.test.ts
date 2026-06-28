/**
 * @file packages/loadcalc/test/prescribe.test.ts
 */

import { describe, expect, it } from 'vitest';

import { GOAL_PROFILES, loadGoalForGoal, prescribeLoad, profileForGoal } from '../src/prescribe.ts';
import type { LoadGoal } from '../src/prescribe.ts';

describe('loadGoalForGoal', () => {
  it.each([
    ['build_muscle', 'hypertrophy'],
    ['lose_fat', 'hypertrophy'],
    ['recomp', 'hypertrophy'],
    ['build_endurance', 'endurance'],
  ] as const)('maps %s to the %s band', (goal, expected) => {
    expect(loadGoalForGoal(goal)).toBe(expected);
  });
});

describe('profileForGoal', () => {
  it.each(GOAL_PROFILES.map((p) => p.goal))('returns the profile for %s', (goal) => {
    expect(profileForGoal(goal).goal).toBe(goal);
  });

  it('throws on an unknown goal', () => {
    expect(() => profileForGoal('powerlifting' as LoadGoal)).toThrow(RangeError);
  });
});

describe('prescribeLoad', () => {
  it('prescribes a heavy, low-rep block for strength', () => {
    // 1RM from 100×5 ≈ 116.67; 87% ≈ 101.5 → nearest 2.5 = 102.5.
    const rx = prescribeLoad({ weight: 100, reps: 5, goal: 'strength' });
    expect(rx.goal).toBe('strength');
    expect(rx.oneRepMax).toBe(117.5);
    expect(rx.intensityPct).toBe(87);
    expect(rx.workingWeight).toBe(102.5);
    expect(rx.repsLow).toBe(3);
    expect(rx.repsHigh).toBe(5);
    expect(rx.sets).toBe(5);
  });

  it('prescribes a moderate block for hypertrophy', () => {
    const rx = prescribeLoad({ weight: 100, reps: 5, goal: 'hypertrophy' });
    expect(rx.intensityPct).toBe(72);
    // 116.67 * 0.72 ≈ 84.0 → nearest 2.5 = 85.
    expect(rx.workingWeight).toBe(85);
    expect(rx.repsHigh).toBe(12);
  });

  it('prescribes a light, high-rep block for endurance', () => {
    const rx = prescribeLoad({ weight: 100, reps: 5, goal: 'endurance' });
    expect(rx.intensityPct).toBe(60);
    expect(rx.sets).toBe(3);
    expect(rx.repsHigh).toBe(20);
  });

  it('honours a custom plate increment', () => {
    const rx = prescribeLoad({ weight: 102, reps: 1, goal: 'strength', increment: 5 });
    // 1RM = 102 (single rep) → rounds to nearest 5 = 100.
    expect(rx.oneRepMax).toBe(100);
  });

  it('propagates validation errors from the 1RM estimate', () => {
    expect(() => prescribeLoad({ weight: 0, reps: 5, goal: 'strength' })).toThrow(RangeError);
  });
});
