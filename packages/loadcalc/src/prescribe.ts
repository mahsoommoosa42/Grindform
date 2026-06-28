/**
 * @file packages/loadcalc/src/prescribe.ts
 *
 * Turn an estimated 1RM into a concrete working prescription (weight ×
 * reps × sets) for a chosen training goal, using standard %-of-1RM
 * intensity bands.
 */

import type { Goal } from '@grindform/core';

import { estimateOneRepMax, roundToIncrement } from './formulas.ts';
import type { RepMaxInput } from './formulas.ts';

/** What the lifter is training for; drives the intensity band. */
export type LoadGoal = 'strength' | 'hypertrophy' | 'endurance';

/**
 * Map a weekly-plan {@link Goal} to the load {@link LoadGoal} whose
 * intensity band best fits it. Muscle/recomp/fat-loss all train in the
 * hypertrophy band; only an explicit endurance goal drops to the light,
 * high-rep band. (Pure strength is offered only in the standalone
 * calculator, never auto-selected from a weekly goal.)
 */
export const loadGoalForGoal = (goal: Goal): LoadGoal =>
  goal === 'build_endurance' ? 'endurance' : 'hypertrophy';

/** The intensity/rep/set band for a goal. */
export interface GoalProfile {
  readonly goal: LoadGoal;
  readonly label: string;
  /** Fraction of 1RM to work at (0–1). */
  readonly intensity: number;
  readonly repsLow: number;
  readonly repsHigh: number;
  readonly sets: number;
}

/** Standard %-of-1RM bands per goal. Ordered heaviest → lightest. */
export const GOAL_PROFILES: readonly GoalProfile[] = [
  { goal: 'strength', label: 'Strength', intensity: 0.87, repsLow: 3, repsHigh: 5, sets: 5 },
  { goal: 'hypertrophy', label: 'Hypertrophy', intensity: 0.72, repsLow: 8, repsHigh: 12, sets: 4 },
  { goal: 'endurance', label: 'Endurance', intensity: 0.6, repsLow: 15, repsHigh: 20, sets: 3 },
];

/** Inputs for {@link prescribeLoad}: a recent set plus the chosen goal. */
export interface PrescribeInput extends RepMaxInput {
  readonly goal: LoadGoal;
  /** Loadable plate increment to round to. Defaults to 2.5. */
  readonly increment?: number;
}

/** A concrete working-set recommendation. */
export interface Prescription {
  readonly goal: LoadGoal;
  /** Estimated one-rep max, rounded to the plate increment. */
  readonly oneRepMax: number;
  /** Intensity used, as a whole-number percentage (e.g. 87). */
  readonly intensityPct: number;
  /** Recommended working weight, rounded to the plate increment. */
  readonly workingWeight: number;
  readonly repsLow: number;
  readonly repsHigh: number;
  readonly sets: number;
}

/** Look up the {@link GoalProfile} for a goal. */
export const profileForGoal = (goal: LoadGoal): GoalProfile => {
  const profile = GOAL_PROFILES.find((p) => p.goal === goal);
  if (profile === undefined) throw new RangeError(`unknown goal: ${goal}`);
  return profile;
};

/**
 * Build a working-set prescription from a recent set and a training goal.
 * Propagates {@link estimateOneRepMax}'s validation errors.
 */
export const prescribeLoad = (input: PrescribeInput): Prescription => {
  const increment = input.increment ?? 2.5;
  const profile = profileForGoal(input.goal);
  const oneRepMaxRaw = estimateOneRepMax({ weight: input.weight, reps: input.reps });
  return {
    goal: profile.goal,
    oneRepMax: roundToIncrement(oneRepMaxRaw, increment),
    intensityPct: Math.round(profile.intensity * 100),
    workingWeight: roundToIncrement(oneRepMaxRaw * profile.intensity, increment),
    repsLow: profile.repsLow,
    repsHigh: profile.repsHigh,
    sets: profile.sets,
  };
};
