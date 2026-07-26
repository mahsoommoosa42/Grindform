/**
 * @file packages/db/src/repos/plans-repo.ts
 *
 * Persistence for generated plans. A {@link WeeklyPlan} is stored as one
 * `plans` row plus one `plan_days` row per day (position-ordered); reads
 * reassemble the domain object. The catalog/planner value objects in the
 * JSON columns are stored verbatim.
 */

import { and, asc, desc, eq } from 'drizzle-orm';

import type {
  DayId,
  Goal,
  Experience,
  PlanId,
  ProgramId,
  ProgramWeekKind,
  UserId,
} from '@grindform/core';
import type { PlanDay, PlanSession, WeeklyPlan } from '@grindform/planner';

import type { DbOrTx } from '../client.ts';
import { planDays, plans, weekAssignments } from '../schema/tables.ts';

/** A lightweight plan listing entry (no days). */
export interface PlanSummary {
  readonly id: PlanId;
  readonly goal: Goal;
  readonly experience: Experience;
  readonly variation: 'A' | 'B';
  readonly isDefault: boolean;
  readonly createdAt: Date;
  readonly programId?: ProgramId;
  readonly programWeekIndex?: number;
  readonly programKind?: ProgramWeekKind;
  readonly programLoadIndex?: number;
}

/** A `plan_days` row as selected from the database. */
type PlanDayRow = typeof planDays.$inferSelect;

/** Reassemble a {@link PlanDay} from its row, dropping null optionals. */
const mapDay = (row: PlanDayRow): PlanDay => ({
  id: row.id,
  weekday: row.weekday,
  sessions: row.sessions,
  estMinutes: row.estMinutes,
  ...(row.label === null ? {} : { label: row.label }),
});

/** Insert a plan and all its days in a single transaction. */
export interface CreatePlanOptions {
  readonly programId?: ProgramId;
  readonly programWeekIndex?: number;
  readonly programKind?: ProgramWeekKind;
  readonly programLoadIndex?: number;
}

export const createPlan = async (
  db: DbOrTx,
  userId: UserId,
  plan: WeeklyPlan,
  options: CreatePlanOptions = {},
): Promise<void> => {
  await db.transaction(async (tx) => {
    await tx.insert(plans).values({
      id: plan.id,
      userId,
      ...(options.programId === undefined ? {} : { programId: options.programId }),
      ...(options.programWeekIndex === undefined && plan.weekIndex === undefined
        ? {}
        : { programWeekIndex: options.programWeekIndex ?? plan.weekIndex }),
      ...(options.programKind === undefined && plan.kind === undefined
        ? {}
        : { programKind: options.programKind ?? plan.kind }),
      ...(options.programLoadIndex === undefined && plan.loadIndex === undefined
        ? {}
        : { programLoadIndex: options.programLoadIndex ?? plan.loadIndex }),
      goal: plan.goal,
      experience: plan.experience,
      variation: plan.variation,
      timeBudget: plan.timeBudget,
    });
    for (const [position, day] of plan.days.entries()) {
      await tx.insert(planDays).values({
        id: day.id,
        planId: plan.id,
        position,
        weekday: day.weekday,
        label: day.label ?? null,
        sessions: day.sessions,
        estMinutes: day.estMinutes,
      });
    }
  });
};

/** Load a full plan (with ordered days), or `undefined` if not found. */
export const getPlan = async (db: DbOrTx, planId: PlanId): Promise<WeeklyPlan | undefined> => {
  const [planRow] = await db.select().from(plans).where(eq(plans.id, planId)).limit(1);
  if (planRow === undefined) return undefined;
  const dayRows = await db
    .select()
    .from(planDays)
    .where(eq(planDays.planId, planId))
    .orderBy(asc(planDays.position));
  return {
    id: planRow.id,
    goal: planRow.goal,
    experience: planRow.experience,
    variation: planRow.variation,
    timeBudget: planRow.timeBudget,
    days: dayRows.map(mapDay),
    ...(planRow.programId === null ? {} : { programId: planRow.programId }),
    ...(planRow.programWeekIndex === null ? {} : { weekIndex: planRow.programWeekIndex }),
    ...(planRow.programKind === null ? {} : { kind: planRow.programKind }),
    ...(planRow.programLoadIndex === null ? {} : { loadIndex: planRow.programLoadIndex }),
  };
};

/** List a user's plans, newest first. */
export const listPlanSummaries = async (
  db: DbOrTx,
  userId: UserId,
): Promise<readonly PlanSummary[]> => {
  const rows = await db
    .select({
      id: plans.id,
      goal: plans.goal,
      experience: plans.experience,
      variation: plans.variation,
      isDefault: plans.isDefault,
      createdAt: plans.createdAt,
      programId: plans.programId,
      programWeekIndex: plans.programWeekIndex,
      programKind: plans.programKind,
      programLoadIndex: plans.programLoadIndex,
    })
    .from(plans)
    .where(eq(plans.userId, userId))
    .orderBy(desc(plans.createdAt));
  return rows.map((row) => ({
    id: row.id,
    goal: row.goal,
    experience: row.experience,
    variation: row.variation,
    isDefault: row.isDefault,
    createdAt: row.createdAt,
    ...(row.programId === null ? {} : { programId: row.programId }),
    ...(row.programWeekIndex === null ? {} : { programWeekIndex: row.programWeekIndex }),
    ...(row.programKind === null ? {} : { programKind: row.programKind }),
    ...(row.programLoadIndex === null ? {} : { programLoadIndex: row.programLoadIndex }),
  }));
};

