/**
 * @file packages/loadcalc/src/sets.ts
 *
 * Expand a working prescription (sets × reps @ %1RM) into an explicit
 * per-set plan: optional warm-up ramp sets followed by the working sets,
 * each carrying its own target reps and — when a 1RM is known — a target
 * weight. Supports straight sets and pyramids (weight up, reps down).
 *
 * Pure math, no I/O. The tracker UI renders one editable row per
 * {@link PlannedSet} and pre-fills the weight/reps; the lifter overrides
 * whatever they actually performed.
 */

import { roundToIncrement } from './formulas.ts';

/** Whether a set is a lighter warm-up or a counted working set. */
export type SetKind = 'warmup' | 'working';

/** One concrete set in an exercise's plan. */
export interface PlannedSet {
  readonly kind: SetKind;
  /** Target reps for this set. */
  readonly reps: number;
  /** Intensity as a whole-number percentage of 1RM (e.g. 72). */
  readonly intensityPct: number;
  /** Target weight in kg — present only when a 1RM was supplied. */
  readonly weightKg?: number;
}

/** Inputs to {@link expandSets}. */
export interface ExpandSetsInput {
  /** Number of counted working sets; an integer >= 1. */
  readonly workingSets: number;
  /** Low end of the working rep range; an integer >= 1. */
  readonly repsLow: number;
  /** High end of the working rep range; an integer >= `repsLow`. */
  readonly repsHigh: number;
  /** Working intensity as a fraction of 1RM in (0, 1] (e.g. 0.72). */
  readonly intensity: number;
  /** Estimated 1RM in kg. When omitted, target weights are left blank. */
  readonly oneRepMax?: number;
  /** Ramp weight up and reps down across the working sets. */
  readonly pyramid?: boolean;
  /** Number of warm-up sets to prepend; an integer >= 0 (default 0). */
  readonly warmupSets?: number;
  /** Loadable plate increment for rounding; defaults to 2.5. */
  readonly increment?: number;
}

/** Lightest intensity a warm-up ramp starts from. */
const WARMUP_FLOOR = 0.4;
/** Per-set intensity drop below the top set in a pyramid. */
const PYRAMID_STEP = 0.05;
/** Lowest intensity a pyramid's first working set may fall to. */
const PYRAMID_MIN = 0.5;

/** Linear interpolation between `a` and `b` at fraction `t` in [0, 1]. */
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Build the working sets' intensity fractions, lightest → heaviest. */
const workingIntensities = (
  workingSets: number,
  intensity: number,
  pyramid: boolean,
): readonly number[] => {
  if (!pyramid || workingSets === 1) {
    return Array.from({ length: workingSets }, () => intensity);
  }
  return Array.from({ length: workingSets }, (_unused, i) => {
    const stepsBelowTop = workingSets - 1 - i;
    return Math.max(PYRAMID_MIN, intensity - PYRAMID_STEP * stepsBelowTop);
  });
};

/** Build the working sets' target reps, matched to {@link workingIntensities}. */
const workingReps = (
  workingSets: number,
  repsLow: number,
  repsHigh: number,
  pyramid: boolean,
): readonly number[] => {
  if (!pyramid || workingSets === 1) {
    return Array.from({ length: workingSets }, () => repsHigh);
  }
  // Lightest set (i=0) gets the most reps; the heaviest top set gets repsLow.
  return Array.from({ length: workingSets }, (_unused, i) =>
    Math.round(lerp(repsHigh, repsLow, i / (workingSets - 1))),
  );
};

/**
 * Expand a prescription into explicit warm-up + working sets.
 *
 * @throws RangeError if any count/rep/intensity argument is out of range.
 */
export const expandSets = (input: ExpandSetsInput): readonly PlannedSet[] => {
  const { workingSets, repsLow, repsHigh, intensity } = input;
  const warmupSets = input.warmupSets ?? 0;
  const increment = input.increment ?? 2.5;
  const pyramid = input.pyramid ?? false;
  const orm = input.oneRepMax;

  if (!Number.isInteger(workingSets) || workingSets < 1) {
    throw new RangeError('workingSets must be an integer >= 1');
  }
  if (!Number.isInteger(warmupSets) || warmupSets < 0) {
    throw new RangeError('warmupSets must be an integer >= 0');
  }
  if (!Number.isInteger(repsLow) || repsLow < 1) {
    throw new RangeError('repsLow must be an integer >= 1');
  }
  if (!Number.isInteger(repsHigh) || repsHigh < repsLow) {
    throw new RangeError('repsHigh must be an integer >= repsLow');
  }
  if (!Number.isFinite(intensity) || intensity <= 0 || intensity > 1) {
    throw new RangeError('intensity must be in (0, 1]');
  }
  if (orm !== undefined && (!Number.isFinite(orm) || orm <= 0)) {
    throw new RangeError('oneRepMax must be a positive number');
  }

  const intensities = workingIntensities(workingSets, intensity, pyramid);
  const reps = workingReps(workingSets, repsLow, repsHigh, pyramid);
  const firstWorking = intensities[0] as number;

  const toSet = (kind: SetKind, frac: number, setReps: number): PlannedSet => {
    const base = { kind, reps: setReps, intensityPct: Math.round(frac * 100) };
    return orm === undefined
      ? base
      : { ...base, weightKg: roundToIncrement(orm * frac, increment) };
  };

  const warmups: PlannedSet[] = Array.from({ length: warmupSets }, (_unused, i) => {
    const frac = lerp(WARMUP_FLOOR, firstWorking, (i + 1) / (warmupSets + 1));
    const setReps = Math.max(repsLow, Math.min(20, repsHigh + 4 - i * 3));
    return toSet('warmup', frac, setReps);
  });

  const working: PlannedSet[] = intensities.map((frac, i) =>
    toSet('working', frac, reps[i] as number),
  );

  return [...warmups, ...working];
};
