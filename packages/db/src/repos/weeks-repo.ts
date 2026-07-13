/**
 * Persistence for explicit calendar-week plan assignments.
 */

import { and, asc, eq, gte, lte } from 'drizzle-orm';

import type { PlanId, UserId, WeekStart } from '@grindform/core';

import type { DbOrTx } from '../client.ts';
import { weekAssignments } from '../schema/tables.ts';

export interface WeekAssignment {
  readonly id: string;
  readonly userId: UserId;
  readonly planId: PlanId;
  readonly weekStart: WeekStart;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

const mapAssignment = (row: typeof weekAssignments.$inferSelect): WeekAssignment => row;

export const assignWeek = async (
  db: DbOrTx,
  userId: UserId,
  weekStart: WeekStart,
  planId: PlanId,
): Promise<WeekAssignment> => {
  const id = `${userId}:${weekStart}`;
  const [row] = await db
    .insert(weekAssignments)
    .values({ id, userId, weekStart, planId })
    .onConflictDoUpdate({
      target: [weekAssignments.userId, weekAssignments.weekStart],
      set: { planId, updatedAt: new Date() },
    })
    .returning();
  return mapAssignment(row as typeof weekAssignments.$inferSelect);
};

export const unassignWeek = async (
  db: DbOrTx,
  userId: UserId,
  weekStart: WeekStart,
): Promise<boolean> => {
  const deleted = await db
    .delete(weekAssignments)
    .where(and(eq(weekAssignments.userId, userId), eq(weekAssignments.weekStart, weekStart)))
    .returning({ id: weekAssignments.id });
  return deleted.length > 0;
};

export const getWeekAssignment = async (
  db: DbOrTx,
  userId: UserId,
  weekStart: WeekStart,
): Promise<WeekAssignment | undefined> => {
  const [row] = await db
    .select()
    .from(weekAssignments)
    .where(and(eq(weekAssignments.userId, userId), eq(weekAssignments.weekStart, weekStart)))
    .limit(1);
  return row === undefined ? undefined : mapAssignment(row);
};

export const listWeekAssignments = async (
  db: DbOrTx,
  userId: UserId,
  from: WeekStart,
  to: WeekStart,
): Promise<readonly WeekAssignment[]> => {
  const rows = await db
    .select()
    .from(weekAssignments)
    .where(
      and(
        eq(weekAssignments.userId, userId),
        gte(weekAssignments.weekStart, from),
        lte(weekAssignments.weekStart, to),
      ),
    )
    .orderBy(asc(weekAssignments.weekStart));
  return rows.map(mapAssignment);
};
