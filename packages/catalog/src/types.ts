/**
 * @file packages/catalog/src/types.ts
 *
 * The `Exercise` shape — one entry in the static exercise library. The
 * catalog is code (not a DB table), keyed by a stable {@link ExerciseSlug}.
 */

import type {
  Equipment,
  ExerciseRole,
  ExerciseSlug,
  Experience,
  Goal,
  MovementPattern,
  MuscleGroup,
} from '@grindform/core';

/**
 * A single library exercise. The generator reads these fields to pick
 * appropriate movements for a session: `primaryMuscles` for the day's
 * focus, `pattern`/`role` to balance compounds vs accessories,
 * `equipment` + `minExperience` to honour the user's constraints, and
 * `goals` to bias selection toward the chosen training goal.
 */
export interface Exercise {
  /** Stable kebab-case identifier, e.g. `barbell-hip-thrust`. */
  readonly slug: ExerciseSlug;
  /** Human-readable display name, e.g. `Barbell hip thrust`. */
  readonly name: string;
  /** Muscle groups the exercise primarily trains. At least one. */
  readonly primaryMuscles: readonly MuscleGroup[];
  /** Muscle groups worked secondarily (may be empty). */
  readonly secondaryMuscles: readonly MuscleGroup[];
  /** Equipment the exercise can be performed with. At least one. */
  readonly equipment: readonly Equipment[];
  /** The movement pattern, used to balance a session. */
  readonly pattern: MovementPattern;
  /** Whether the movement is a compound `main` lift, an `accessory`, etc. */
  readonly role: ExerciseRole;
  /** True for single-limb work (the PDF's `3 × 8/s`). */
  readonly unilateral: boolean;
  /** Minimum experience the movement is appropriate for. */
  readonly minExperience: Experience;
  /** Goals this exercise suits especially well. */
  readonly goals: readonly Goal[];
  /** Optional coaching cue shown in the UI. */
  readonly cue?: string;
}