/** True iff `planId` exists and belongs to `userId`. Guards against IDOR. */
export const planBelongsToUser = async (
  db: DbOrTx,
  planId: PlanId,
  userId: UserId,
): Promise<boolean> => {
  const [row] = await db
    .select({ id: plans.id })
    .from(plans)
    .where(and(eq(plans.id, planId), eq(plans.userId, userId)))
    .limit(1);
  return row !== undefined;
};

/** Delete a plan owned by `userId` (cascading to its days). Returns whether a row was removed. */
export const deletePlan = async (db: DbOrTx, planId: PlanId, userId: UserId): Promise<boolean> => {
  const deleted = await db.transaction(async (tx) => {
    await tx.delete(weekAssignments).where(eq(weekAssignments.planId, planId));
    return tx
      .delete(plans)
      .where(and(eq(plans.id, planId), eq(plans.userId, userId)))
      .returning({ id: plans.id });
  });
  return deleted.length > 0;
};

/** Return the user's default plan, if one is configured. */
export const getDefaultPlan = async (db: DbOrTx, userId: UserId): Promise<PlanId | undefined> => {
  const [row] = await db
    .select({ id: plans.id })
    .from(plans)
    .where(and(eq(plans.userId, userId), eq(plans.isDefault, true)))
    .limit(1);
  return row?.id;
};

/** Make an owned plan the user's default, clearing any previous default. */
export const setDefaultPlan = async (
  db: DbOrTx,
  userId: UserId,
  planId: PlanId,
): Promise<boolean> => {
  const owned = await planBelongsToUser(db, planId, userId);
  if (!owned) return false;
  await db.transaction(async (tx) => {
    await tx.update(plans).set({ isDefault: false }).where(eq(plans.userId, userId));
    await tx
      .update(plans)
      .set({ isDefault: true, updatedAt: new Date() })
      .where(and(eq(plans.id, planId), eq(plans.userId, userId)));
  });
  return true;
};

/** Clear the default flag from an owned plan. */
export const clearDefaultPlan = async (
  db: DbOrTx,
  userId: UserId,
  planId: PlanId,
): Promise<boolean> => {
  const updated = await db
    .update(plans)
    .set({ isDefault: false, updatedAt: new Date() })
    .where(and(eq(plans.id, planId), eq(plans.userId, userId)))
    .returning({ id: plans.id });
  return updated.length > 0;
};

/** Every plan id belonging to a user (for export/erasure). */
export const listPlanIdsForUser = async (
  db: DbOrTx,
  userId: UserId,
): Promise<readonly PlanId[]> => {
  const rows = await db.select({ id: plans.id }).from(plans).where(eq(plans.userId, userId));
  return rows.map((r) => r.id);
};

/**
 * Load a plan day by id **only if** it belongs to a plan owned by `userId`,
 * returning the reassembled {@link PlanDay} (with its sessions) or
 * `undefined`. Lets callers validate that a logged set targets a slot that
 * actually exists in the user's own day, not just that the day is theirs.
 */
export const getDayForUser = async (
  db: DbOrTx,
  dayId: DayId,
  userId: UserId,
): Promise<PlanDay | undefined> => {
  const [row] = await db
    .select({
      id: planDays.id,
      planId: planDays.planId,
      position: planDays.position,
      weekday: planDays.weekday,
      label: planDays.label,
      sessions: planDays.sessions,
      estMinutes: planDays.estMinutes,
    })
    .from(planDays)
    .innerJoin(plans, eq(plans.id, planDays.planId))
    .where(and(eq(planDays.id, dayId), eq(plans.userId, userId)))
    .limit(1);
  return row === undefined ? undefined : mapDay(row);
};

/**
 * Overwrite a single day's sessions (and its recomputed minute estimate),
 * **only if** the day belongs to a plan owned by `userId`. Used by the
 * post-generation plan editors (swap / add / remove an exercise). Returns
 * whether a row was updated. Also bumps the parent plan's `updatedAt`.
 */
export const updateDaySessions = async (
  db: DbOrTx,
  dayId: DayId,
  userId: UserId,
  sessions: readonly PlanSession[],
  estMinutes: number,
): Promise<boolean> => {
  const [row] = await db
    .select({ planId: planDays.planId })
    .from(planDays)
    .innerJoin(plans, eq(plans.id, planDays.planId))
    .where(and(eq(planDays.id, dayId), eq(plans.userId, userId)))
    .limit(1);
  if (row === undefined) return false;
  await db.transaction(async (tx) => {
    await tx.update(planDays).set({ sessions, estMinutes }).where(eq(planDays.id, dayId));
    await tx.update(plans).set({ updatedAt: new Date() }).where(eq(plans.id, row.planId));
  });
  return true;
};

/** True iff `dayId` belongs to a plan owned by `userId`. Guards tracker IDOR. */
export const dayBelongsToUser = async (
  db: DbOrTx,
  dayId: DayId,
  userId: UserId,
): Promise<boolean> => {
  const [row] = await db
    .select({ id: planDays.id })
    .from(planDays)
    .innerJoin(plans, eq(plans.id, planDays.planId))
    .where(and(eq(planDays.id, dayId), eq(plans.userId, userId)))
    .limit(1);
  return row !== undefined;
};
