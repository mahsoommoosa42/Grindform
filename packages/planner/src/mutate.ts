/**
 * @file packages/planner/src/mutate.ts
 *
 * Pure, post-generation edits to a {@link PlanDay} — the "change your mind"
 * operations the UI exposes on the week view: swap one exercise for any
 * other, add an extra exercise to a day, or remove one. These never
 * re-generate a session; they touch a single slot and re-roll the affected
 * block/session/day minute estimates so volume and time stay consistent.
 *
 * Everything here is a pure function over the plan value objects (no I/O),
 * so the API layer can resolve an exercise reference (catalog or custom),
 * call one of these, and persist the new day JSON.
 */

import type { CustomExerciseId, ExerciseRole, Goal, MuscleGroup } from '@grindform/core';
import { newSlotId } from '@grindform/core';
import type { ExerciseSlug } from '@grindform/core';

import { estimateSlotMinutes, GOAL_PROFILES, schemeForRole } from './profiles.ts';
import type { ExerciseSlot, PlanDay, PlanSession, SessionBlock, TrainingSession } from './types.ts';

/**
 * The minimal exercise shape the mutators need to build or re-label a slot.
 * Both a catalog `Exercise` and a stored custom exercise map onto this, so
 * a swapped- or added-in movement can come from either source.
 */
export interface ResolvedExercise {
  readonly slug: ExerciseSlug;
  readonly name: string;
  readonly primaryMuscles: readonly MuscleGroup[];
  readonly role: ExerciseRole;
  readonly unilateral: boolean;
  readonly cue?: string;
}

/**
 * Synthesise a stable, slug-shaped reference for a custom exercise so it can
 * live in a slot's `exerciseSlug` field (and set-log rows) alongside catalog
 * slugs. The ULID body is lowercased — Crockford base-32 lowercases to
 * `[a-z0-9]`, a valid kebab-case slug — and prefixed with `custom-`.
 */
export const customExerciseSlug = (id: CustomExerciseId): ExerciseSlug => {
  const body = id.slice(id.indexOf('_') + 1).toLowerCase();
  return `custom-${body}` as ExerciseSlug;
};

/** True for blocks whose minutes are the sum of their slots (vs a fixed budget). */
const isSlotTimedBlock = (block: SessionBlock): boolean =>
  block.type === 'main' || block.type === 'accessory';

/** Sum estimated minutes across a slot list. */
const sumSlotMinutes = (slots: readonly ExerciseSlot[]): number =>
  slots.reduce((acc, s) => acc + estimateSlotMinutes(s.scheme), 0);

/** Re-roll a block's minutes from its slots when it is slot-timed; else keep. */
const withBlockMinutes = (block: SessionBlock): SessionBlock =>
  isSlotTimedBlock(block) ? { ...block, estMinutes: sumSlotMinutes(block.slots) } : block;

/** Re-sum a session's minutes from its (already re-rolled) blocks. */
const withSessionMinutes = (session: TrainingSession): TrainingSession => ({
  ...session,
  estMinutes: session.blocks.reduce((acc, b) => acc + b.estMinutes, 0),
});

/** Re-sum a day's minutes from its sessions. */
const withDayMinutes = (day: PlanDay): PlanDay => ({
  ...day,
  estMinutes: day.sessions.reduce((acc, s) => acc + s.estMinutes, 0),
});

/** Build a fresh slot for `exercise`, sizing its scheme from the goal + role. */
export const buildSlot = (goal: Goal, exercise: ResolvedExercise): ExerciseSlot => {
  const scheme = schemeForRole(GOAL_PROFILES[goal], exercise.role, exercise.unilateral);
  const base: ExerciseSlot = {
    id: newSlotId(),
    exerciseSlug: exercise.slug,
    name: exercise.name,
    scheme,
    primaryMuscles: exercise.primaryMuscles,
    ...(exercise.role === 'main' ? { pyramid: true } : {}),
  };
  return exercise.cue === undefined ? base : { ...base, cue: exercise.cue };
};

/** Does this day hold a slot with `slotId` in any training session? */
const hasSlot = (day: PlanDay, slotId: string): boolean =>
  day.sessions.some(
    (s) => s.kind === 'training' && s.blocks.some((b) => b.slots.some((sl) => sl.id === slotId)),
  );

