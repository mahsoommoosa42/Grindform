/**
 * Strength-profile resolution from canonical-lift personal records.
 *
 * The profile uses back squat as its anchor and standard relative-strength
 * ratios to estimate lifts the user has not entered.
 */

import type { Lift, StrengthProfile, StrengthProfileEntry } from '@grindform/core';

import { roundToIncrement } from './formulas.ts';

/** Relative 1RM ratios, with back squat as the 1.0 anchor. */
export const LIFT_RATIOS: Readonly<Record<Lift, number>> = {
  back_squat: 1,
  bench_press: 0.75,
  deadlift: 1.2,
  overhead_press: 0.45,
  barbell_row: 0.65,
};

/** Catalog metadata needed to map an exercise to a canonical lift. */
export interface LiftGroupReference {
  readonly lift: Lift;
  readonly coefficient: number;
}

/** One measured canonical-lift max. */
export interface MeasuredLiftMax {
  readonly lift: Lift;
  readonly oneRepMaxKg: number;
}

const LIFTS: readonly Lift[] = [
  'back_squat',
  'bench_press',
  'deadlift',
  'overhead_press',
  'barbell_row',
];

/**
 * Resolve all canonical lift maxes from one or more measured maxes.
 *
 * Each measured max implies a back-squat anchor (`max / ratio`). Missing
 * lifts are estimated from the average anchor and rounded to 2.5 kg.
 */
export const resolveStrengthProfile = (measured: readonly MeasuredLiftMax[]): StrengthProfile => {
  if (measured.length === 0) {
    throw new RangeError('at least one measured lift is required');
  }

  const seen = new Set<Lift>();
  for (const entry of measured) {
    if (seen.has(entry.lift)) {
      throw new RangeError(`duplicate measured lift: ${entry.lift}`);
    }
    if (!Number.isFinite(entry.oneRepMaxKg) || entry.oneRepMaxKg <= 0) {
      throw new RangeError('oneRepMaxKg must be a positive number');
    }
    seen.add(entry.lift);
  }

  const anchors = measured.map((entry) => entry.oneRepMaxKg / LIFT_RATIOS[entry.lift]);
  const anchor = anchors.reduce((sum, value) => sum + value, 0) / anchors.length;
  const measuredByLift = new Map(measured.map((entry) => [entry.lift, entry.oneRepMaxKg]));

  const profile: StrengthProfileEntry[] = LIFTS.map((lift) => {
    const measuredMax = measuredByLift.get(lift);
    return measuredMax === undefined
      ? {
          lift,
          oneRepMaxKg: roundToIncrement(anchor * LIFT_RATIOS[lift], 2.5),
          source: 'estimated' as const,
        }
      : { lift, oneRepMaxKg: measuredMax, source: 'measured' as const };
  });
  return profile;
};

/**
 * Resolve a catalog exercise's 1RM from a strength profile and its lift-group
 * coefficient. Unannotated exercises intentionally return undefined.
 */
export const oneRepMaxForExercise = (
  liftGroup: LiftGroupReference | undefined,
  profile: StrengthProfile,
): number | undefined => {
  if (liftGroup === undefined) return undefined;
  const entry = profile.find((candidate) => candidate.lift === liftGroup.lift);
  return entry === undefined ? undefined : entry.oneRepMaxKg * liftGroup.coefficient;
};
