/**
 * @file packages/catalog/src/query.ts
 *
 * Read + filter helpers over the static {@link EXERCISES} library. Pure
 * functions, no I/O — the planner composes these to pick movements for a
 * session, and the API exposes them for the "browse the library" UI.
 */

import { NotFoundError } from '@grindform/core';
import type {
  Equipment,
  ExerciseRole,
  ExerciseSlug,
  Experience,
  Goal,
  MovementPattern,
  MuscleGroup,
} from '@grindform/core';

import { EXERCISES } from './exercises.ts';
import type { Exercise } from './types.ts';

/** Lookup index built once at module load. */
const BY_SLUG: ReadonlyMap<ExerciseSlug, Exercise> = new Map(
  EXERCISES.map((e) => [e.slug, e] as const),
);

/** The whole library, in declaration order. */
export const allExercises = (): readonly Exercise[] => EXERCISES;

/** Look up one exercise by slug; `undefined` if unknown. */
export const getExercise = (slug: ExerciseSlug): Exercise | undefined => BY_SLUG.get(slug);

/**
 * Look up one exercise by slug, throwing if it doesn't exist. Use when
 * the slug came from trusted plan data and a miss is a programmer error.
 *
 * @throws NotFoundError if no exercise has that slug.
 */
export const requireExercise = (slug: ExerciseSlug): Exercise => {
  const found = BY_SLUG.get(slug);
  if (found === undefined) {
    throw new NotFoundError(`unknown exercise: ${slug}`, { slug });
  }
  return found;
};

/** Ordinal rank for experience levels, so "meets minimum" is a comparison. */
const EXPERIENCE_RANK: Record<Experience, number> = {
  beginner: 0,
  intermediate: 1,
  advanced: 2,
};

/** True iff a lifter at `level` is experienced enough for `e`. */
export const meetsExperience = (e: Exercise, level: Experience): boolean =>
  EXPERIENCE_RANK[e.minExperience] <= EXPERIENCE_RANK[level];

/** Criteria for {@link filterExercises}. Every field is optional (AND-combined). */
export interface FilterCriteria {
  /** Trains this muscle as a primary OR secondary mover. */
  readonly muscle?: MuscleGroup;
  /** Trains this muscle as a PRIMARY mover. */
  readonly primaryMuscle?: MuscleGroup;
  /** Can be done with at least one of these pieces of equipment. */
  readonly equipment?: readonly Equipment[];
  /** Plays this role in a session. */
  readonly role?: ExerciseRole;
  /** Uses this movement pattern. */
  readonly pattern?: MovementPattern;
  /** Suits this training goal. */
  readonly goal?: Goal;
  /** Is appropriate for a lifter at (or above) this experience level. */
  readonly experience?: Experience;
  /** Matches this unilateral/bilateral flag. */
  readonly unilateral?: boolean;
}

/** Return every library exercise matching all provided criteria. */
export const filterExercises = (criteria: FilterCriteria): readonly Exercise[] =>
  EXERCISES.filter((e) => {
    const { muscle, primaryMuscle, equipment, role, pattern, goal, experience, unilateral } =
      criteria;

    if (
      muscle !== undefined &&
      !e.primaryMuscles.includes(muscle) &&
      !e.secondaryMuscles.includes(muscle)
    ) {
      return false;
    }
    if (primaryMuscle !== undefined && !e.primaryMuscles.includes(primaryMuscle)) {
      return false;
    }
    if (equipment !== undefined && !e.equipment.some((eq) => equipment.includes(eq))) {
      return false;
    }
    if (role !== undefined && e.role !== role) {
      return false;
    }
    if (pattern !== undefined && e.pattern !== pattern) {
      return false;
    }
    if (goal !== undefined && !e.goals.includes(goal)) {
      return false;
    }
    if (experience !== undefined && !meetsExperience(e, experience)) {
      return false;
    }
    if (unilateral !== undefined && e.unilateral !== unilateral) {
      return false;
    }
    return true;
  });

/**
 * Convenience wrapper: every exercise whose PRIMARY focus is `muscle`,
 * optionally narrowed by the rest of {@link FilterCriteria}.
 */
export const exercisesForMuscle = (
  muscle: MuscleGroup,
  rest: Omit<FilterCriteria, 'primaryMuscle'> = {},
): readonly Exercise[] => filterExercises({ ...rest, primaryMuscle: muscle });
