import { and, asc, desc, eq, gte, inArray } from 'drizzle-orm';

import type { ProgramGenerationInput, ProgramId, UserId, WeekStart } from '@grindform/core';

import type { DbOrTx } from '../client.ts';
import { plans, programs, weekAssignments } from '../schema/tables.ts';

export interface ProgramRecord {
  readonly id: ProgramId;
  readonly userId: UserId;
  readonly startWeek: WeekStart;
  readonly weekCount: number;
  readonly input: ProgramGenerationInput;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ProgramWeekSummary {
  readonly weekStart: WeekStart;
  readonly kind: 'train' | 'deload' | 'break';
  readonly loadIndex: number;
  readonly planId: string | null;
}

export interface ProgramSummary extends ProgramRecord {
  readonly weeks: readonly ProgramWeekSummary[];
}

const mapProgram = (row: typeof programs.$inferSelect): ProgramRecord => ({
  id: row.id,
  userId: row.userId,
  startWeek: row.startWeek,
  weekCount: row.weekCount,
  input: row.input as ProgramGenerationInput,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const createProgram = async (
  db: DbOrTx,
  userId: UserId,
  input: ProgramGenerationInput,
  id: ProgramId,
): Promise<ProgramRecord> => {
  const [row] = await db
    .insert(programs)
    .values({
      id,
      userId,
      startWeek: input.startWeek,
      weekCount: input.weeks,
      input,
    })
    .returning();
  return mapProgram(row as typeof programs.$inferSelect);
};

export const getProgram = async (
  db: DbOrTx,
  userId: UserId,
  id: ProgramId,
): Promise<ProgramRecord | undefined> => {
  const [row] = await db
    .select()
    .from(programs)
    .where(and(eq(programs.id, id), eq(programs.userId, userId)))
    .limit(1);
  return row === undefined ? undefined : mapProgram(row);
};

export const listPrograms = async (
  db: DbOrTx,
  userId: UserId,
): Promise<readonly ProgramSummary[]> => {
  const rows = await db
    .select()
    .from(programs)
    .where(eq(programs.userId, userId))
    .orderBy(desc(programs.createdAt));
  const result: ProgramSummary[] = [];
  for (const row of rows) {
    const assignments = await db
      .select({
        weekStart: weekAssignments.weekStart,
        kind: weekAssignments.kind,
        planId: weekAssignments.planId,
        loadIndex: plans.programLoadIndex,
        programWeekIndex: plans.programWeekIndex,
      })
      .from(weekAssignments)
      .leftJoin(plans, eq(plans.id, weekAssignments.planId))
      .where(eq(weekAssignments.programId, row.id))
      .orderBy(asc(weekAssignments.weekStart));
    result.push({
      ...mapProgram(row),
      weeks: assignments.map((assignment) => ({
        weekStart: assignment.weekStart,
        kind: assignment.kind,
        loadIndex: assignment.loadIndex ?? 0,
        planId: assignment.planId,
        ...(assignment.programWeekIndex === null
          ? {}
          : { programWeekIndex: assignment.programWeekIndex }),
      })),
    });
  }
  return result;
};

export const deleteProgram = async (
  db: DbOrTx,
  userId: UserId,
  id: ProgramId,
): Promise<boolean> => {
  const deleted = await db
    .delete(programs)
    .where(and(eq(programs.id, id), eq(programs.userId, userId)))
    .returning({ id: programs.id });
  return deleted.length > 0;
};

export const deleteProgramFuture = async (
  db: DbOrTx,
  userId: UserId,
  programId: ProgramId,
  from: WeekStart,
): Promise<void> => {
  await db.transaction(async (tx) => {
    const assignments = await tx
      .select({ planId: weekAssignments.planId })
      .from(weekAssignments)
      .where(
        and(
          eq(weekAssignments.userId, userId),
          eq(weekAssignments.programId, programId),
          gte(weekAssignments.weekStart, from),
        ),
      );
    const planIds = assignments.flatMap((assignment) =>
      assignment.planId === null ? [] : [assignment.planId],
    );
    await tx
      .delete(weekAssignments)
      .where(
        and(
          eq(weekAssignments.userId, userId),
          eq(weekAssignments.programId, programId),
          gte(weekAssignments.weekStart, from),
        ),
      );
    if (planIds.length > 0) {
      await tx.delete(plans).where(and(eq(plans.userId, userId), inArray(plans.id, planIds)));
    }
  });
};

export const updateProgramWeekCount = async (
  db: DbOrTx,
  userId: UserId,
  programId: ProgramId,
  weekCount: number,
): Promise<boolean> => {
  const updated = await db
    .update(programs)
    .set({ weekCount, updatedAt: new Date() })
    .where(and(eq(programs.id, programId), eq(programs.userId, userId)))
    .returning({ id: programs.id });
  return updated.length > 0;
};