/** Map every training session in a day, leaving external sessions untouched. */
const mapTraining = (
  day: PlanDay,
  fn: (session: TrainingSession) => TrainingSession,
): readonly PlanSession[] => day.sessions.map((s) => (s.kind === 'training' ? fn(s) : s));

/**
 * Replace the exercise occupying `slotId` with `exercise`, keeping the slot's
 * id, prescription (scheme/pyramid), and any superset grouping — only its
 * identity (slug, name, primary muscles, cue) changes. Returns the updated
 * day, or `undefined` if no such slot exists. Preserving the id keeps any
 * sets already logged against the slot attributed to it (now credited to the
 * swapped-in exercise's muscles, since volume reads the slot's muscles live).
 */
export const swapSlotExercise = (
  day: PlanDay,
  slotId: string,
  exercise: ResolvedExercise,
): PlanDay | undefined => {
  if (!hasSlot(day, slotId)) return undefined;
  const relabel = (slot: ExerciseSlot): ExerciseSlot => {
    if (slot.id !== slotId) return slot;
    const { cue: _drop, ...rest } = slot;
    const next: ExerciseSlot = {
      ...rest,
      exerciseSlug: exercise.slug,
      name: exercise.name,
      primaryMuscles: exercise.primaryMuscles,
    };
    return exercise.cue === undefined ? next : { ...next, cue: exercise.cue };
  };
  const sessions = mapTraining(day, (session) =>
    withSessionMinutes({
      ...session,
      blocks: session.blocks.map((b) => withBlockMinutes({ ...b, slots: b.slots.map(relabel) })),
    }),
  );
  return withDayMinutes({ ...day, sessions });
};

/**
 * Append `exercise` as a new slot to the training session `sessionId`. It
 * lands in that session's accessory block (one is created, just before the
 * cool-down, when the session has none yet). Returns the updated day, or
 * `undefined` if the session is missing or is not a training session.
 */
export const addSlotToSession = (
  day: PlanDay,
  sessionId: string,
  goal: Goal,
  exercise: ResolvedExercise,
): PlanDay | undefined => {
  const target = day.sessions.find((s) => s.id === sessionId);
  if (target === undefined || target.kind !== 'training') return undefined;
  const slot = buildSlot(goal, exercise);

  const sessions = day.sessions.map((s) => {
    if (s.id !== sessionId || s.kind !== 'training') return s;
    const hasAccessory = s.blocks.some((b) => b.type === 'accessory');
    let blocks: SessionBlock[];
    if (hasAccessory) {
      blocks = s.blocks.map((b) =>
        b.type === 'accessory' ? withBlockMinutes({ ...b, slots: [...b.slots, slot] }) : b,
      );
    } else {
      const newBlock: SessionBlock = {
        type: 'accessory',
        title: 'Accessories',
        estMinutes: estimateSlotMinutes(slot.scheme),
        slots: [slot],
      };
      const cooldownAt = s.blocks.findIndex((b) => b.type === 'cooldown');
      const at = cooldownAt === -1 ? s.blocks.length : cooldownAt;
      blocks = [...s.blocks.slice(0, at), newBlock, ...s.blocks.slice(at)];
    }
    return withSessionMinutes({ ...s, blocks });
  });
  return withDayMinutes({ ...day, sessions });
};

/**
 * Remove the slot `slotId` from the day. A `main`/`accessory` block left with
 * no slots is dropped entirely. Returns the updated day, or `undefined` if no
 * such slot exists.
 */
export const removeSlot = (day: PlanDay, slotId: string): PlanDay | undefined => {
  if (!hasSlot(day, slotId)) return undefined;
  const sessions = mapTraining(day, (session) => {
    const blocks = session.blocks
      .map((b) => withBlockMinutes({ ...b, slots: b.slots.filter((sl) => sl.id !== slotId) }))
      .filter((b) => !(isSlotTimedBlock(b) && b.slots.length === 0));
    return withSessionMinutes({ ...session, blocks });
  });
  return withDayMinutes({ ...day, sessions });
};
