/**
 * @file packages/planner/src/types.ts
 *
 * The shape of a generated weekly plan. These are the planner's output
 * types — persisted by `@grindform/db` and rendered by `@grindform/web`.
 */

import type {
  BlockType,
  DayActivity,
  DayId,
  ExerciseSlug,
  Experience,
  Goal,
  MuscleGroup,
  PlanId,
  RepScheme,
  SlotId,
  TimeBudget,
  Weekday,
} from '@grindform/core';

/** One exercise prescription inside a session block. */
export interface ExerciseSlot {
  readonly id: SlotId;
  readonly exerciseSlug: ExerciseSlug;
  /** Denormalised display name (the catalog is the source of truth). */
  readonly name: string;
  /** Sets/reps/rest for this slot, derived from the goal profile. */
  readonly scheme: RepScheme;
  /** Optional coaching cue carried over from the catalog. */
  readonly cue?: string;
}

/**
 * A timed block within a session. `warmup`, `physio`, and `cooldown`
 * blocks carry a `note` and no exercise slots; `main` and `accessory`
 * blocks carry exercise slots.
 */
export interface SessionBlock {
  readonly type: BlockType;
  readonly title: string;
  readonly estMinutes: number;
  readonly slots: readonly ExerciseSlot[];
  readonly note?: string;
}

/**
 * One day of the week. Either a blocked preplanned activity (`activity`
 * set, `blocks` empty) or a generated training day (`focus` non-empty,
 * `blocks` populated).
 */
export interface PlanDay {
  readonly id: DayId;
  readonly weekday: Weekday;
  readonly activity?: DayActivity;
  readonly label?: string;
  readonly focus: readonly MuscleGroup[];
  readonly blocks: readonly SessionBlock[];
  readonly estMinutes: number;
}

/** A complete generated week. */
export interface WeeklyPlan {
  readonly id: PlanId;
  readonly goal: Goal;
  readonly experience: Experience;
  readonly variation: 'A' | 'B';
  readonly timeBudget: TimeBudget;
  readonly days: readonly PlanDay[];
}
