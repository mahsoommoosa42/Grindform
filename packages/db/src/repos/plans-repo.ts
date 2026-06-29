/**
 * @file packages/db/src/repos/plans-repo.ts
 *
 * Persistence for generated plans. A {@link WeeklyPlan} is stored as one
 * `plans` row plus one `plan_days` row per day (position-ordered); reads
 * reassemble the domain object. The catalog/planner value objects in the
 * JSON columns are stored verbatim.
 */

import { and, asc, desc, eq } from 'drizzle-orm';

import type { DayId, Goal, Experience, PlanId, UserId } from '@grindform/core';
import type { PlanDay, PlanSession, WeeklyPlan } from '@grindform/planner';

import type { DbOrTx } from '../client.ts';
import { planDays, plans } from '../schema/tables.ts';

/** A lightweight plan listing entry (no days). */
export interface PlanSummary {
  readonly id: PlanId;
  readonly goal: Goal;
  readonly experience: Experience;
  readonly variation: 'A' | 'B';
  readonly createdAt: Date;
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
export const createPlan = async (db: DbOrTx, userId: UserId, plan: WeeklyPlan): Promise<void> => {
  await db.transaction(async (tx) => {
    await tx.insert(plans).values({
      id: plan.id,
      userId,
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
      createdAt: plans.createdAt,
    })
    .from(plans)
    .where(eq(plans.userId, userId))
    .orderBy(desc(plans.createdAt));
  return rows;
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
  const deleted = await db
    .delete(plans)
    .where(and(eq(plans.id, planId), eq(plans.userId, userId)))
    .returning({ id: plans.id });
  return deleted.length > 0;
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
