/**
 * @file packages/db/src/repos/logs-repo.ts
 *
 * Persistence for logged sets (the tracker's record of work done). Each
 * row is one set against a plan day's exercise slot, with load, reps, and
 * optional RPE.
 */

import { and, asc, eq, gte } from 'drizzle-orm';

import type { DayId, ExerciseSlug, LogId, SlotId } from '@grindform/core';

import type { DbOrTx } from '../client.ts';
import { setLogs } from '../schema/tables.ts';

/** A `set_logs` row as stored/returned. */
export type SetLog = typeof setLogs.$inferSelect;

/** The fields needed to record one logged set. */
export interface NewSetLog {
  readonly id: LogId;
  readonly dayId: DayId;
  readonly slotId: SlotId;
  readonly exerciseSlug: ExerciseSlug;
  readonly setNumber: number;
  readonly reps: number;
  readonly loadKg: number;
  readonly rpe?: number;
  readonly completedAt?: Date;
}

/** Insert one logged set and return the stored row. */
export const logSet = async (db: DbOrTx, entry: NewSetLog): Promise<SetLog> => {
  const row: SetLog = {
    id: entry.id,
    dayId: entry.dayId,
    slotId: entry.slotId,
    exerciseSlug: entry.exerciseSlug,
    setNumber: entry.setNumber,
    reps: entry.reps,
    loadKg: entry.loadKg,
    rpe: entry.rpe ?? null,
    completedAt: entry.completedAt ?? new Date(),
  };
  await db.insert(setLogs).values(row);
  return row;
};

/** Every logged set for a plan day, oldest first. */
export const listLogsForDay = async (db: DbOrTx, dayId: DayId): Promise<readonly SetLog[]> => {
  const rows = await db
    .select()
    .from(setLogs)
    .where(eq(setLogs.dayId, dayId))
    .orderBy(asc(setLogs.completedAt));
  return rows;
};

/** Every logged set for an exercise on or after `since`, oldest first. */
export const listLogsForExercise = async (
  db: DbOrTx,
  exerciseSlug: ExerciseSlug,
  since: Date,
): Promise<readonly SetLog[]> => {
  const rows = await db
    .select()
    .from(setLogs)
    .where(and(eq(setLogs.exerciseSlug, exerciseSlug), gte(setLogs.completedAt, since)))
    .orderBy(asc(setLogs.completedAt));
  return rows;
};

/** Delete a logged set. Returns whether a row was removed. */
export const deleteLog = async (db: DbOrTx, id: LogId): Promise<boolean> => {
  const deleted = await db.delete(setLogs).where(eq(setLogs.id, id)).returning({ id: setLogs.id });
  return deleted.length > 0;
};
