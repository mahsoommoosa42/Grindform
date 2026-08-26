/**
 * @file packages/planner/src/index.ts
 *
 * Public barrel for `@grindform/planner` — the weekly plan generator and
 * its output types.
 */

export type {
  DrillRecommendation,
  ExerciseSlot,
  ExternalSession,
  PlanDay,
  PlanSession,
  SessionBlock,
  SupersetRef,
  TrainingSession,
  WeeklyPlan,
} from './types.ts';
export { deriveSessionRecommendations } from './recommendations.ts';
export { generatePlan } from './generate.ts';
export { DEFAULT_PROGRAM_CURVE, generateProgram, replanProgram, scalePlanLoad } from './program.ts';
export type { ProgramWeek, ReplanInput, TrainingProgram } from './program.ts';
export {
  ACWR_WINDOW_WEEKS,
  EXTERNAL_SESSION_LOAD_PER_MINUTE,
  ROLE_INTENSITY_WEIGHTS,
  ROLE_LOAD_WEIGHTS,
  acuteChronicRatio,
  chronicLoad,
  planLoadUnits,
} from './load.ts';
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
