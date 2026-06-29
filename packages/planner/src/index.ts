/**
 * @file packages/planner/src/index.ts
 *
 * Public barrel for `@grindform/planner` — the weekly plan generator and
 * its output types.
 */

export type {
  ExerciseSlot,
  ExternalSession,
  PlanDay,
  PlanSession,
  SessionBlock,
  SupersetRef,
  TrainingSession,
  WeeklyPlan,
} from './types.ts';
export { generatePlan } from './generate.ts';
export {
  addSlotToSession,
  buildSlot,
  customExerciseSlug,
  removeSlot,
  swapSlotExercise,
} from './mutate.ts';
export type { ResolvedExercise } from './mutate.ts';
export { estimateSlotMinutes, GOAL_PROFILES, schemeForRole, templateForRole } from './profiles.ts';
export type { GoalProfile } from './profiles.ts';
export { makeRng } from './rng.ts';
export type { Rng } from './rng.ts';
