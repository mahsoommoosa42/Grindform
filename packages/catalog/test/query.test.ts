import { describe, expect, it } from 'vitest';

import { parseExerciseSlug } from '@grindform/core';

import {
  allExercises,
  exercisesForMuscle,
  filterExercises,
  getExercise,
  meetsExperience,
  requireExercise,
} from '../src/query.ts';

describe('lookups', () => {
  it('allExercises returns the full library', () => {
    expect(allExercises().length).toBeGreaterThan(0);
  });

  it('getExercise finds a known slug', () => {
    const e = getExercise(parseExerciseSlug('back-squat'));
    expect(e?.name).toBe('Back squat');
  });

  it('getExercise returns undefined for an unknown slug', () => {
    expect(getExercise(parseExerciseSlug('not-a-real-move'))).toBeUndefined();
  });

  it('requireExercise returns a known exercise', () => {
    expect(requireExercise(parseExerciseSlug('cable-fly')).name).toBe('Cable fly');
  });

  it('requireExercise throws NotFoundError for an unknown slug', () => {
    expect(() => requireExercise(parseExerciseSlug('ghost-lift'))).toThrowError(
      /unknown exercise: ghost-lift/,
    );
  });
});

describe('meetsExperience', () => {
  it('an advanced lifter can do beginner movements', () => {
    const nordic = requireExercise(parseExerciseSlug('nordic-curl'));
    expect(meetsExperience(nordic, 'advanced')).toBe(true);
  });

  it('a beginner cannot do an advanced movement', () => {
    const nordic = requireExercise(parseExerciseSlug('nordic-curl'));
    expect(meetsExperience(nordic, 'beginner')).toBe(false);
  });

  it('an intermediate lifter can do intermediate movements', () => {
    const bss = requireExercise(parseExerciseSlug('bulgarian-split-squat'));
    expect(meetsExperience(bss, 'intermediate')).toBe(true);
  });
});

describe('filterExercises — each criterion narrows independently', () => {
  it('no criteria returns everything', () => {
    expect(filterExercises({}).length).toBe(allExercises().length);
  });

  it('muscle matches primary OR secondary movers', () => {
    const res = filterExercises({ muscle: 'biceps' });
    expect(res.some((e) => e.slug === 'dumbbell-curl')).toBe(true); // primary
    expect(res.some((e) => e.slug === 'lat-pulldown')).toBe(true); // secondary
  });

  it('muscle excludes exercises that do not train it at all', () => {
    const res = filterExercises({ muscle: 'biceps' });
    expect(res.some((e) => e.slug === 'standing-calf-raise')).toBe(false);
  });

  it('primaryMuscle matches only primary movers', () => {
    const res = filterExercises({ primaryMuscle: 'biceps' });
    expect(res.some((e) => e.slug === 'lat-pulldown')).toBe(false);
    expect(res.every((e) => e.primaryMuscles.includes('biceps'))).toBe(true);
  });

  it('equipment matches when the exercise can use any listed item', () => {
    const res = filterExercises({ equipment: ['bodyweight'] });
    expect(res.length).toBeGreaterThan(0);
    expect(res.every((e) => e.equipment.includes('bodyweight'))).toBe(true);
  });

  it('equipment excludes exercises needing other gear', () => {
    const res = filterExercises({ equipment: ['band'] });
    expect(res.some((e) => e.slug === 'back-squat')).toBe(false);
  });

  it('role narrows to a single role', () => {
    const res = filterExercises({ role: 'main' });
    expect(res.every((e) => e.role === 'main')).toBe(true);
  });

  it('pattern narrows to a single movement pattern', () => {
    const res = filterExercises({ pattern: 'hinge' });
    expect(res.every((e) => e.pattern === 'hinge')).toBe(true);
  });

  it('goal narrows to exercises suiting that goal', () => {
    const res = filterExercises({ goal: 'build_endurance' });
    expect(res.every((e) => e.goals.includes('build_endurance'))).toBe(true);
  });

  it('experience excludes movements above the lifter level', () => {
    const res = filterExercises({ experience: 'beginner' });
    expect(res.some((e) => e.slug === 'nordic-curl')).toBe(false);
  });

  it('unilateral true matches single-limb work only', () => {
    const res = filterExercises({ unilateral: true });
    expect(res.every((e) => e.unilateral)).toBe(true);
  });

  it('unilateral false matches bilateral work only', () => {
    const res = filterExercises({ unilateral: false });
    expect(res.every((e) => !e.unilateral)).toBe(true);
  });

  it('combines multiple criteria with AND', () => {
    const res = filterExercises({
      primaryMuscle: 'glutes',
      role: 'main',
      equipment: ['barbell'],
      experience: 'beginner',
      goal: 'build_muscle',
      unilateral: false,
      pattern: 'hinge',
    });
    expect(res.some((e) => e.slug === 'barbell-hip-thrust')).toBe(true);
  });
});

describe('exercisesForMuscle', () => {
  it('returns primary movers for the muscle', () => {
    const res = exercisesForMuscle('quads');
    expect(res.every((e) => e.primaryMuscles.includes('quads'))).toBe(true);
  });

  it('accepts extra criteria', () => {
    const res = exercisesForMuscle('quads', { equipment: ['barbell'] });
    expect(res.every((e) => e.equipment.includes('barbell'))).toBe(true);
  });
});
