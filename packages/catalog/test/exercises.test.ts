import { describe, expect, it } from 'vitest';

import { isExerciseSlug, MuscleGroupSchema } from '@grindform/core';

import { EXERCISES } from '../src/exercises.ts';

describe('exercise library integrity', () => {
  it('is non-trivially large', () => {
    expect(EXERCISES.length).toBeGreaterThanOrEqual(50);
  });

  it('every slug is syntactically valid and unique', () => {
    const seen = new Set<string>();
    for (const e of EXERCISES) {
      expect(isExerciseSlug(e.slug)).toBe(true);
      expect(seen.has(e.slug)).toBe(false);
      seen.add(e.slug);
    }
  });

  it('every exercise has a name, at least one primary muscle, and equipment', () => {
    for (const e of EXERCISES) {
      expect(e.name.length).toBeGreaterThan(0);
      expect(e.primaryMuscles.length).toBeGreaterThan(0);
      expect(e.equipment.length).toBeGreaterThan(0);
      expect(e.goals.length).toBeGreaterThan(0);
    }
  });

  it('covers every muscle group as a primary mover', () => {
    const covered = new Set(EXERCISES.flatMap((e) => e.primaryMuscles));
    for (const muscle of MuscleGroupSchema.options) {
      expect(covered.has(muscle)).toBe(true);
    }
  });
});
