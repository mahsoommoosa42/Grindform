/**
 * @file packages/loadcalc/src/index.ts
 *
 * Public barrel for `@grindform/loadcalc` — 1RM estimation and
 * goal-based load prescription.
 */

export { estimateOneRepMax, roundToIncrement } from './formulas.ts';
export type { RepMaxInput } from './formulas.ts';
export { GOAL_PROFILES, loadGoalForGoal, prescribeLoad, profileForGoal } from './prescribe.ts';
export type { GoalProfile, LoadGoal, PrescribeInput, Prescription } from './prescribe.ts';
export { expandSets } from './sets.ts';
export type { ExpandSetsInput, PlannedSet, SetKind } from './sets.ts';
export { LIFT_RATIOS, oneRepMaxForExercise, resolveStrengthProfile } from './strength-profile.ts';
export type { LiftGroupReference, MeasuredLiftMax } from './strength-profile.ts';
