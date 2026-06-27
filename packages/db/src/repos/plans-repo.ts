/**
 * @file packages/db/src/repos/plans-repo.ts
 *
 * Persistence for generated plans. A {@link WeeklyPlan} is stored as one
 * `plans` row plus one `plan_days` row per day (position-ordered); reads
 * reassemble the domain object. The catalog/planner value objects in the
 * JSON columns are stored verbatim.
 */

import { asc, desc, eq } from 'drizzle-orm';

import type { Goal, Experience, PlanId, UserId } from '@grindform/core';
import type { PlanDay, WeeklyPlan } from '@grindform/planner';

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
  focus: row.focus,
  blocks: row.blocks,
  estMinutes: row.estMinutes,
  ...(row.activity === null ? {} : { activity: row.activity }),
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
        activity: day.activity ?? null,
        label: day.label ?? null,
        focus: day.focus,
        blocks: day.blocks,
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

/** Delete a plan (cascading to its days). Returns whether a row was removed. */
export const deletePlan = async (db: DbOrTx, planId: PlanId): Promise<boolean> => {
  const deleted = await db.delete(plans).where(eq(plans.id, planId)).returning({ id: plans.id });
  return deleted.length > 0;
};
