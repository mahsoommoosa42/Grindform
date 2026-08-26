import { describe, expect, it } from 'vitest';

import {
  LIFT_RATIOS,
  oneRepMaxForExercise,
  resolveStrengthProfile,
} from '../src/strength-profile.ts';
import type { StrengthProfile } from '@grindform/core';

describe('resolveStrengthProfile', () => {
  it('requires at least one measured lift', () => {
    expect(() => resolveStrengthProfile([])).toThrow('at least one measured lift is required');
  });

  it('estimates missing lifts from the average squat anchor', () => {
    const profile = resolveStrengthProfile([
      { lift: 'back_squat', oneRepMaxKg: 100 },
      { lift: 'bench_press', oneRepMaxKg: 75 },
    ]);
    expect(profile).toEqual([
      { lift: 'back_squat', oneRepMaxKg: 100, source: 'measured' },
      { lift: 'bench_press', oneRepMaxKg: 75, source: 'measured' },
      { lift: 'deadlift', oneRepMaxKg: 120, source: 'estimated' },
      { lift: 'overhead_press', oneRepMaxKg: 45, source: 'estimated' },
      { lift: 'barbell_row', oneRepMaxKg: 65, source: 'estimated' },
    ]);
  });

  it('keeps measured values exact and rejects duplicates or invalid values', () => {
    expect(
      resolveStrengthProfile([{ lift: 'deadlift', oneRepMaxKg: 187.3 }]).find(
        (entry) => entry.lift === 'deadlift',
      ),
    ).toEqual({ lift: 'deadlift', oneRepMaxKg: 187.3, source: 'measured' });
    expect(() =>
      resolveStrengthProfile([
        { lift: 'back_squat', oneRepMaxKg: 100 },
        { lift: 'back_squat', oneRepMaxKg: 110 },
      ]),
    ).toThrow('duplicate measured lift');
    expect(() => resolveStrengthProfile([{ lift: 'bench_press', oneRepMaxKg: 0 }])).toThrow(
      'oneRepMaxKg must be a positive number',
    );
  });
});

describe('oneRepMaxForExercise', () => {
  it('applies a catalog coefficient', () => {
    const profile = resolveStrengthProfile([{ lift: 'back_squat', oneRepMaxKg: 100 }]);
    expect(oneRepMaxForExercise({ lift: 'back_squat', coefficient: 0.85 }, profile)).toBe(85);
  });

  it('returns undefined for an unannotated exercise', () => {
    const profile = resolveStrengthProfile([{ lift: 'back_squat', oneRepMaxKg: 100 }]);
    expect(oneRepMaxForExercise(undefined, profile)).toBeUndefined();
    const incomplete = profile.filter((entry) => entry.lift !== 'back_squat') as StrengthProfile;
    expect(
      oneRepMaxForExercise({ lift: 'back_squat', coefficient: 1 }, incomplete),
    ).toBeUndefined();
  });

  it('exports the canonical ratio table', () => {
    expect(LIFT_RATIOS).toMatchObject({
      back_squat: 1,
      bench_press: 0.75,
      deadlift: 1.2,
      overhead_press: 0.45,
      barbell_row: 0.65,
    });
  });
});
