/**
 * Persistence for per-user canonical-lift personal records.
 */

import { asc, and, eq } from 'drizzle-orm';

import type { Lift, UserId } from '@grindform/core';

import type { DbOrTx } from '../client.ts';
import { personalRecords } from '../schema/tables.ts';

/** A stored personal-record row. */
export type PersonalRecordRow = typeof personalRecords.$inferSelect;

/** Fields needed to insert or replace one personal record. */
export interface PersonalRecordPatch {
  readonly lift: Lift;
  readonly weightKg: number;
  readonly reps: number;
  readonly oneRepMaxKg: number;
  readonly achievedOn?: string;
}

/** List all personal records for a user in canonical lift order. */
export const listPersonalRecords = async (
  db: DbOrTx,
  userId: UserId,
): Promise<readonly PersonalRecordRow[]> =>
  db
    .select()
    .from(personalRecords)
    .where(eq(personalRecords.userId, userId))
    .orderBy(asc(personalRecords.lift));

/** Insert or replace one user's record for one canonical lift. */
export const upsertPersonalRecord = async (
  db: DbOrTx,
  userId: UserId,
  patch: PersonalRecordPatch,
): Promise<PersonalRecordRow> => {
  const row: PersonalRecordRow = {
    userId,
    lift: patch.lift,
    weightKg: patch.weightKg,
    reps: patch.reps,
    oneRepMaxKg: patch.oneRepMaxKg,
    achievedOn: patch.achievedOn ?? null,
    updatedAt: new Date(),
  };
  await db
    .insert(personalRecords)
    .values(row)
    .onConflictDoUpdate({
      target: [personalRecords.userId, personalRecords.lift],
      set: {
        weightKg: row.weightKg,
        reps: row.reps,
        oneRepMaxKg: row.oneRepMaxKg,
        achievedOn: row.achievedOn,
        updatedAt: row.updatedAt,
      },
    });
  return row;
};

/** Delete one personal record; returns whether a row was removed. */
export const deletePersonalRecord = async (
  db: DbOrTx,
  userId: UserId,
  lift: Lift,
): Promise<boolean> => {
  const deleted = await db
    .delete(personalRecords)
    .where(and(eq(personalRecords.userId, userId), eq(personalRecords.lift, lift)))
    .returning({ lift: personalRecords.lift });
  return deleted.length > 0;
};
