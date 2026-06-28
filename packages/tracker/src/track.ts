/**
 * @file packages/tracker/src/track.ts
 *
 * Thin orchestration over the DB repos: record sets as a workout is
 * performed, then read back day progress and progression suggestions.
 * The interesting logic lives in the pure modules; these functions just
 * generate ids, call repos, and feed results into the pure summarisers.
 */

import { newLogId } from '@grindform/core';
import type { DayId, ExerciseSlug, RepScheme } from '@grindform/core';
import type { ExerciseSlot, PlanDay } from '@grindform/planner';
import { listLogsForDay, listLogsForExercise, logSet } from '@grindform/db';
import type { DbOrTx, SetLog } from '@grindform/db';

import { summariseDay } from './progress.ts';
import type { DayProgress } from './progress.ts';
import { suggestProgression } from './progression.ts';
import type { ProgressionOptions, ProgressionSuggestion } from './progression.ts';
import { summariseDayVolume, summariseWeekVolume } from './volume.ts';
import type { VolumeSummary } from './volume.ts';

/** Details for logging a single set. */
export interface LogSetInput {
  readonly dayId: DayId;
  readonly slot: ExerciseSlot;
  readonly setNumber: number;
  readonly reps: number;
  readonly loadKg: number;
  readonly rpe?: number;
}

/** Record one set against a plan day's slot. */
export const logCompletedSet = async (db: DbOrTx, input: LogSetInput): Promise<SetLog> =>
  logSet(db, {
    id: newLogId(),
    dayId: input.dayId,
    slotId: input.slot.id,
    exerciseSlug: input.slot.exerciseSlug,
    setNumber: input.setNumber,
    reps: input.reps,
    loadKg: input.loadKg,
    ...(input.rpe === undefined ? {} : { rpe: input.rpe }),
  });

/** Details for marking a whole slot complete in one action. */
export interface MarkSlotCompleteInput {
  readonly dayId: DayId;
  readonly slot: ExerciseSlot;
  readonly loadKg: number;
  /** Reps per set; defaults to the top of the slot's prescribed range. */
  readonly reps?: number;
  readonly rpe?: number;
}

/**
 * Log every prescribed set for a slot at one load (the "tick the box"
 * action). Returns the stored logs in set order.
 */
export const markSlotComplete = async (
  db: DbOrTx,
  input: MarkSlotCompleteInput,
): Promise<readonly SetLog[]> => {
  const reps = input.reps ?? input.slot.scheme.repsHigh;
  const logs: SetLog[] = [];
  for (let setNumber = 1; setNumber <= input.slot.scheme.sets; setNumber += 1) {
    logs.push(
      await logCompletedSet(db, {
        dayId: input.dayId,
        slot: input.slot,
        setNumber,
        reps,
        loadKg: input.loadKg,
        ...(input.rpe === undefined ? {} : { rpe: input.rpe }),
      }),
    );
  }
  return logs;
};

/** Load a day's logs and summarise completion. */
export const getDayProgress = async (db: DbOrTx, day: PlanDay): Promise<DayProgress> => {
  const logs = await listLogsForDay(db, day.id);
  return summariseDay(day, logs);
};

/** Load a day's logs and summarise its volume (kg per muscle group). */
export const getDayVolume = async (db: DbOrTx, day: PlanDay): Promise<VolumeSummary> => {
  const logs = await listLogsForDay(db, day.id);
  return summariseDayVolume(day, logs);
};

/** Load every day's logs and summarise the whole week's volume. */
export const getWeekVolume = async (
  db: DbOrTx,
  days: readonly PlanDay[],
): Promise<VolumeSummary> => {
  const entries = await Promise.all(
    days.map(async (day) => ({ day, logs: await listLogsForDay(db, day.id) })),
  );
  return summariseWeekVolume(entries);
};

/** Number of days of history the progression heuristic looks back over. */
const DEFAULT_LOOKBACK_DAYS = 42;

/** Load recent history for an exercise and compute a progression suggestion. */
export const getProgressionSuggestion = async (
  db: DbOrTx,
  exerciseSlug: ExerciseSlug,
  scheme: RepScheme,
  options: ProgressionOptions & { lookbackDays?: number } = {},
): Promise<ProgressionSuggestion> => {
  const lookback = options.lookbackDays ?? DEFAULT_LOOKBACK_DAYS;
  const since = new Date(Date.now() - lookback * 24 * 60 * 60 * 1000);
  const history = await listLogsForExercise(db, exerciseSlug, since);
  return suggestProgression(history, scheme, options);
};
