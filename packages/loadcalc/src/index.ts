/**
 * @file packages/loadcalc/src/index.ts
 *
 * Public barrel for `@grindform/loadcalc` — 1RM estimation and
 * goal-based load prescription.
 */

export { estimateOneRepMax, roundToIncrement } from './formulas.ts';
export type { RepMaxInput } from './formulas.ts';
export { GOAL_PROFILES, prescribeLoad, profileForGoal } from './prescribe.ts';
export type { GoalProfile, LoadGoal, PrescribeInput, Prescription } from './prescribe.ts';
