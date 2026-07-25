/**
 * Pure planned-load calculations used by multi-week programs.
 *
 * These units are intentionally relative rather than physiological: they
 * compare the shape and size of generated weeks without requiring logged
 * weights. A training slot contributes sets × midpoint reps, adjusted by
 * role and the role's intensity band; external activities contribute a
 * modest duration-based amount.
 */

import type { PlanDay, PlanSession, TrainingSession } from './types.ts';

/** Relative role multipliers; main work is heavier than isolation work. */
export const ROLE_LOAD_WEIGHTS = {
  main: 1.4,
  accessory: 1,
  conditioning: 0.7,
  mobility: 0.4,
} as const;

/** Additional intensity multipliers for the role's prescribed rep band. */
export const ROLE_INTENSITY_WEIGHTS = {
  main: 1.2,
  accessory: 1,
  conditioning: 0.8,
  mobility: 0.6,
} as const;

/** Fixed planned-load rate for non-lifting activity, in units/minute. */
export const EXTERNAL_SESSION_LOAD_PER_MINUTE = 0.1;

/** Number of previous weeks used for chronic-load calculations. */
export const ACWR_WINDOW_WEEKS = 4;

const slotLoad = (slot: TrainingSession['blocks'][number]['slots'][number]): number => {
  const role =
    slot.pyramid === true ? 'main' : slot.scheme.repsHigh >= 18 ? 'conditioning' : 'accessory';
  const midpoint = (slot.scheme.repsLow + slot.scheme.repsHigh) / 2;
  return slot.scheme.sets * midpoint * ROLE_LOAD_WEIGHTS[role] * ROLE_INTENSITY_WEIGHTS[role];
};

const sessionLoad = (session: PlanSession): number => {
  if (session.kind === 'external') {
    return session.plannedMinutes * EXTERNAL_SESSION_LOAD_PER_MINUTE;
  }
  return session.blocks.reduce(
    (total, block) => total + block.slots.reduce((sum, slot) => sum + slotLoad(slot), 0),
    0,
  );
};

/** Return the unitless planned load of a generated week. */
export const planLoadUnits = (plan: { readonly days: readonly PlanDay[] }): number =>
  plan.days.reduce(
    (total, day) => total + day.sessions.reduce((sum, session) => sum + sessionLoad(session), 0),
    0,
  );

/** Mean of the previous up-to-`window` weekly loads, including zeroes. */
export const chronicLoad = (
  previousLoads: readonly number[],
  window = ACWR_WINDOW_WEEKS,
): number => {
  const recent = previousLoads.slice(-window);
  return recent.length === 0 ? 0 : recent.reduce((sum, load) => sum + load, 0) / recent.length;
};

/** Acute:chronic ratio for one week against its preceding rolling window. */
export const acuteChronicRatio = (
  acute: number,
  previousLoads: readonly number[],
  window = ACWR_WINDOW_WEEKS,
): number => {
  const chronic = chronicLoad(previousLoads, window);
  if (chronic === 0) return acute === 0 ? 0 : Number.POSITIVE_INFINITY;
  return acute / chronic;
};
