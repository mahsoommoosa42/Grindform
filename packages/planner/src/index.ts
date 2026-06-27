/**
 * @file packages/planner/src/index.ts
 *
 * Public barrel for `@grindform/planner` — the weekly plan generator and
 * its output types.
 */

export type { ExerciseSlot, PlanDay, SessionBlock, WeeklyPlan } from './types.ts';
export { generatePlan } from './generate.ts';
export { estimateSlotMinutes, GOAL_PROFILES, schemeForRole, templateForRole } from './profiles.ts';
export type { GoalProfile } from './profiles.ts';
export { makeRng } from './rng.ts';
export type { Rng } from './rng.ts';
