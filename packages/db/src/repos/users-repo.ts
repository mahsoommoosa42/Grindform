/**
 * @file packages/db/src/repos/users-repo.ts
 *
 * Persistence for accounts. Besides the obvious lookups, this owns two
 * cross-cutting operations:
 *
 * - {@link listUsersWithStats} — the admin console's user table, with a
 *   per-user plan count and a "last activity" timestamp.
 * - {@link deleteUserAndData} — the GDPR right-to-erasure path: a single
 *   transaction that removes the account and every row that belongs to
 *   it (plans → days, logged sets, settings, sessions). Audit rows are
 *   intentionally left behind so the deletion itself stays on record.
 */

import { and, count, desc, eq, inArray, max } from 'drizzle-orm';

import type { AccountStatus, UserId } from '@grindform/core';

import type { DbOrTx } from '../client.ts';
import { planDays, plans, sessions, setLogs, settings, users } from '../schema/tables.ts';

/** A `users` row as stored/returned. The password hash never leaves the repo layer casually. */
export type User = typeof users.$inferSelect;

/** Fields needed to create an account. */
export interface NewUser {
  readonly id: UserId;
  readonly email: string;
  readonly passwordHash: string;
  readonly role: User['role'];
  readonly status: AccountStatus;
  readonly termsAcceptedAt: Date;
}

/** A user row augmented with support-console statistics. */
export interface UserWithStats {
  readonly id: UserId;
  readonly email: string;
  readonly role: User['role'];
  readonly status: AccountStatus;
  readonly createdAt: Date;
  readonly lastLoginAt: Date | null;
  readonly planCount: number;
}

/** Insert a new account and return the stored row. */
export const createUser = async (db: DbOrTx, input: NewUser): Promise<User> => {
  const now = new Date();
  const row: User = {
    id: input.id,
    email: input.email,
    passwordHash: input.passwordHash,
    role: input.role,
    status: input.status,
    termsAcceptedAt: input.termsAcceptedAt,
    createdAt: now,
    updatedAt: now,
    lastLoginAt: null,
  };
  await db.insert(users).values(row);
  return row;
};

/** Look up an account by its (already-normalised) email. */
export const findUserByEmail = async (db: DbOrTx, email: string): Promise<User | undefined> => {
  const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return row;
};

/** Look up an account by id. */
export const findUserById = async (db: DbOrTx, id: UserId): Promise<User | undefined> => {
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return row;
};

/** Record a successful login's timestamp. */
export const touchLastLogin = async (db: DbOrTx, id: UserId, when: Date): Promise<void> => {
  await db.update(users).set({ lastLoginAt: when, updatedAt: when }).where(eq(users.id, id));
};

/**
 * Set an account's status (active/disabled). Returns the updated row, or
 * `undefined` if no such account exists.
 */
export const setUserStatus = async (
  db: DbOrTx,
  id: UserId,
  status: AccountStatus,
): Promise<User | undefined> => {
  const [row] = await db
    .update(users)
    .set({ status, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning();
  return row;
};

/**
 * Set an account's role (member/admin). Returns the updated row, or
 * `undefined` if no such account exists. Used by the admin bootstrap to
 * promote a pre-existing account to admin.
 */
export const setUserRole = async (
  db: DbOrTx,
  id: UserId,
  role: User['role'],
): Promise<User | undefined> => {
  const [row] = await db
    .update(users)
    .set({ role, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning();
  return row;
};

/** List every account with a plan count, newest first. For the admin console. */
export const listUsersWithStats = async (db: DbOrTx): Promise<readonly UserWithStats[]> => {
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
      status: users.status,
      createdAt: users.createdAt,
      lastLoginAt: users.lastLoginAt,
      planCount: count(plans.id),
    })
    .from(users)
    .leftJoin(plans, eq(plans.userId, users.id))
    .groupBy(users.id)
    .orderBy(desc(users.createdAt));
  return rows;
};

/**
 * Erase an account and all data belonging to it, in one transaction.
 * Returns `false` if the account didn't exist. Logged sets are keyed by
 * day id (no FK), so they're deleted explicitly before the plans cascade
 * removes the days.
 */
export const deleteUserAndData = async (db: DbOrTx, id: UserId): Promise<boolean> => {
  return db.transaction(async (tx) => {
    const planRows = await tx.select({ id: plans.id }).from(plans).where(eq(plans.userId, id));
    const planIds = planRows.map((r) => r.id);
    if (planIds.length > 0) {
      const dayRows = await tx
        .select({ id: planDays.id })
        .from(planDays)
        .where(inArray(planDays.planId, planIds));
      const dayIds = dayRows.map((r) => r.id);
      if (dayIds.length > 0) {
        await tx.delete(setLogs).where(inArray(setLogs.dayId, dayIds));
      }
      await tx.delete(plans).where(eq(plans.userId, id));
    }
    await tx.delete(settings).where(eq(settings.userId, id));
    await tx.delete(sessions).where(eq(sessions.userId, id));
    const deleted = await tx.delete(users).where(eq(users.id, id)).returning({ id: users.id });
    return deleted.length > 0;
  });
};

/** The most recent logged-set timestamp across a user's plans, or null. */
export const lastActivityFor = async (db: DbOrTx, id: UserId): Promise<Date | null> => {
  const [row] = await db
    .select({ last: max(setLogs.completedAt) })
    .from(setLogs)
    .innerJoin(planDays, eq(planDays.id, setLogs.dayId))
    .innerJoin(plans, and(eq(plans.id, planDays.planId), eq(plans.userId, id)));
  return row?.last ?? null;
};
