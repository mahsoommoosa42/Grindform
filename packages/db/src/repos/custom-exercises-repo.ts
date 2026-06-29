/**
 * @file packages/db/src/repos/custom-exercises-repo.ts
 *
 * Persistence for user-authored custom exercises. Every read and write is
 * scoped to the owning {@link UserId}, so one account can never see or
 * mutate another's custom movements (guards against IDOR). Custom exercises
 * are intentionally absent from the code-defined catalog the generator
 * uses — they only ever surface for their author.
 */

import { and, asc, eq } from 'drizzle-orm';

import type { CustomExercise, CustomExerciseId, CustomExerciseInput, UserId } from '@grindform/core';
import { newCustomExerciseId } from '@grindform/core';

import type { DbOrTx } from '../client.ts';
import { customExercises } from '../schema/tables.ts';

/** A `custom_exercises` row as stored. */
type CustomExerciseRow = typeof customExercises.$inferSelect;

/** Reassemble a domain {@link CustomExercise} from its row, dropping a null cue. */
const mapRow = (row: CustomExerciseRow): CustomExercise => ({
  id: row.id,
  name: row.name,
  primaryMuscles: row.primaryMuscles,
  secondaryMuscles: row.secondaryMuscles,
  equipment: row.equipment,
  role: row.role,
  unilateral: row.unilateral,
  ...(row.cue === null ? {} : { cue: row.cue }),
});

/** Insert a new custom exercise for `userId` and return the stored value. */
export const createCustomExercise = async (
  db: DbOrTx,
  userId: UserId,
  input: CustomExerciseInput,
): Promise<CustomExercise> => {
  const id = newCustomExerciseId();
  await db.insert(customExercises).values({
    id,
    userId,
    name: input.name,
    primaryMuscles: input.primaryMuscles,
    secondaryMuscles: input.secondaryMuscles,
    equipment: input.equipment,
    role: input.role,
    unilateral: input.unilateral,
    cue: input.cue ?? null,
  });
  return { id, ...input };
};

/** List a user's custom exercises, oldest first (stable display order). */
export const listCustomExercises = async (
  db: DbOrTx,
  userId: UserId,
): Promise<readonly CustomExercise[]> => {
  const rows = await db
    .select()
    .from(customExercises)
    .where(eq(customExercises.userId, userId))
    .orderBy(asc(customExercises.createdAt), asc(customExercises.id));
  return rows.map(mapRow);
};

/** Load one custom exercise **only if** it belongs to `userId`; else `undefined`. */
export const getCustomExercise = async (
  db: DbOrTx,
  id: CustomExerciseId,
  userId: UserId,
): Promise<CustomExercise | undefined> => {
  const [row] = await db
    .select()
    .from(customExercises)
    .where(and(eq(customExercises.id, id), eq(customExercises.userId, userId)))
    .limit(1);
  return row === undefined ? undefined : mapRow(row);
};

/** Delete a custom exercise owned by `userId`. Returns whether a row was removed. */
export const deleteCustomExercise = async (
  db: DbOrTx,
  id: CustomExerciseId,
  userId: UserId,
): Promise<boolean> => {
  const deleted = await db
    .delete(customExercises)
    .where(and(eq(customExercises.id, id), eq(customExercises.userId, userId)))
    .returning({ id: customExercises.id });
  return deleted.length > 0;
};
