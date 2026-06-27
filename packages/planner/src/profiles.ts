/**
 * @file packages/planner/src/profiles.ts
 *
 * Goal-driven training parameters. Each {@link Goal} maps to set/rep/rest
 * schemes for main lifts, accessories, and isolation work, plus how many
 * accessories to target and whether to add a conditioning finisher.
 * Tuned to mirror the intent of Gargi's recomp plan (4×8 mains, 3×10–12
 * accessories) while diverging sensibly for strength/endurance/fat-loss.
 */

import type { ExerciseRole, Goal, RepScheme } from '@grindform/core';

/** Average seconds spent per rep (concentric + eccentric), for time math. */
const SECONDS_PER_REP = 4;

/** A scheme template before the per-side flag is applied. */
type SchemeTemplate = Omit<RepScheme, 'perSide'>;

/** Per-goal training parameters. */
export interface GoalProfile {
  /** Scheme for compound main lifts. */
  readonly main: SchemeTemplate;
  /** Scheme for accessory movements. */
  readonly accessory: SchemeTemplate;
  /** Scheme for isolation movements. */
  readonly isolation: SchemeTemplate;
  /** Scheme for conditioning finishers. */
  readonly conditioning: SchemeTemplate;
  /** Target number of accessory/isolation slots per session. */
  readonly accessoryTarget: number;
  /** Whether to append a conditioning finisher when time allows. */
  readonly includeConditioning: boolean;
}

/** The full goal → parameters table. */
export const GOAL_PROFILES: Record<Goal, GoalProfile> = {
  build_muscle: {
    main: { sets: 4, repsLow: 6, repsHigh: 8, restSeconds: 150 },
    accessory: { sets: 4, repsLow: 8, repsHigh: 12, restSeconds: 90 },
    isolation: { sets: 3, repsLow: 12, repsHigh: 15, restSeconds: 60 },
    conditioning: { sets: 3, repsLow: 12, repsHigh: 15, restSeconds: 45 },
    accessoryTarget: 3,
    includeConditioning: false,
  },
  lose_fat: {
    main: { sets: 4, repsLow: 8, repsHigh: 10, restSeconds: 90 },
    accessory: { sets: 3, repsLow: 12, repsHigh: 15, restSeconds: 45 },
    isolation: { sets: 3, repsLow: 15, repsHigh: 20, restSeconds: 30 },
    conditioning: { sets: 4, repsLow: 15, repsHigh: 20, restSeconds: 30 },
    accessoryTarget: 4,
    includeConditioning: true,
  },
  build_endurance: {
    main: { sets: 3, repsLow: 12, repsHigh: 15, restSeconds: 60 },
    accessory: { sets: 3, repsLow: 15, repsHigh: 20, restSeconds: 40 },
    isolation: { sets: 2, repsLow: 18, repsHigh: 25, restSeconds: 30 },
    conditioning: { sets: 5, repsLow: 18, repsHigh: 25, restSeconds: 20 },
    accessoryTarget: 4,
    includeConditioning: true,
  },
  recomp: {
    main: { sets: 4, repsLow: 8, repsHigh: 8, restSeconds: 120 },
    accessory: { sets: 3, repsLow: 10, repsHigh: 12, restSeconds: 75 },
    isolation: { sets: 3, repsLow: 12, repsHigh: 15, restSeconds: 60 },
    conditioning: { sets: 3, repsLow: 12, repsHigh: 15, restSeconds: 45 },
    accessoryTarget: 3,
    includeConditioning: false,
  },
};

/** Pick the scheme template appropriate for an exercise's role. */
export const templateForRole = (profile: GoalProfile, role: ExerciseRole): SchemeTemplate => {
  switch (role) {
    case 'main':
      return profile.main;
    case 'accessory':
      return profile.accessory;
    case 'conditioning':
      return profile.conditioning;
    case 'mobility':
      return profile.isolation;
  }
};

/** Build a concrete {@link RepScheme}, applying the unilateral flag. */
export const schemeForRole = (
  profile: GoalProfile,
  role: ExerciseRole,
  unilateral: boolean,
): RepScheme => ({ ...templateForRole(profile, role), perSide: unilateral });

/**
 * Estimate how many minutes a slot takes: every set is work
 * (≈ avg reps × seconds/rep, doubled for unilateral) plus the
 * prescribed rest. Rounded up to whole minutes, minimum 1.
 */
export const estimateSlotMinutes = (scheme: RepScheme): number => {
  const avgReps = (scheme.repsLow + scheme.repsHigh) / 2;
  const workSeconds = avgReps * SECONDS_PER_REP * (scheme.perSide ? 2 : 1);
  const perSetSeconds = workSeconds + scheme.restSeconds;
  return Math.max(1, Math.ceil((scheme.sets * perSetSeconds) / 60));
};
