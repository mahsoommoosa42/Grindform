/**
 * @file packages/tracker/src/progress.ts
 *
 * Pure functions that turn a plan day plus its logged sets into a
 * completion summary. No I/O — the orchestration layer fetches the logs
 * and feeds them here, which keeps the "how complete is this session?"
 * logic trivially testable.
 */

import type { ExerciseSlug, SlotId } from '@grindform/core';
import type { ExerciseSlot, PlanDay, TrainingSession } from '@grindform/planner';
import type { SetLog } from '@grindform/db';

/** Completion status for a single exercise slot. */
export interface SlotProgress {
  readonly slotId: SlotId;
  readonly exerciseSlug: ExerciseSlug;
  readonly name: string;
  readonly setsPrescribed: number;
  readonly setsLogged: number;
  readonly complete: boolean;
  /** Heaviest load logged against this slot, if any sets were logged. */
  readonly topSetLoadKg?: number;
}

/** Completion status for a whole day. */
export interface DayProgress {
  readonly totalSlots: number;
  readonly completeSlots: number;
  /** Whole-number percentage in [0, 100]. */
  readonly percentComplete: number;
  readonly slots: readonly SlotProgress[];
}

/** Flatten the exercise slots across one training session's blocks. */
export const collectSessionSlots = (session: TrainingSession): readonly ExerciseSlot[] =>
  session.blocks.flatMap((b) => b.slots);

/**
 * Flatten the exercise slots across every training session in a day.
 * External sessions carry no slots and are skipped.
 */
export const collectSlots = (day: PlanDay): readonly ExerciseSlot[] =>
  day.sessions.flatMap((s) => (s.kind === 'training' ? collectSessionSlots(s) : []));

/** Summarise how much of a day has been completed, given its logged sets. */
export const summariseDay = (day: PlanDay, logs: readonly SetLog[]): DayProgress => {
  const slots = collectSlots(day);
  const slotProgress = slots.map((slot): SlotProgress => {
    const slotLogs = logs.filter((l) => l.slotId === slot.id);
    const base = {
      slotId: slot.id,
      exerciseSlug: slot.exerciseSlug,
      name: slot.name,
      setsPrescribed: slot.scheme.sets,
      setsLogged: slotLogs.length,
      complete: slotLogs.length >= slot.scheme.sets,
    };
    if (slotLogs.length === 0) return base;
    return { ...base, topSetLoadKg: Math.max(...slotLogs.map((l) => l.loadKg)) };
  });

  const completeSlots = slotProgress.filter((s) => s.complete).length;
  const totalSlots = slotProgress.length;
  const percentComplete = totalSlots === 0 ? 0 : Math.round((completeSlots / totalSlots) * 100);
  return { totalSlots, completeSlots, percentComplete, slots: slotProgress };
};
