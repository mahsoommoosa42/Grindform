/**
 * @file packages/loadcalc/src/formulas.ts
 *
 * Pure strength math. {@link estimateOneRepMax} turns a recent set
 * (weight × reps) into an estimated one-rep max; {@link roundToIncrement}
 * snaps a target weight to a loadable plate increment.
 */

/** A set the lifter actually performed, used to estimate a 1RM. */
export interface RepMaxInput {
  /** Weight lifted, in the caller's unit (kg or lb); must be > 0. */
  readonly weight: number;
  /** Reps completed at that weight; an integer >= 1. */
  readonly reps: number;
}

/**
 * Estimate a one-rep max from a sub-maximal set.
 *
 * A single rep is its own 1RM (no extrapolation). For 2+ reps we use the
 * Epley formula `1RM = w · (1 + reps/30)`, the most widely used estimator
 * and a good fit in the 2–10 rep range most lifters train in.
 *
 * @throws RangeError if `weight` isn't a positive finite number or `reps`
 *   isn't an integer >= 1.
 */
export const estimateOneRepMax = (input: RepMaxInput): number => {
  const { weight, reps } = input;
  if (!Number.isFinite(weight) || weight <= 0) {
    throw new RangeError('weight must be a positive number');
  }
  if (!Number.isInteger(reps) || reps < 1) {
    throw new RangeError('reps must be an integer >= 1');
  }
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
};

/**
 * Round `value` to the nearest `increment` (e.g. 2.5 kg plates), never
 * returning below a single increment so a prescription is always loadable.
 *
 * @throws RangeError if `increment` isn't a positive finite number.
 */
export const roundToIncrement = (value: number, increment: number): number => {
  if (!Number.isFinite(increment) || increment <= 0) {
    throw new RangeError('increment must be a positive number');
  }
  const snapped = Math.round(value / increment) * increment;
  const safe = Math.max(snapped, increment);
  // Avoid binary-float noise like 67.50000000000001.
  return Math.round(safe * 100) / 100;
};
