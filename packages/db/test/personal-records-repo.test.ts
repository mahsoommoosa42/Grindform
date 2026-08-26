import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { newUserId } from '@grindform/core';

import type { Db } from '../src/client.ts';
import { createUser } from '../src/repos/users-repo.ts';
import {
  deletePersonalRecord,
  listPersonalRecords,
  upsertPersonalRecord,
} from '../src/repos/personal-records-repo.ts';
import { freshDb } from './helpers/db.ts';

describe('personal-records-repo', () => {
  let db: Db;
  let dispose: () => Promise<void>;

  beforeEach(async () => {
    ({ db, dispose } = await freshDb());
  });
  afterEach(async () => {
    await dispose();
  });

  it('lists empty, upserts idempotently, and deletes one lift', async () => {
    const userId = newUserId();
    await createUser(db, {
      id: userId,
      email: 'records@example.com',
      passwordHash: 'hash',
      role: 'member',
      status: 'active',
      termsAcceptedAt: new Date(),
    });
    expect(await listPersonalRecords(db, userId)).toEqual([]);

    const inserted = await upsertPersonalRecord(db, userId, {
      lift: 'back_squat',
      weightKg: 100,
      reps: 5,
      oneRepMaxKg: 116.6667,
      achievedOn: '2026-01-02',
    });
    expect(inserted.oneRepMaxKg).toBe(116.6667);

    await upsertPersonalRecord(db, userId, {
      lift: 'back_squat',
      weightKg: 105,
      reps: 3,
      oneRepMaxKg: 115.5,
    });
    await upsertPersonalRecord(db, userId, {
      lift: 'bench_press',
      weightKg: 75,
      reps: 1,
      oneRepMaxKg: 75,
    });
    const records = await listPersonalRecords(db, userId);
    expect(records).toHaveLength(2);
    expect(records.find((record) => record.lift === 'back_squat')).toMatchObject({
      weightKg: 105,
      reps: 3,
      achievedOn: null,
    });
    expect(await deletePersonalRecord(db, userId, 'back_squat')).toBe(true);
    expect(await deletePersonalRecord(db, userId, 'back_squat')).toBe(false);
    expect((await listPersonalRecords(db, userId)).map((record) => record.lift)).toEqual([
      'bench_press',
    ]);
  });
});
