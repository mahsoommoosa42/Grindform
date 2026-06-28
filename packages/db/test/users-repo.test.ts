import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  GeneratePlanInputSchema,
  isOk,
  newLogId,
  newSlotId,
  newUserId,
  parseExerciseSlug,
} from '@grindform/core';
import type { UserId } from '@grindform/core';
import { generatePlan } from '@grindform/planner';

import type { Db } from '../src/client.ts';
import { logSet } from '../src/repos/logs-repo.ts';
import { createPlan } from '../src/repos/plans-repo.ts';
import { upsertSettings } from '../src/repos/settings-repo.ts';
import {
  countAdmins,
  createUser,
  deleteUserAndData,
  findUserByEmail,
  findUserById,
  lastActivityFor,
  listUsersWithStats,
  setUserRole,
  setUserStatus,
  touchLastLogin,
  updateUserPassword,
} from '../src/repos/users-repo.ts';
import type { NewUser } from '../src/repos/users-repo.ts';
import { freshDb } from './helpers/db.ts';

const seed = (email: string): NewUser => ({
  id: newUserId(),
  email,
  passwordHash: '$scrypt$fake',
  role: 'member',
  status: 'active',
  termsAcceptedAt: new Date(),
});

const seedPlanWithLog = async (db: Db, userId: UserId): Promise<void> => {
  const r = generatePlan(
    GeneratePlanInputSchema.parse({
      goal: 'recomp',
      days: [{ weekday: 'mon', focus: ['glutes'] }],
    }),
  );
  if (!isOk(r)) throw new Error('plan generation failed');
  await createPlan(db, userId, r.value);
  const dayId = r.value.days[0]!.id;
  await logSet(db, {
    id: newLogId(),
    dayId,
    slotId: newSlotId(),
    exerciseSlug: parseExerciseSlug('barbell-hip-thrust'),
    setNumber: 1,
    reps: 8,
    loadKg: 60,
  });
};

describe('users-repo', () => {
  let db: Db;
  let dispose: () => Promise<void>;

  beforeEach(async () => {
    ({ db, dispose } = await freshDb());
  });
  afterEach(async () => {
    await dispose();
  });

  it('creates and looks up an account by email and id', async () => {
    const user = await createUser(db, seed('gargi@example.com'));
    expect(user.role).toBe('member');
    expect(user.lastLoginAt).toBeNull();
    expect((await findUserByEmail(db, 'gargi@example.com'))?.id).toBe(user.id);
    expect((await findUserById(db, user.id))?.email).toBe('gargi@example.com');
  });

  it('returns undefined for unknown email/id', async () => {
    expect(await findUserByEmail(db, 'nobody@example.com')).toBeUndefined();
    expect(await findUserById(db, newUserId())).toBeUndefined();
  });

  it('touches last-login and updates status', async () => {
    const user = await createUser(db, seed('a@example.com'));
    const when = new Date('2026-02-02T10:00:00.000Z');
    await touchLastLogin(db, user.id, when);
    expect((await findUserById(db, user.id))?.lastLoginAt?.toISOString()).toBe(when.toISOString());

    const disabled = await setUserStatus(db, user.id, 'disabled');
    expect(disabled?.status).toBe('disabled');
    expect(await setUserStatus(db, newUserId(), 'disabled')).toBeUndefined();
  });

  it('updates a role and reports undefined for an unknown id', async () => {
    const user = await createUser(db, seed('promote@example.com'));
    const promoted = await setUserRole(db, user.id, 'admin');
    expect(promoted?.role).toBe('admin');
    expect((await findUserById(db, user.id))?.role).toBe('admin');
    expect(await setUserRole(db, newUserId(), 'admin')).toBeUndefined();
  });

  it('updates a password hash and reports undefined for an unknown id', async () => {
    const user = await createUser(db, seed('pw@example.com'));
    const updated = await updateUserPassword(db, user.id, '$scrypt$new');
    expect(updated?.passwordHash).toBe('$scrypt$new');
    expect((await findUserById(db, user.id))?.passwordHash).toBe('$scrypt$new');
    expect(await updateUserPassword(db, newUserId(), '$scrypt$new')).toBeUndefined();
  });

  it('counts admin accounts', async () => {
    expect(await countAdmins(db)).toBe(0);
    const a = await createUser(db, seed('admin1@example.com'));
    await createUser(db, seed('member@example.com'));
    expect(await countAdmins(db)).toBe(0);
    await setUserRole(db, a.id, 'admin');
    expect(await countAdmins(db)).toBe(1);
  });

  it('lists users with a plan count, newest first', async () => {
    const a = await createUser(db, seed('a@example.com'));
    await new Promise((r) => setTimeout(r, 2));
    const b = await createUser(db, seed('b@example.com'));
    await seedPlanWithLog(db, a.id);

    const rows = await listUsersWithStats(db);
    expect(rows.map((r) => r.id)).toEqual([b.id, a.id]);
    const aRow = rows.find((r) => r.id === a.id);
    expect(aRow?.planCount).toBe(1);
    expect(rows.find((r) => r.id === b.id)?.planCount).toBe(0);
  });

  it('reports last activity from logged sets, or null', async () => {
    const user = await createUser(db, seed('a@example.com'));
    expect(await lastActivityFor(db, user.id)).toBeNull();
    await seedPlanWithLog(db, user.id);
    expect(await lastActivityFor(db, user.id)).toBeInstanceOf(Date);
  });

  it('erases an account and all of its data', async () => {
    const user = await createUser(db, seed('gone@example.com'));
    await upsertSettings(db, user.id, { theme: 'grind', preferences: {} });
    await seedPlanWithLog(db, user.id);

    expect(await deleteUserAndData(db, user.id)).toBe(true);
    expect(await findUserById(db, user.id)).toBeUndefined();
    expect(await lastActivityFor(db, user.id)).toBeNull();
    expect((await listUsersWithStats(db)).length).toBe(0);
  });

  it('erases an account that has no plans, and returns false for unknown ids', async () => {
    const user = await createUser(db, seed('empty@example.com'));
    expect(await deleteUserAndData(db, user.id)).toBe(true);
    expect(await deleteUserAndData(db, newUserId())).toBe(false);
  });
});
